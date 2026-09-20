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

import httpx

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


def test_parse_prometheus_metric_samples_collects_all_finite_samples_by_default():
    sampled_at = timezone.parse("2026-09-17T00:00:00Z")
    metrics_text = """
    # HELP ray_node_disk_usage The amount of disk space used per node.
    # TYPE ray_node_disk_usage gauge
    # UNIT ray_node_disk_usage bytes
    ray_node_disk_usage{instance="10.0.0.1:8080",node_type="head"} 1024
    ray_node_disk_free{instance="10.0.0.1:8080"} 2048
    ray_node_disk_io_read_speed{instance="10.0.0.1:8080"} NaN
    custom_application_metric{label="escaped\\nvalue"} 3.5 1790000000000
    """

    samples = ray_dashboard.parse_prometheus_metric_samples(metrics_text, sampled_at=sampled_at)

    assert samples == [
        RayDashboardMetricSample(
            metric_name="ray_node_disk_usage",
            metric_unit="bytes",
            labels={"instance": "10.0.0.1:8080", "node_type": "head"},
            value=1024.0,
            sampled_at=sampled_at,
        ),
        RayDashboardMetricSample(
            metric_name="ray_node_disk_free",
            labels={"instance": "10.0.0.1:8080"},
            value=2048.0,
            sampled_at=sampled_at,
        ),
        RayDashboardMetricSample(
            metric_name="custom_application_metric",
            labels={"label": "escaped\nvalue"},
            value=3.5,
            sampled_at=sampled_at,
        ),
    ]


def test_parse_prometheus_metric_samples_can_filter_metric_names():
    sampled_at = timezone.parse("2026-09-17T00:00:00Z")
    metrics_text = """
    ray_node_disk_usage{instance="10.0.0.1:8080"} 1024
    ray_node_cpu_utilization{instance="10.0.0.1:8080"} 50
    """

    samples = ray_dashboard.parse_prometheus_metric_samples(
        metrics_text,
        sampled_at=sampled_at,
        metric_name_filter=lambda metric_name: metric_name.startswith("ray_node_disk_"),
    )

    assert [sample.metric_name for sample in samples] == ["ray_node_disk_usage"]


def test_collect_prometheus_metric_samples_scrapes_endpoint(monkeypatch):
    sampled_at = timezone.parse("2026-09-17T00:00:00Z")

    def fake_get(url, *, timeout):
        assert url == "http://ray.example/metrics"
        assert timeout == 10.0
        return httpx.Response(
            200,
            text='ray_node_disk_free{instance="node"} 2048',
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(ray_dashboard.httpx, "get", fake_get)

    samples = ray_dashboard.collect_prometheus_metric_samples(
        "http://ray.example/metrics",
        timeout=10.0,
        sampled_at=sampled_at,
    )

    assert samples == [
        RayDashboardMetricSample(
            metric_name="ray_node_disk_free",
            labels={"instance": "node"},
            value=2048.0,
            sampled_at=sampled_at,
        )
    ]


def test_publish_prometheus_metric_samples_batches_all_scraped_samples(monkeypatch):
    comms = MagicMock()
    comms.send.return_value = OKResponse(ok=True)
    monkeypatch.setattr(task_runner, "SUPERVISOR_COMMS", comms, raising=False)
    sampled_at = timezone.parse("2026-09-17T00:00:00Z")
    monkeypatch.setattr(
        ray_dashboard,
        "collect_prometheus_metric_samples",
        MagicMock(
            return_value=[
                RayDashboardMetricSample(
                    metric_name=f"ray_metric_{index}", value=index, sampled_at=sampled_at
                )
                for index in range(3)
            ]
        ),
    )

    result = ray_dashboard.publish_prometheus_metric_samples("http://ray.example/metrics", batch_size=2)

    assert result == OKResponse(ok=True)
    assert comms.send.call_count == 2
    assert [len(call.args[0].samples) for call in comms.send.call_args_list] == [2, 1]
