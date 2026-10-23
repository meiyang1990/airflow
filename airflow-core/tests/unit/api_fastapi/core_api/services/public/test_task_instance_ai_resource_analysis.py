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

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from airflow.api_fastapi.core_api.services.public.task_instance_ai_resource_analysis import (
    AIResourceAnalysisResponseError,
    _build_resource_analysis_prompt,
    _parse_resource_analysis_content,
    _worker_identity,
    build_ray_resource_analysis_payload,
)
from airflow.utils.state import TaskInstanceState


def test_resource_analysis_prompt_includes_log_excerpt_only_when_provided():
    payload = {"evidence": [{"id": "e-1"}], "schema_version": "1"}

    successful_prompt = _build_resource_analysis_prompt(payload)
    failed_prompt = _build_resource_analysis_prompt(payload, failure_log_excerpt=["connection timed out"])

    assert "失败任务日志摘录" not in successful_prompt
    assert "connection timed out" not in successful_prompt
    assert "失败任务日志摘录" in failed_prompt
    assert "connection timed out" in failed_prompt


def test_successful_resource_analysis_omits_failure_logs_and_persists_result(monkeypatch):
    from airflow.api_fastapi.core_api.services.public import task_instance_ai_resource_analysis as service

    session = Mock()
    payload = {"evidence": [{"id": "e-1"}], "schema_version": "1"}
    monkeypatch.setattr(service, "is_ai_diagnosis_enabled", lambda: True)
    monkeypatch.setattr(
        service,
        "_get_task_instance_attempt",
        lambda **_: SimpleNamespace(state=TaskInstanceState.SUCCESS),
    )
    monkeypatch.setattr(
        service, "get_ray_dashboard_task_instance", lambda **_: SimpleNamespace(id="dashboard")
    )
    monkeypatch.setattr(service, "build_ray_resource_analysis_payload", lambda **_: payload)
    monkeypatch.setattr(service, "get_task_instance_ai_resource_analysis", lambda **_: None)
    proxy = Mock(
        return_value={
            "content": (
                '{"summary":"capacity is sufficient","items":[{"scope":"worker-1","resource":"cpu",'
                '"observation":"25% utilization","allocation_concern":"none","evidence_ids":["e-1"],'
                '"recommendation":"Keep the current configuration.","confidence":"high",'
                '"data_quality":"complete"}]}'
            )
        }
    )
    monkeypatch.setattr(service, "_call_llm_proxy", proxy)

    analysis, cached = service.analyze_task_instance_resources(
        dag_id="dag", run_id="run", task_id="task", map_index=-1, try_number=1, session=session
    )

    assert cached is False
    assert analysis.summary == "capacity is sufficient"
    assert "失败任务日志摘录" not in proxy.call_args.kwargs["messages"][1]["content"]
    session.add.assert_called_once_with(analysis)


def test_failed_resource_analysis_includes_permitted_failure_log_excerpt(monkeypatch):
    from airflow.api_fastapi.core_api.services.public import task_instance_ai_resource_analysis as service

    session = Mock()
    payload = {"evidence": [{"id": "e-1"}], "schema_version": "1"}
    monkeypatch.setattr(service, "is_ai_diagnosis_enabled", lambda: True)
    monkeypatch.setattr(
        service,
        "_get_task_instance_attempt",
        lambda **_: SimpleNamespace(state=TaskInstanceState.FAILED),
    )
    monkeypatch.setattr(
        service, "get_ray_dashboard_task_instance", lambda **_: SimpleNamespace(id="dashboard")
    )
    monkeypatch.setattr(service, "build_ray_resource_analysis_payload", lambda **_: payload)
    monkeypatch.setattr(service, "get_task_instance_ai_resource_analysis", lambda **_: None)
    monkeypatch.setattr(service, "_attach_task_to_ti", lambda *_, **__: None)
    monkeypatch.setattr(service, "_read_log_lines", lambda *_, **__: ["connection timed out"])
    monkeypatch.setattr(service, "extract_diagnosis_log_excerpt", lambda *_, **__: ["connection timed out"])
    proxy = Mock(
        return_value={
            "content": (
                '{"summary":"capacity is sufficient","items":[{"scope":"worker-1","resource":"cpu",'
                '"observation":"25% utilization","allocation_concern":"none","evidence_ids":["e-1"],'
                '"recommendation":"Keep the current configuration.","confidence":"high",'
                '"data_quality":"complete"}]}'
            )
        }
    )
    monkeypatch.setattr(service, "_call_llm_proxy", proxy)

    service.analyze_task_instance_resources(
        dag_id="dag",
        run_id="run",
        task_id="task",
        map_index=-1,
        try_number=1,
        dag_bag=object(),
        session=session,
    )

    assert "connection timed out" in proxy.call_args.kwargs["messages"][1]["content"]


def test_resource_analysis_cache_hit_skips_proxy(monkeypatch):
    from airflow.api_fastapi.core_api.services.public import task_instance_ai_resource_analysis as service

    cached_analysis = SimpleNamespace(summary="cached")
    monkeypatch.setattr(service, "is_ai_diagnosis_enabled", lambda: True)
    monkeypatch.setattr(
        service,
        "_get_task_instance_attempt",
        lambda **_: SimpleNamespace(state=TaskInstanceState.SUCCESS),
    )
    monkeypatch.setattr(
        service, "get_ray_dashboard_task_instance", lambda **_: SimpleNamespace(id="dashboard")
    )
    monkeypatch.setattr(
        service,
        "build_ray_resource_analysis_payload",
        lambda **_: {"evidence": [{"id": "e-1"}], "schema_version": "1"},
    )
    monkeypatch.setattr(service, "get_task_instance_ai_resource_analysis", lambda **_: cached_analysis)
    proxy = Mock()
    monkeypatch.setattr(service, "_call_llm_proxy", proxy)

    analysis, cached = service.analyze_task_instance_resources(
        dag_id="dag", run_id="run", task_id="task", map_index=-1, try_number=1, session=Mock()
    )

    assert analysis is cached_analysis
    assert cached is True
    proxy.assert_not_called()


def test_resource_analysis_parser_normalizes_structured_items():
    summary, items = _parse_resource_analysis_content(
        '{"summary":"worker memory is idle", "items":[{"scope":"worker-1", "resource":"memory", '
        '"observation":"low use", "allocation_concern":"overprovisioned", "evidence_ids":["e-1"], '
        '"recommendation":"reduce memory", "confidence":"high", "data_quality":"complete"}]}'
    )

    assert summary == "worker memory is idle"
    assert items[0]["evidence_ids"] == ["e-1"]
    assert items[0]["resource"] == "memory"


def test_resource_analysis_parser_allows_explicit_insufficient_evidence():
    summary, items = _parse_resource_analysis_content(
        '{"summary":"not enough samples", "items":[{"scope":"worker-1", "resource":"cpu", '
        '"observation":"only one sample", "allocation_concern":"unknown", "evidence_ids":["e-1"], '
        '"recommendation":"No sizing recommendation is justified.", "confidence":"low", '
        '"data_quality":"insufficient"}]}'
    )

    assert summary == "not enough samples"
    assert items[0]["data_quality"] == "insufficient"


@pytest.mark.parametrize(
    "content",
    [
        '{"summary":"analysis", "items":[{"scope":"worker-1", "resource":"gpu", '
        '"observation":"observed", "allocation_concern":"unknown", "evidence_ids":["e-1"], '
        '"recommendation":"none", "confidence":"low", "data_quality":"complete"}]}',
        '{"summary":"analysis", "items":[{"scope":"worker-1", "resource":"cpu", '
        '"observation":"observed", "allocation_concern":"unknown", "evidence_ids":["e-2"], '
        '"recommendation":"none", "confidence":"low", "data_quality":"complete"}]}',
    ],
)
def test_resource_analysis_parser_rejects_unsupported_resource_or_unknown_evidence(content):
    with pytest.raises(AIResourceAnalysisResponseError):
        _parse_resource_analysis_content(content, valid_evidence_ids={"e-1"})


@pytest.mark.parametrize("content", ["plain text", '{"summary":"missing items"}', ""])
def test_resource_analysis_parser_rejects_unstructured_content(content):
    with pytest.raises(AIResourceAnalysisResponseError):
        _parse_resource_analysis_content(content)


def test_worker_identity_uses_only_normalized_worker_columns():
    worker = SimpleNamespace(name="worker", pod_name="worker-1", pod_id=None, pod_ip=None)
    non_worker = SimpleNamespace(name="head", pod_name="head-1", pod_id=None, pod_ip=None)

    assert _worker_identity(worker) == "worker-1"
    assert _worker_identity(non_worker) is None


def test_resource_payload_reports_every_omitted_matching_record(session, monkeypatch):
    samples = [
        SimpleNamespace(
            id=index,
            name="worker",
            pod_name="worker-1",
            pod_id=None,
            pod_ip=None,
            metric_name="ray_node_cpu_count",
            metric_unit="cores",
            sampled_at=datetime(2026, 1, 1, 0, 0, index),
            value=float(index),
        )
        for index in range(1, 5)
    ]

    class FakeScalars:
        def all(self):
            return samples[-2:]

    monkeypatch.setattr(session, "scalar", lambda statement: 4)
    monkeypatch.setattr(session, "scalars", lambda statement: FakeScalars())
    monkeypatch.setattr(
        "airflow.api_fastapi.core_api.services.public.task_instance_ai_resource_analysis.conf.getint",
        lambda *args, **kwargs: 2,
    )

    payload = build_ray_resource_analysis_payload(dashboard_id="dashboard-id", session=session)

    assert payload["omitted_record_count"] == 2
    assert [item["id"] for item in payload["evidence"]] == ["e-1", "e-2"]


def test_resource_payload_marks_missing_units_unavailable(session, monkeypatch):
    sample = SimpleNamespace(
        id=1,
        name="worker",
        pod_name="worker-1",
        pod_id=None,
        pod_ip=None,
        metric_name="ray_node_cpu_count",
        metric_unit=None,
        sampled_at=datetime(2026, 1, 1),
        value=1.0,
    )

    class FakeScalars:
        def all(self):
            return [sample]

    monkeypatch.setattr(session, "scalar", lambda statement: 1)
    monkeypatch.setattr(session, "scalars", lambda statement: FakeScalars())
    monkeypatch.setattr(
        "airflow.api_fastapi.core_api.services.public.task_instance_ai_resource_analysis.conf.getint",
        lambda *args, **kwargs: 2,
    )

    payload = build_ray_resource_analysis_payload(dashboard_id="dashboard-id", session=session)

    assert payload["evidence"] == []
    assert payload["unavailable_record_count"] == 1


def test_resource_payload_preserves_cpu_and_memory_units_and_timestamps(session, monkeypatch):
    samples = [
        SimpleNamespace(
            id=index,
            name="worker",
            pod_name="worker-1",
            pod_id=None,
            pod_ip=None,
            metric_name=metric_name,
            metric_unit=unit,
            sampled_at=datetime(2026, 1, 1, 0, index),
            value=value,
        )
        for index, (metric_name, unit, value) in enumerate(
            [
                ("ray_node_cpu_count", "cores", 4.0),
                ("ray_node_cpu_utilization", "percent", 25.0),
                ("ray_node_mem_total", "bytes", 8_000_000_000.0),
                ("ray_node_mem_used", "bytes", 2_000_000_000.0),
            ],
            start=1,
        )
    ]

    class FakeScalars:
        def all(self):
            return samples

    monkeypatch.setattr(session, "scalar", lambda statement: len(samples))
    monkeypatch.setattr(session, "scalars", lambda statement: FakeScalars())
    monkeypatch.setattr(
        "airflow.api_fastapi.core_api.services.public.task_instance_ai_resource_analysis.conf.getint",
        lambda *args, **kwargs: 10,
    )

    payload = build_ray_resource_analysis_payload(dashboard_id="dashboard-id", session=session)

    assert {(item["metric_name"], item["metric_unit"]) for item in payload["evidence"]} == {
        ("ray_node_cpu_count", "cores"),
        ("ray_node_cpu_utilization", "percent"),
        ("ray_node_mem_total", "bytes"),
        ("ray_node_mem_used", "bytes"),
    }
    assert payload["missing_dimensions"] == []
    assert payload["retained_time_range"] == {
        "start": "2026-01-01T00:01:00",
        "end": "2026-01-01T00:04:00",
    }
