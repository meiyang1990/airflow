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

import contextlib
import json
import textwrap
from collections.abc import Generator, Iterable
from typing import TYPE_CHECKING, Annotated, cast

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from itsdangerous import BadSignature, URLSafeSerializer
from pydantic import NonNegativeInt, PositiveInt
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import select

from airflow.api_fastapi.common.dagbag import DagBagDep
from airflow.api_fastapi.common.db.common import SessionDep
from airflow.api_fastapi.common.headers import HeaderAcceptJsonOrNdjson
from airflow.api_fastapi.common.router import AirflowRouter
from airflow.api_fastapi.common.types import Mimetype
from airflow.api_fastapi.core_api.datamodels.log import ExternalLogUrlResponse, TaskInstancesLogResponse
from airflow.api_fastapi.core_api.openapi.exceptions import create_openapi_http_exception_doc
from airflow.api_fastapi.core_api.security import DagAccessEntity, requires_access_dag
from airflow.configuration import conf
from airflow.exceptions import TaskNotFound
from airflow.models import TaskInstance, Trigger
from airflow.models.taskinstancehistory import TaskInstanceHistory
from airflow.utils.log.log_reader import TaskLogReader

if TYPE_CHECKING:
    from airflow.utils.log.file_task_handler import LogMetadata

_NDJSON_BATCH_SIZE = conf.getint("api", "log_stream_buffer_size")

task_instances_log_router = AirflowRouter(
    tags=["Task Instance"], prefix="/dags/{dag_id}/dagRuns/{dag_run_id}/taskInstances"
)

ndjson_example_response_for_get_log = {
    Mimetype.NDJSON: {
        "schema": {
            "type": "string",
            "example": textwrap.dedent(
                """\
    {"content": "content"}
    {"content": "content"}
    """
            ),
        }
    },
    Mimetype.TEXT: {"schema": {"type": "string", "format": "binary"}},
}


def _buffered_ndjson_stream(
    raw_stream: Iterable[str],
) -> Generator[str, None, None]:
    buf: list[str] = []
    for line in raw_stream:
        buf.append(line)
        if len(buf) >= _NDJSON_BATCH_SIZE:
            yield "".join(buf)
            buf.clear()
    if buf:
        yield "".join(buf)


def _plain_text_log_stream(raw_stream: Iterable[str]) -> Generator[str, None, None]:
    """Convert the structured NDJSON stream into a browser-downloadable text stream."""
    for line in raw_stream:
        try:
            event = json.loads(line).get("event")
        except (json.JSONDecodeError, AttributeError):
            event = None
        yield f"{event}\n" if isinstance(event, str) else line


@task_instances_log_router.get(
    "/{task_id}/logs/{try_number}",
    responses={
        **create_openapi_http_exception_doc([status.HTTP_404_NOT_FOUND]),
        status.HTTP_200_OK: {
            "description": "Successful Response",
            "content": ndjson_example_response_for_get_log,
        },
    },
    dependencies=[Depends(requires_access_dag("GET", DagAccessEntity.TASK_LOGS))],
    response_model=TaskInstancesLogResponse,
    response_model_exclude_unset=True,
)
def get_log(
    dag_id: str,
    dag_run_id: str,
    task_id: str,
    try_number: NonNegativeInt,
    accept: HeaderAcceptJsonOrNdjson,
    request: Request,
    dag_bag: DagBagDep,
    session: SessionDep,
    download: bool = False,
    full_content: bool = False,
    limit: Annotated[int | None, Query(gt=0, le=5000)] = None,
    map_index: int = -1,
    page_token: str | None = None,
    tail: bool = False,
    token: str | None = None,
):
    """
    Get logs for a specific task instance.

    Set ``limit`` with ``tail=true`` for an initial bounded latest page, then use the
    opaque page tokens returned by the response to navigate. Requests without a limit
    retain the legacy response behavior. Set ``download=true`` to stream the complete
    selected attempt as a text attachment.
    """
    if not token:
        metadata = {}
    else:
        try:
            metadata = URLSafeSerializer(request.app.state.secret_key).loads(token)
        except BadSignature:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Bad Signature. Please use only the tokens provided by the API."
            )

    if metadata.get("download_logs") and metadata["download_logs"]:
        full_content = True

    if download:
        full_content = True

    metadata["download_logs"] = full_content

    page_start = None
    if page_token and limit is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A page token requires a page limit.")
    if page_token:
        try:
            page_metadata = URLSafeSerializer(request.app.state.secret_key).loads(page_token)
        except BadSignature:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bad Signature. Please use a valid page token.")
        expected_scope = [dag_id, dag_run_id, task_id, map_index, try_number]
        if page_metadata.get("scope") != expected_scope:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Page token does not match this task instance.")
        page_start = page_metadata.get("start")
        if not isinstance(page_start, int) or page_start < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Page token has an invalid position.")
        if page_metadata.get("direction") not in {"next", "previous"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Page token has an invalid direction.")
        cursor_metadata = page_metadata.get("metadata", {})
        if not isinstance(cursor_metadata, dict):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Page token has invalid handler metadata.")
        metadata = cursor_metadata
        tail = False

    task_log_reader = TaskLogReader()

    if not task_log_reader.supports_read:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Task log handler does not support read logs.")

    query = (
        select(TaskInstance)
        .where(
            TaskInstance.task_id == task_id,
            TaskInstance.dag_id == dag_id,
            TaskInstance.run_id == dag_run_id,
            TaskInstance.map_index == map_index,
            TaskInstance.try_number == try_number,
        )
        .join(TaskInstance.dag_run)
        .options(joinedload(TaskInstance.trigger).joinedload(Trigger.triggerer_job))
        .options(joinedload(TaskInstance.dag_model))
    )
    ti = session.scalar(query)
    if ti is None:
        query = (
            select(TaskInstanceHistory)
            .where(
                TaskInstanceHistory.task_id == task_id,
                TaskInstanceHistory.dag_id == dag_id,
                TaskInstanceHistory.run_id == dag_run_id,
                TaskInstanceHistory.map_index == map_index,
                TaskInstanceHistory.try_number == try_number,
            )
            .options(joinedload(TaskInstanceHistory.dag_run))
            # we need to joinedload the dag_run, since FileTaskHandler._render_filename needs ti.dag_run
        )
        ti = session.scalar(query)

    if ti is None:
        metadata["end_of_log"] = True
        raise HTTPException(status.HTTP_404_NOT_FOUND, "TaskInstance not found")

    dag = dag_bag.get_dag_for_run(ti.dag_run, session=session)
    if dag:
        with contextlib.suppress(TaskNotFound):
            ti.task = dag.get_task(ti.task_id)

    if download:
        raw_stream = task_log_reader.read_log_stream(ti, try_number, metadata)  # type: ignore[arg-type]
        safe_filename = f"{dag_id}-{task_id}-try-{try_number}.log".replace('"', "")
        return StreamingResponse(
            media_type="text/plain; charset=utf-8",
            content=_plain_text_log_stream(raw_stream),
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
        )

    if limit is not None:
        if accept == Mimetype.NDJSON:
            raise HTTPException(status.HTTP_406_NOT_ACCEPTABLE, "Bounded log reads require application/json.")
        page, out_metadata = task_log_reader.read_log_page(
            ti,
            try_number,
            cast("LogMetadata", metadata),
            limit=limit,
            start=page_start,
            tail=tail,  # type: ignore[arg-type]
        )
        scope = [dag_id, dag_run_id, task_id, map_index, try_number]
        serializer = URLSafeSerializer(request.app.state.secret_key)
        previous_page_token = None
        if page.start > 0 and task_log_reader.supports_older_log_pages:
            previous_page_token = serializer.dumps(
                {
                    "direction": "previous",
                    "metadata": metadata,
                    "scope": scope,
                    "start": max(0, page.start - limit),
                }
            )
        next_page_token = None
        if page.has_more_after:
            next_page_token = serializer.dumps(
                {
                    "direction": "next",
                    "metadata": metadata,
                    "scope": scope,
                    "start": page.start + len(page.content),
                }
            )
        encoded_token = None
        if not page.has_more_after and not out_metadata.get("end_of_log", False):
            encoded_token = serializer.dumps(out_metadata)
        return TaskInstancesLogResponse.model_construct(
            content=page.content,
            continuation_token=encoded_token,
            next_page_token=next_page_token,
            previous_page_token=previous_page_token,
        )

    if accept == Mimetype.NDJSON:  # only specified application/x-ndjson will return streaming response
        # LogMetadata(TypedDict) is used as type annotation for log_reader; added ignore to suppress mypy error
        raw_stream = task_log_reader.read_log_stream(ti, try_number, metadata)  # type: ignore[arg-type]
        log_stream = _buffered_ndjson_stream(raw_stream)
        headers = None
        if not metadata.get("end_of_log", False):
            headers = {
                "Airflow-Continuation-Token": URLSafeSerializer(request.app.state.secret_key).dumps(metadata)
            }
        return StreamingResponse(media_type="application/x-ndjson", content=log_stream, headers=headers)

    # application/json, or something else we don't understand.
    # Return JSON format, which will be more easily for users to debug.

    # LogMetadata(TypedDict) is used as type annotation for log_reader; added ignore to suppress mypy error
    structured_log_stream, out_metadata = task_log_reader.read_log_chunks(ti, try_number, metadata)  # type: ignore[arg-type]
    encoded_token = None
    if not out_metadata.get("end_of_log", False):
        encoded_token = URLSafeSerializer(request.app.state.secret_key).dumps(out_metadata)
    return TaskInstancesLogResponse.model_construct(
        continuation_token=encoded_token, content=list(structured_log_stream)
    )


@task_instances_log_router.get(
    "/{task_id}/externalLogUrl/{try_number}",
    responses=create_openapi_http_exception_doc([status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND]),
    dependencies=[Depends(requires_access_dag("GET", DagAccessEntity.TASK_LOGS))],
)
def get_external_log_url(
    dag_id: str,
    dag_run_id: str,
    task_id: str,
    try_number: PositiveInt,
    session: SessionDep,
    map_index: int = -1,
) -> ExternalLogUrlResponse:
    """Get external log URL for a specific task instance."""
    task_log_reader = TaskLogReader()

    if not task_log_reader.supports_external_link:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Task log handler does not support external logs.")

    # Fetch the task instance
    query = (
        select(TaskInstance)
        .where(
            TaskInstance.task_id == task_id,
            TaskInstance.dag_id == dag_id,
            TaskInstance.run_id == dag_run_id,
            TaskInstance.map_index == map_index,
        )
        .options(joinedload(TaskInstance.dag_model))
    )
    ti = session.scalar(query)

    if ti is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "TaskInstance not found")

    url = task_log_reader.log_handler.get_external_log_url(ti, try_number)
    return ExternalLogUrlResponse(url=url)
