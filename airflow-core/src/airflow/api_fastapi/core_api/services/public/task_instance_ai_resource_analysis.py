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
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from airflow.api_fastapi.core_api.services.public.task_instance_ai_diagnosis import (
    AIDiagnosisDisabledError,
    _attach_task_to_ti,
    _call_llm_proxy,
    _load_json_object,
    _read_log_lines,
    extract_diagnosis_log_excerpt,
    is_ai_diagnosis_enabled,
)
from airflow.configuration import conf
from airflow.models import DagRun
from airflow.models.ray_dashboard import RayDashboardMetricSample, get_ray_dashboard_task_instance
from airflow.models.task_instance_ai_resource_analysis import (
    TaskInstanceAIResourceAnalysis,
    get_task_instance_ai_resource_analysis,
)
from airflow.models.taskinstance import TaskInstance
from airflow.models.taskinstancehistory import TaskInstanceHistory
from airflow.utils.state import TaskInstanceState

RAY_RESOURCE_ANALYSIS_SCHEMA_VERSION = "1"
RAY_RESOURCE_ANALYSIS_MAX_SAMPLES = 500
RAY_RESOURCE_ANALYSIS_METRICS = frozenset(
    {
        "ray_node_cpu_count",
        "ray_node_cpu_utilization",
        "ray_node_mem_available",
        "ray_node_mem_total",
        "ray_node_mem_used",
    }
)
# These metrics and normalized columns are the complete resource-analysis input
# contract.  In particular, this code does not look at arbitrary metric labels.
RAY_RESOURCE_ANALYSIS_CPU_METRICS = frozenset({"ray_node_cpu_count", "ray_node_cpu_utilization"})
RAY_RESOURCE_ANALYSIS_MEMORY_METRICS = frozenset(
    {"ray_node_mem_available", "ray_node_mem_total", "ray_node_mem_used"}
)
RAY_RESOURCE_ANALYSIS_SYSTEM_PROMPT = (
    "你是 Ray 集群资源分析助手。只能根据提供的规范化 Ray 指标和证据 ID 作出结论，"
    "不得推断缺失数据或杜撰资源值。请严格返回 JSON："
    '{"summary":"总结", "items":[{"scope":"worker 标识或 cluster", "resource":"cpu|memory", '
    '"observation":"观察", "allocation_concern":"分配问题", "evidence_ids":["e-1"], '
    '"recommendation":"建议的单 worker CPU 或 memory 配置；若证据不足则明确说明", '
    '"confidence":"高|中|低", "data_quality":"complete|insufficient"}]}'
)


class AIResourceAnalysisTaskNotFoundError(Exception):
    """Raised when the requested task attempt does not exist."""


class AIResourceAnalysisInvalidTaskStateError(Exception):
    """Raised when a task attempt has not reached a supported terminal state."""


class AIResourceAnalysisUnavailableError(Exception):
    """Raised when a task attempt has no suitable Ray data for analysis."""


class AIResourceAnalysisResponseError(Exception):
    """Raised when the LLM response does not have the resource-analysis schema."""


def analyze_task_instance_resources(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    session,
    dag_bag=None,
) -> tuple[TaskInstanceAIResourceAnalysis, bool]:
    """Return a cached or newly generated Ray resource analysis for a terminal task attempt."""
    if not is_ai_diagnosis_enabled():
        raise AIDiagnosisDisabledError("AI diagnosis is disabled")
    ti = _get_task_instance_attempt(
        dag_id=dag_id,
        run_id=run_id,
        task_id=task_id,
        map_index=map_index,
        try_number=try_number,
        session=session,
    )
    if ti is None:
        raise AIResourceAnalysisTaskNotFoundError("Task instance attempt not found")
    if ti.state not in {TaskInstanceState.FAILED, TaskInstanceState.SUCCESS}:
        raise AIResourceAnalysisInvalidTaskStateError(
            "AI Ray resource analysis is only available for successful or failed task instances"
        )

    dashboard = get_ray_dashboard_task_instance(
        dag_id=dag_id,
        run_id=run_id,
        task_id=task_id,
        map_index=map_index,
        try_number=try_number,
        session=session,
    )
    if dashboard is None:
        raise AIResourceAnalysisUnavailableError("Ray Dashboard data is not available for this task instance")

    payload = build_ray_resource_analysis_payload(dashboard_id=dashboard.id, session=session)
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    payload_sha256 = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()
    cached = get_task_instance_ai_resource_analysis(
        dag_id=dag_id,
        run_id=run_id,
        task_id=task_id,
        map_index=map_index,
        try_number=try_number,
        analysis_schema_version=RAY_RESOURCE_ANALYSIS_SCHEMA_VERSION,
        ray_payload_sha256=payload_sha256,
        session=session,
    )
    if cached is not None:
        return cached, True

    failure_log_excerpt: list[str] | None = None
    if ti.state == TaskInstanceState.FAILED:
        if dag_bag is None:
            raise ValueError("dag_bag is required for failed task resource analysis")
        _attach_task_to_ti(ti, dag_bag=dag_bag, session=session)
        log_lines = _read_log_lines(ti, try_number=try_number)
        failure_log_excerpt = extract_diagnosis_log_excerpt(
            log_lines,
            context_start_line=conf.getint("ai_diagnosis", "log_context_start_line", fallback=18),
            context_end_line=conf.getint("ai_diagnosis", "log_context_end_line", fallback=140),
            tail_lines=conf.getint("ai_diagnosis", "log_tail_lines", fallback=300),
        )

    response = _call_llm_proxy(
        messages=[
            {"role": "system", "content": RAY_RESOURCE_ANALYSIS_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _build_resource_analysis_prompt(payload, failure_log_excerpt=failure_log_excerpt),
            },
        ]
    )
    summary, items = _parse_resource_analysis_content(
        response.get("content"), valid_evidence_ids={item["id"] for item in payload["evidence"]}
    )
    analysis = TaskInstanceAIResourceAnalysis(
        dag_id=dag_id,
        run_id=run_id,
        task_id=task_id,
        map_index=map_index,
        try_number=try_number,
        state=str(ti.state),
        analysis_schema_version=RAY_RESOURCE_ANALYSIS_SCHEMA_VERSION,
        ray_payload_sha256=payload_sha256,
        llm_request_id=response.get("request_id"),
        provider=response.get("provider"),
        model=response.get("model"),
        summary=summary,
        analysis_items=items,
    )
    session.add(analysis)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        cached = get_task_instance_ai_resource_analysis(
            dag_id=dag_id,
            run_id=run_id,
            task_id=task_id,
            map_index=map_index,
            try_number=try_number,
            analysis_schema_version=RAY_RESOURCE_ANALYSIS_SCHEMA_VERSION,
            ray_payload_sha256=payload_sha256,
            session=session,
        )
        if cached is not None:
            return cached, True
        raise
    return analysis, False


def build_ray_resource_analysis_payload(*, dashboard_id, session) -> dict[str, Any]:
    """Build a bounded payload from exact, persisted Ray node resource metrics."""
    max_samples = max(
        1,
        conf.getint(
            "ai_diagnosis", "ray_resource_analysis_max_samples", fallback=RAY_RESOURCE_ANALYSIS_MAX_SAMPLES
        ),
    )
    matching_sample_count = session.scalar(
        select(func.count())
        .select_from(RayDashboardMetricSample)
        .where(
            RayDashboardMetricSample.dashboard_id == dashboard_id,
            RayDashboardMetricSample.name == "worker",
            RayDashboardMetricSample.metric_name.in_(RAY_RESOURCE_ANALYSIS_METRICS),
        )
    )
    samples = session.scalars(
        select(RayDashboardMetricSample)
        .where(
            RayDashboardMetricSample.dashboard_id == dashboard_id,
            RayDashboardMetricSample.name == "worker",
            RayDashboardMetricSample.metric_name.in_(RAY_RESOURCE_ANALYSIS_METRICS),
        )
        .order_by(RayDashboardMetricSample.sampled_at.desc(), RayDashboardMetricSample.id.desc())
        .limit(max_samples + 1)
    ).all()
    omitted_record_count = max(0, (matching_sample_count or 0) - max_samples)
    samples = list(reversed(samples[:max_samples]))
    evidence: list[dict[str, Any]] = []
    worker_metric_count: dict[str, int] = defaultdict(int)
    timestamps: list[datetime] = []

    unavailable_record_count = 0
    for sample in samples:
        worker = _worker_identity(sample)
        if worker is None or not sample.metric_unit:
            unavailable_record_count += 1
            continue
        timestamps.append(sample.sampled_at)
        worker_metric_count[worker] += 1
        evidence.append(
            {
                "id": f"e-{len(evidence) + 1}",
                "worker": worker,
                "metric_name": sample.metric_name,
                "metric_unit": sample.metric_unit,
                "sampled_at": sample.sampled_at.isoformat(),
                "value": sample.value,
            }
        )

    return {
        "schema_version": RAY_RESOURCE_ANALYSIS_SCHEMA_VERSION,
        "evidence": evidence,
        "missing_dimensions": _missing_dimensions(worker_metric_count, evidence),
        "omitted_record_count": omitted_record_count,
        "unavailable_record_count": unavailable_record_count,
        "retained_time_range": {
            "start": min(timestamps).isoformat() if timestamps else None,
            "end": max(timestamps).isoformat() if timestamps else None,
        },
    }


def _worker_identity(sample: RayDashboardMetricSample) -> str | None:
    """Use only persisted, normalized worker identity columns; never inspect arbitrary labels."""
    if sample.name != "worker":
        return None
    for value in (sample.pod_name, sample.pod_id, sample.pod_ip):
        if value:
            return value
    return None


def _missing_dimensions(
    worker_metric_count: dict[str, int], evidence: Sequence[dict[str, Any]]
) -> list[dict[str, str]]:
    names_by_worker: dict[str, set[str]] = defaultdict(set)
    for item in evidence:
        names_by_worker[item["worker"]].add(item["metric_name"])
    required = {
        "cpu": {"ray_node_cpu_count", "ray_node_cpu_utilization"},
        "memory": {"ray_node_mem_total", "ray_node_mem_used"},
    }
    missing = []
    for worker in worker_metric_count:
        for resource, names in required.items():
            absent = sorted(names - names_by_worker[worker])
            if absent:
                missing.append({"worker": worker, "resource": resource, "missing_metrics": ",".join(absent)})
    return missing


def _get_task_instance_attempt(
    *, dag_id: str, run_id: str, task_id: str, map_index: int, try_number: int, session
) -> TaskInstance | TaskInstanceHistory | None:
    ti = session.scalar(
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


def _build_resource_analysis_prompt(
    payload: dict[str, Any], *, failure_log_excerpt: Sequence[str] | None = None
) -> str:
    prompt = [
        "请分析下列 Ray worker 的 CPU 和 memory 资源使用情况。",
        "仅引用 evidence 中的 id；数据不足时 data_quality 必须为 insufficient，且不得给出数值配置建议。",
        "配置建议只可作为建议，不能执行任何配置变更。",
    ]
    if failure_log_excerpt is not None:
        prompt.extend(["", "失败任务日志摘录:", "```text", *failure_log_excerpt, "```"])
    prompt.extend(
        [
            "",
            "规范化 Ray 资源载荷:",
            "```json",
            json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
            "```",
        ]
    )
    return "\n".join(prompt)


def _parse_resource_analysis_content(
    content: Any, *, valid_evidence_ids: set[str] | None = None
) -> tuple[str, list[dict[str, Any]]]:
    if not isinstance(content, str) or not content.strip():
        raise AIResourceAnalysisResponseError("LLM did not return Ray resource analysis content")
    parsed = _load_json_object(content)
    if (
        parsed is None
        or not isinstance(parsed.get("summary"), str)
        or not isinstance(parsed.get("items"), list)
    ):
        raise AIResourceAnalysisResponseError("LLM returned an invalid Ray resource analysis response")
    if not parsed["summary"].strip() or not all(isinstance(item, dict) for item in parsed["items"]):
        raise AIResourceAnalysisResponseError("LLM returned incomplete Ray resource analysis content")
    return parsed["summary"], [
        _normalize_resource_item(item, valid_evidence_ids=valid_evidence_ids) for item in parsed["items"]
    ]


def _normalize_resource_item(item: dict[str, Any], *, valid_evidence_ids: set[str] | None) -> dict[str, Any]:
    evidence_ids = item.get("evidence_ids")
    fields = {
        name: item.get(name)
        for name in (
            "scope",
            "resource",
            "observation",
            "allocation_concern",
            "recommendation",
            "confidence",
            "data_quality",
        )
    }
    if (
        not all(isinstance(value, str) and value.strip() for value in fields.values())
        or fields["resource"] not in {"cpu", "memory"}
        or fields["data_quality"] not in {"complete", "insufficient"}
        or not isinstance(evidence_ids, list)
        or not evidence_ids
        or not all(isinstance(value, str) and value for value in evidence_ids)
        or (valid_evidence_ids is not None and not set(evidence_ids).issubset(valid_evidence_ids))
    ):
        raise AIResourceAnalysisResponseError("LLM returned an invalid Ray resource analysis item")
    return {**fields, "evidence_ids": evidence_ids}
