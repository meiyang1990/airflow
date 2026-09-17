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

from unittest.mock import MagicMock

from airflow.sdk import timezone
from airflow.sdk.execution_time import ray_dashboard, task_runner
from airflow.sdk.execution_time.comms import (
    OKResponse,
    RayDashboardMetadata,
    RayDashboardMetricSample,
    RayDashboardMetricSamples,
    RayDashboardSnapshot,
)


def test_publish_metadata_uses_supervisor_comms(monkeypatch):
    comms = MagicMock()
    comms.send.return_value = OKResponse(ok=True)
    monkeypatch.setattr(task_runner, "SUPERVISOR_COMMS", comms, raising=False)

    result = ray_dashboard.publish_metadata(
        dashboard_url="https://ray.example",
        ray_cluster_name="ray-cluster",
        collector_status="ok",
    )

    assert result == OKResponse(ok=True)
    comms.send.assert_called_once_with(
        RayDashboardMetadata(
            dashboard_url="https://ray.example",
            ray_cluster_name="ray-cluster",
            collector_status="ok",
        )
    )


def test_publish_snapshot_uses_supervisor_comms(monkeypatch):
    comms = MagicMock()
    comms.send.return_value = OKResponse(ok=True)
    monkeypatch.setattr(task_runner, "SUPERVISOR_COMMS", comms, raising=False)
    collected_at = timezone.parse("2026-09-17T00:00:00Z")

    result = ray_dashboard.publish_snapshot(
        section="jobs",
        payload={"running": 1},
        collected_at=collected_at,
        source_status="ok",
    )

    assert result == OKResponse(ok=True)
    comms.send.assert_called_once_with(
        RayDashboardSnapshot(
            section="jobs",
            payload={"running": 1},
            collected_at=collected_at,
            source_status="ok",
        )
    )


def test_publish_metric_samples_uses_supervisor_comms(monkeypatch):
    comms = MagicMock()
    comms.send.return_value = OKResponse(ok=True)
    monkeypatch.setattr(task_runner, "SUPERVISOR_COMMS", comms, raising=False)
    sampled_at = timezone.parse("2026-09-17T00:00:00Z")
    sample = RayDashboardMetricSample(
        metric_name="ray_tasks",
        metric_unit="count",
        labels={"state": "running"},
        value=1.0,
        sampled_at=sampled_at,
    )

    result = ray_dashboard.publish_metric_samples(samples=[sample])

    assert result == OKResponse(ok=True)
    comms.send.assert_called_once_with(RayDashboardMetricSamples(samples=[sample]))
