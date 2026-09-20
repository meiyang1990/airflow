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
"""Helpers for publishing Ray Dashboard data from task code."""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import httpx

from airflow.sdk.execution_time.comms import (
    OKResponse,
    RayDashboardMetadata,
    RayDashboardMetricSample,
    RayDashboardMetricSamples,
    RayDashboardSnapshot,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from pydantic import JsonValue


RAY_DASHBOARD_MAX_METRIC_BATCH_SIZE = 1000

_PROMETHEUS_SAMPLE_RE = re.compile(
    r"^(?P<name>[a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(?P<labels>.*)\})?\s+"
    r"(?P<value>[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|NaN|[-+]?Inf)"
    r"(?:\s+\d+)?\s*$"
)


def _send_to_supervisor(message) -> OKResponse:
    from airflow.sdk.execution_time.task_runner import SUPERVISOR_COMMS

    response = SUPERVISOR_COMMS.send(message)
    if isinstance(response, OKResponse):
        return response
    return OKResponse(ok=True)


def publish_metadata(
    *,
    dashboard_url: str | None = None,
    ray_cluster_id: str | None = None,
    ray_cluster_name: str | None = None,
    ray_namespace: str | None = None,
    ray_job_id: str | None = None,
    ray_submission_id: str | None = None,
    status: str | None = None,
    collector_status: str | None = None,
    collector_error: str | None = None,
    collector_metadata: dict[str, JsonValue] | None = None,
) -> OKResponse:
    """Publish Ray Dashboard metadata for the current task instance attempt."""
    return _send_to_supervisor(
        RayDashboardMetadata(
            dashboard_url=dashboard_url,
            ray_cluster_id=ray_cluster_id,
            ray_cluster_name=ray_cluster_name,
            ray_namespace=ray_namespace,
            ray_job_id=ray_job_id,
            ray_submission_id=ray_submission_id,
            status=status,
            collector_status=collector_status,
            collector_error=collector_error,
            collector_metadata=collector_metadata,
        )
    )


def publish_snapshot(
    *,
    section: str,
    payload: JsonValue | None = None,
    collected_at: datetime | None = None,
    source_status: str | None = None,
    source_error: str | None = None,
) -> OKResponse:
    """Publish a bounded Ray Dashboard section snapshot."""
    return _send_to_supervisor(
        RayDashboardSnapshot(
            section=section,
            payload=payload,
            collected_at=collected_at,
            source_status=source_status,
            source_error=source_error,
        )
    )


def publish_metric_samples(*, samples: Sequence[RayDashboardMetricSample]) -> OKResponse:
    """Publish a bounded batch of directly collected Ray metric samples."""
    return _send_to_supervisor(RayDashboardMetricSamples(samples=list(samples)))


def parse_prometheus_metric_samples(
    metrics_text: str,
    *,
    sampled_at: datetime | None = None,
    metric_name_filter: Callable[[str], bool] | None = None,
) -> list[RayDashboardMetricSample]:
    """
    Parse Prometheus text exposition samples into Ray Dashboard metric samples.

    By default, every finite numeric sample in the exposition payload is returned.
    Pass ``metric_name_filter`` to narrow collection for deployments that need a
    smaller task-scoped metric footprint.
    """
    sample_time = sampled_at or datetime.now(UTC)
    samples: list[RayDashboardMetricSample] = []
    metric_units = _parse_prometheus_units(metrics_text)

    for line in metrics_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        match = _PROMETHEUS_SAMPLE_RE.match(stripped)
        if match is None:
            continue

        metric_name = match.group("name")
        if metric_name_filter is not None and not metric_name_filter(metric_name):
            continue

        value = float(match.group("value"))
        if not math.isfinite(value):
            continue

        labels_text = match.group("labels")
        samples.append(
            RayDashboardMetricSample(
                metric_name=metric_name,
                metric_unit=metric_units.get(metric_name),
                labels=_parse_prometheus_labels(labels_text) if labels_text else None,
                value=value,
                sampled_at=sample_time,
            )
        )

    return samples


def collect_prometheus_metric_samples(
    metrics_url: str,
    *,
    timeout: float = 5.0,
    metric_name_filter: Callable[[str], bool] | None = None,
    sampled_at: datetime | None = None,
) -> list[RayDashboardMetricSample]:
    """Scrape a Prometheus text endpoint and return all metric samples by default."""
    response = httpx.get(metrics_url, timeout=timeout)
    response.raise_for_status()
    return parse_prometheus_metric_samples(
        response.text,
        sampled_at=sampled_at,
        metric_name_filter=metric_name_filter,
    )


def publish_prometheus_metric_samples(
    metrics_url: str,
    *,
    timeout: float = 5.0,
    batch_size: int = RAY_DASHBOARD_MAX_METRIC_BATCH_SIZE,
    metric_name_filter: Callable[[str], bool] | None = None,
) -> OKResponse:
    """Scrape and publish Prometheus samples, collecting every metric by default."""
    if batch_size < 1 or batch_size > RAY_DASHBOARD_MAX_METRIC_BATCH_SIZE:
        raise ValueError(f"batch_size must be between 1 and {RAY_DASHBOARD_MAX_METRIC_BATCH_SIZE}")

    samples = collect_prometheus_metric_samples(
        metrics_url,
        timeout=timeout,
        metric_name_filter=metric_name_filter,
    )
    if not samples:
        return OKResponse(ok=True)

    response = OKResponse(ok=True)
    for start in range(0, len(samples), batch_size):
        response = publish_metric_samples(samples=samples[start : start + batch_size])
    return response


def _parse_prometheus_units(metrics_text: str) -> dict[str, str]:
    units: dict[str, str] = {}
    for line in metrics_text.splitlines():
        parts = line.strip().split(maxsplit=3)
        if len(parts) == 4 and parts[0] == "#" and parts[1] == "UNIT":
            units[parts[2]] = parts[3]
    return units


def _parse_prometheus_labels(labels_text: str) -> dict[str, str]:
    labels: dict[str, str] = {}
    index = 0
    length = len(labels_text)

    while index < length:
        while index < length and labels_text[index] in " ,":
            index += 1
        if index >= length:
            break

        key_start = index
        while index < length and labels_text[index] != "=":
            index += 1
        if index >= length:
            break
        key = labels_text[key_start:index].strip()
        index += 1

        if index >= length or labels_text[index] != '"':
            break
        index += 1

        value_chars: list[str] = []
        while index < length:
            char = labels_text[index]
            index += 1
            if char == "\\" and index < length:
                escaped = labels_text[index]
                index += 1
                value_chars.append({"n": "\n", "\\": "\\", '"': '"'}.get(escaped, escaped))
            elif char == '"':
                break
            else:
                value_chars.append(char)

        labels[key] = "".join(value_chars)

        while index < length and labels_text[index] != ",":
            index += 1
        if index < length and labels_text[index] == ",":
            index += 1

    return labels
