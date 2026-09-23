#
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

import hashlib
import json
import re
from collections.abc import Sequence
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from airflow.api_fastapi.common.dagbag import DagBagDep
from airflow.configuration import conf
from airflow.exceptions import TaskNotFound
from airflow.models import DagRun
from airflow.models.task_instance_ai_diagnosis import (
    AI_DIAGNOSIS_STATUS_SUCCESS,
    TaskInstanceAIDiagnosis,
    get_task_instance_ai_diagnosis,
)
from airflow.models.taskinstance import TaskInstance
from airflow.models.taskinstancehistory import TaskInstanceHistory
from airflow.utils.log.log_reader import TaskLogReader
from airflow.utils.state import TaskInstanceState

AI_DIAGNOSIS_SECTION = "ai_diagnosis"
DEFAULT_MCP_LLM_PROXY_URL = "http://zerith-common-mcp-server.bigdata.svc.cluster.local:8000/llm/proxy"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 70
DEFAULT_CONTEXT_START_LINE = 18
DEFAULT_CONTEXT_END_LINE = 140
DEFAULT_TAIL_LINES = 300


class AIDiagnosisDisabledError(Exception):
    """Raised when AI diagnosis is disabled by configuration."""


class AIDiagnosisTaskNotFoundError(Exception):
    """Raised when the requested task instance attempt is not found."""


class AIDiagnosisInvalidTaskStateError(Exception):
    """Raised when the task instance is not failed."""


class AIDiagnosisLogReadError(Exception):
    """Raised when task logs cannot be read."""


class AIDiagnosisLLMProxyError(Exception):
    """Raised when the LLM proxy cannot generate a diagnosis."""


def is_ai_diagnosis_enabled() -> bool:
    """Return whether task instance AI diagnosis is enabled."""
    return conf.getboolean(AI_DIAGNOSIS_SECTION, "enabled", fallback=False)


def diagnose_task_instance(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    dag_bag: DagBagDep,
    session,
) -> tuple[TaskInstanceAIDiagnosis, bool]:
    """Return a cached or newly generated AI diagnosis for a failed task instance attempt."""
    if not is_ai_diagnosis_enabled():
        raise AIDiagnosisDisabledError("AI diagnosis is disabled")

    cached = get_task_instance_ai_diagnosis(
        dag_id=dag_id,
        run_id=run_id,
        task_id=task_id,
        map_index=map_index,
        try_number=try_number,
        session=session,
    )
    if cached is not None and cached.status == AI_DIAGNOSIS_STATUS_SUCCESS:
        return cached, True

    ti = _get_task_instance_attempt(
        dag_id=dag_id,
        run_id=run_id,
        task_id=task_id,
        map_index=map_index,
        try_number=try_number,
        session=session,
    )
    if ti is None:
        raise AIDiagnosisTaskNotFoundError("Task instance attempt not found")
    if ti.state != TaskInstanceState.FAILED:
        raise AIDiagnosisInvalidTaskStateError("AI diagnosis is only available for failed task instances")

    _attach_task_to_ti(ti, dag_bag=dag_bag, session=session)
    log_lines = _read_log_lines(ti, try_number=try_number)
    excerpt_lines = extract_diagnosis_log_excerpt(
        log_lines,
        context_start_line=conf.getint(
            AI_DIAGNOSIS_SECTION, "log_context_start_line", fallback=DEFAULT_CONTEXT_START_LINE
        ),
        context_end_line=conf.getint(
            AI_DIAGNOSIS_SECTION, "log_context_end_line", fallback=DEFAULT_CONTEXT_END_LINE
        ),
        tail_lines=conf.getint(AI_DIAGNOSIS_SECTION, "log_tail_lines", fallback=DEFAULT_TAIL_LINES),
    )
    excerpt = "\n".join(excerpt_lines)
    response = _call_llm_proxy(
        messages=[
            {
                "role": "system",
                "content": (
                    "你是 Apache Airflow 任务失败诊断助手。"
                    "只能根据用户提供的任务元数据和日志判断，不要编造日志中不存在的信息。"
                    "请严格返回 JSON，格式为："
                    '{"summary": "一句话总结", "items": ['
                    '{"category": "根因|证据|建议|风险", "finding": "诊断结论", '
                    '"evidence": "日志证据", "suggestion": "修复建议", "confidence": "高|中|低"}'
                    "]}。"
                ),
            },
            {
                "role": "user",
                "content": _build_user_prompt(
                    dag_id=dag_id,
                    run_id=run_id,
                    task_id=task_id,
                    map_index=map_index,
                    try_number=try_number,
                    state=str(ti.state) if ti.state is not None else None,
                    log_line_count=len(log_lines),
                    excerpt_lines=excerpt_lines,
                ),
            },
        ]
    )
    summary, items = _parse_model_content(response.get("content"))
    diagnosis = TaskInstanceAIDiagnosis(
        dag_id=dag_id,
        run_id=run_id,
        task_id=task_id,
        map_index=map_index,
        try_number=try_number,
        state=str(ti.state) if ti.state is not None else None,
        log_line_count=len(log_lines),
        log_excerpt_sha256=hashlib.sha256(excerpt.encode("utf-8")).hexdigest(),
        llm_request_id=response.get("request_id"),
        provider=response.get("provider"),
        model=response.get("model"),
        summary=summary,
        diagnosis_items=items,
        raw_response=response.get("content"),
    )
    session.add(diagnosis)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        cached = get_task_instance_ai_diagnosis(
            dag_id=dag_id,
            run_id=run_id,
            task_id=task_id,
            map_index=map_index,
            try_number=try_number,
            session=session,
        )
        if cached is not None:
            return cached, True
        raise
    return diagnosis, False


def extract_diagnosis_log_excerpt(
    lines: Sequence[str],
    *,
    context_start_line: int = DEFAULT_CONTEXT_START_LINE,
    context_end_line: int = DEFAULT_CONTEXT_END_LINE,
    tail_lines: int = DEFAULT_TAIL_LINES,
) -> list[str]:
    """Extract context and tail log lines using 1-based inclusive line numbers."""
    if not lines:
        return []

    selected_indexes: list[int] = []
    if context_start_line <= context_end_line and len(lines) >= context_start_line:
        selected_indexes.extend(range(context_start_line - 1, min(context_end_line, len(lines))))
    if tail_lines > 0:
        selected_indexes.extend(range(max(len(lines) - tail_lines, 0), len(lines)))

    seen = set()
    excerpt = []
    for index in sorted(selected_indexes):
        if index not in seen:
            excerpt.append(lines[index])
            seen.add(index)
    return excerpt


def _get_task_instance_attempt(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    session,
) -> TaskInstance | TaskInstanceHistory | None:
    query = (
        select(TaskInstance)
        .where(
            TaskInstance.dag_id == dag_id,
            TaskInstance.run_id == run_id,
            TaskInstance.task_id == task_id,
            TaskInstance.map_index == map_index,
            TaskInstance.try_number == try_number,
        )
        .join(TaskInstance.dag_run)
        .options(joinedload(TaskInstance.dag_run).options(joinedload(DagRun.dag_model)))
    )
    ti = session.scalar(query)
    if ti is not None:
        return ti

    return session.scalar(
        select(TaskInstanceHistory)
        .where(
            TaskInstanceHistory.dag_id == dag_id,
            TaskInstanceHistory.run_id == run_id,
            TaskInstanceHistory.task_id == task_id,
            TaskInstanceHistory.map_index == map_index,
            TaskInstanceHistory.try_number == try_number,
        )
        .options(joinedload(TaskInstanceHistory.dag_run))
    )


def _attach_task_to_ti(ti: TaskInstance | TaskInstanceHistory, *, dag_bag: DagBagDep, session) -> None:
    dag = dag_bag.get_dag_for_run(ti.dag_run, session=session)
    if dag:
        try:
            ti.task = dag.get_task(ti.task_id)
        except TaskNotFound:
            pass


def _read_log_lines(ti: TaskInstance | TaskInstanceHistory, *, try_number: int) -> list[str]:
    task_log_reader = TaskLogReader()
    if not task_log_reader.supports_read:
        raise AIDiagnosisLogReadError("Task log handler does not support read logs")

    metadata = {"download_logs": True}
    log_stream, _ = task_log_reader.read_log_chunks(ti, try_number, metadata)  # type: ignore[arg-type]
    lines: list[str] = []
    for datum in log_stream:
        lines.extend(_stringify_log_datum(datum).splitlines() or [""])
    return lines


def _stringify_log_datum(datum: Any) -> str:
    if isinstance(datum, str):
        return datum

    model_dump = getattr(datum, "model_dump", None)
    if callable(model_dump):
        data = model_dump(mode="json", exclude_none=True)
        if set(data) == {"event"}:
            return str(data["event"])
        return json.dumps(data, ensure_ascii=False, default=str)

    event = getattr(datum, "event", None)
    if isinstance(event, str):
        return event
    return str(datum)


def _build_user_prompt(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    state: str | None,
    log_line_count: int,
    excerpt_lines: Sequence[str],
) -> str:
    return "\n".join(
        [
            "请诊断这个 Airflow 任务失败原因。",
            "",
            "任务信息:",
            f"- dag_id: {dag_id}",
            f"- run_id: {run_id}",
            f"- task_id: {task_id}",
            f"- map_index: {map_index}",
            f"- try_number: {try_number}",
            f"- state: {state}",
            f"- 原始日志总行数: {log_line_count}",
            "",
            "日志摘录说明:",
            "- 包含原始日志第 18 到第 140 行。",
            "- 包含原始日志最后 300 行。",
            "- 如果两段重叠，已按原始顺序去重。",
            "",
            "日志摘录:",
            "```text",
            *excerpt_lines,
            "```",
        ]
    )


def _call_llm_proxy(*, messages: list[dict[str, str]]) -> dict[str, Any]:
    url = conf.get(AI_DIAGNOSIS_SECTION, "mcp_llm_proxy_url", fallback=DEFAULT_MCP_LLM_PROXY_URL)
    timeout = conf.getint(
        AI_DIAGNOSIS_SECTION, "request_timeout_seconds", fallback=DEFAULT_REQUEST_TIMEOUT_SECONDS
    )
    headers = {"Content-Type": "application/json"}
    authorization = conf.get(AI_DIAGNOSIS_SECTION, "mcp_authorization_header", fallback="")
    if authorization:
        headers["Authorization"] = authorization

    try:
        response = httpx.post(
            url,
            json={"messages": messages, "parameters": {"temperature": 0.2}},
            headers=headers,
            timeout=timeout,
        )
    except httpx.HTTPError as error:
        raise AIDiagnosisLLMProxyError(f"LLM proxy request failed: {error}") from error

    if response.status_code >= 400:
        raise AIDiagnosisLLMProxyError(f"LLM proxy returned HTTP {response.status_code}: {response.text}")

    try:
        payload = response.json()
    except ValueError as error:
        raise AIDiagnosisLLMProxyError("LLM proxy returned invalid JSON") from error

    if not isinstance(payload, dict):
        raise AIDiagnosisLLMProxyError("LLM proxy returned an unexpected response")
    return payload


def _parse_model_content(content: Any) -> tuple[str, list[dict[str, str]]]:
    if not isinstance(content, str) or not content.strip():
        return "模型未返回诊断内容。", []

    parsed = _load_json_object(content)
    if parsed is None:
        return content.strip(), []

    summary = parsed.get("summary")
    items = parsed.get("items")
    return (
        summary.strip() if isinstance(summary, str) and summary.strip() else content.strip(),
        [_normalize_item(item) for item in items if isinstance(item, dict)]
        if isinstance(items, list)
        else [],
    )


def _load_json_object(content: str) -> dict[str, Any] | None:
    text = content.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?})\s*```", text, flags=re.DOTALL)
    if fenced:
        text = fenced.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    try:
        parsed = json.loads(text)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _normalize_item(item: dict[str, Any]) -> dict[str, str]:
    return {
        "category": _text(item.get("category")),
        "finding": _text(item.get("finding")),
        "evidence": _text(item.get("evidence")),
        "suggestion": _text(item.get("suggestion")),
        "confidence": _text(item.get("confidence")),
    }


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""
