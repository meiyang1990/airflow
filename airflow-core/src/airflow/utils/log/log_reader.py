# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from __future__ import annotations

import logging
import os
import time
from collections import deque
from collections.abc import Generator, Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import cached_property
from typing import TYPE_CHECKING

from airflow.configuration import conf
from airflow.utils.log.file_task_handler import FileTaskHandler, StructuredLogMessage
from airflow.utils.log.logging_mixin import ExternalLoggingMixin
from airflow.utils.state import TaskInstanceState

if TYPE_CHECKING:
    from typing import TypeAlias

    from airflow.models.taskinstance import TaskInstance
    from airflow.models.taskinstancehistory import TaskInstanceHistory
    from airflow.utils.log.file_task_handler import LogHandlerOutputStream, LogMetadata

LogReaderOutputStream: TypeAlias = Generator[str, None, None]

READ_BATCH_SIZE = 1024
MAX_LOG_PAGE_BYTES = 5 * 1024 * 1024


@dataclass
class TaskLogPage:
    """A bounded page of task-log entries."""

    content: list[StructuredLogMessage]
    has_more_after: bool
    start: int


def _read_page_from_stream(
    log_stream: LogHandlerOutputStream,
    *,
    limit: int,
    max_bytes: int = MAX_LOG_PAGE_BYTES,
    start: int | None,
    tail: bool,
) -> TaskLogPage:
    """Read a bounded page without building a complete in-memory log list."""
    if tail:
        tail_entries: deque[StructuredLogMessage] = deque()
        entry_sizes: deque[int] = deque()
        retained_bytes = 0
        total = 0
        for entry in log_stream:
            entry_size = len(entry.model_dump_json().encode())
            tail_entries.append(entry)
            entry_sizes.append(entry_size)
            retained_bytes += entry_size
            total += 1
            while len(tail_entries) > 1 and (len(tail_entries) > limit or retained_bytes > max_bytes):
                tail_entries.popleft()
                retained_bytes -= entry_sizes.popleft()
        return TaskLogPage(
            content=list(tail_entries),
            has_more_after=False,
            start=max(0, total - len(tail_entries)),
        )

    page_start = start or 0
    entries: list[StructuredLogMessage] = []
    retained_bytes = 0
    has_more_after = False
    for index, entry in enumerate(log_stream):
        if index < page_start:
            continue
        entry_size = len(entry.model_dump_json().encode())
        if len(entries) == limit or (entries and retained_bytes + entry_size > max_bytes):
            has_more_after = True
            break
        entries.append(entry)
        retained_bytes += entry_size
    return TaskLogPage(content=entries, has_more_after=has_more_after, start=page_start)


class TaskLogReader:
    """Task log reader."""

    STREAM_LOOP_SLEEP_SECONDS = 1
    """Time to sleep between loops while waiting for more logs"""

    STREAM_LOOP_STOP_AFTER_EMPTY_ITERATIONS = 10
    """Number of empty loop iterations before stopping the stream"""

    @staticmethod
    def get_no_log_state_message(ti: TaskInstance | TaskInstanceHistory) -> Iterator[StructuredLogMessage]:
        """Yield standardized no-log messages for a given TI state."""
        if ti.state == TaskInstanceState.SKIPPED:
            msg = "Task was skipped — no logs available."
        elif ti.state == TaskInstanceState.UPSTREAM_FAILED:
            msg = "Task did not run because upstream task(s) failed."
        else:
            msg = "No logs available for this task."

        yield StructuredLogMessage(
            timestamp=None,
            event="::group::Log message source details",
        )
        yield StructuredLogMessage(timestamp=None, event="::endgroup::")
        yield StructuredLogMessage(
            timestamp=ti.updated_at or datetime.now(timezone.utc),
            event=msg,
        )

    def read_log_chunks(
        self,
        ti: TaskInstance | TaskInstanceHistory,
        try_number: int | None,
        metadata: LogMetadata,
    ) -> tuple[LogHandlerOutputStream, LogMetadata]:
        """
        Read chunks of Task Instance logs.

        :param ti: The taskInstance
        :param try_number:
        :param metadata: A dictionary containing information about how to read the task log

        The following is an example of how to use this method to read log:

        .. code-block:: python

            logs, metadata = task_log_reader.read_log_chunks(ti, try_number, metadata)
            logs = logs[0] if try_number is not None else logs

        where task_log_reader is an instance of TaskLogReader. The metadata will always
        contain information about the task log which can enable you read logs to the
        end.
        """
        if try_number == 0:
            msg = self.get_no_log_state_message(ti)  # returns StructuredLogMessage
            # one message + tell the caller it's the end so stream stops
            return msg, {"end_of_log": True}

        return self.log_handler.read(ti, try_number, metadata=metadata)

    def read_log_stream(
        self,
        ti: TaskInstance | TaskInstanceHistory,
        try_number: int | None,
        metadata: LogMetadata,
    ) -> Iterator[str]:
        """
        Continuously read log to the end.

        :param ti: The Task Instance
        :param try_number: the task try number
        :param metadata: A dictionary containing information about how to read the task log
        """
        if try_number is None:
            try_number = ti.try_number

        # Handle skipped / upstream_failed case directly
        if try_number == 0:
            for msg in self.get_no_log_state_message(ti):
                yield f"{msg.model_dump_json()}\n"
            return

        for key in ("end_of_log", "max_offset", "offset", "log_pos"):
            # https://mypy.readthedocs.io/en/stable/typed_dict.html#supported-operations
            metadata.pop(key, None)  # type: ignore[misc]
        empty_iterations = 0

        while True:
            log_stream, out_metadata = self.read_log_chunks(ti, try_number, metadata)
            yield from (f"{log.model_dump_json()}\n" for log in log_stream)

            if not out_metadata.get("end_of_log", False) and ti.state not in (
                TaskInstanceState.RUNNING,
                TaskInstanceState.DEFERRED,
            ):
                if log_stream:
                    empty_iterations = 0
                else:
                    # we did not receive any logs in this loop
                    # sleeping to conserve resources / limit requests on external services
                    time.sleep(self.STREAM_LOOP_SLEEP_SECONDS)
                    empty_iterations += 1
                    if empty_iterations >= self.STREAM_LOOP_STOP_AFTER_EMPTY_ITERATIONS:
                        # we have not received any logs for a while, so we stop the stream
                        # this is emitted as json to avoid breaking the ndjson stream format
                        yield '{"event": "Log stream stopped - End of log marker not found; logs may be incomplete."}\n'
                        return
            else:
                # https://mypy.readthedocs.io/en/stable/typed_dict.html#supported-operations
                metadata.clear()  # type: ignore[attr-defined]
                metadata.update(out_metadata)
                return

    def read_log_page(
        self,
        ti: TaskInstance | TaskInstanceHistory,
        try_number: int | None,
        metadata: LogMetadata,
        *,
        limit: int,
        start: int | None = None,
        tail: bool = False,
    ) -> tuple[TaskLogPage, LogMetadata]:
        """
        Read one bounded page of task logs.

        The underlying handler remains responsible for producing correctly ordered
        structured entries. This method intentionally retains no more than one page
        in memory while consuming that stream.
        """
        page_metadata = dict(metadata)
        if self.supports_older_log_pages:
            # FileTaskHandler can stream bounded requests directly instead of first
            # accumulating the complete source stream in its temporary spill file.
            page_metadata["_bounded_read"] = True  # type: ignore[typeddict-unknown-key]
        log_stream, out_metadata = self.read_log_chunks(ti, try_number, page_metadata)  # type: ignore[arg-type]
        return _read_page_from_stream(log_stream, limit=limit, start=start, tail=tail), out_metadata

    @cached_property
    def log_handler(self):
        """Get the log handler which is configured to read logs."""
        task_log_reader = conf.get("logging", "task_log_reader")

        def handlers():
            """
            Yield all handlers first from airflow.task logger then root logger.

            Depending on whether we're in a running task, it could be in either of these locations.
            """
            yield from logging.getLogger("airflow.task").handlers
            yield from logging.getLogger().handlers

            fallback = FileTaskHandler(os.devnull)
            fallback.name = task_log_reader
            yield fallback

        return next((h for h in handlers() if h.name == task_log_reader), None)

    @property
    def supports_read(self):
        """Checks if a read operation is supported by a current log handler."""
        return hasattr(self.log_handler, "read")

    @property
    def supports_older_log_pages(self) -> bool:
        """Whether the configured handler can safely advertise backward page navigation."""
        return isinstance(self.log_handler, FileTaskHandler) and not isinstance(
            self.log_handler, ExternalLoggingMixin
        )

    @property
    def supports_external_link(self) -> bool:
        """Check if the logging handler supports external links (e.g. to Elasticsearch, Stackdriver, etc)."""
        if not isinstance(self.log_handler, ExternalLoggingMixin):
            return False

        return self.log_handler.supports_external_link
