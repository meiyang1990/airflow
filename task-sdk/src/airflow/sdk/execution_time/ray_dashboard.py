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

from datetime import datetime
from typing import TYPE_CHECKING

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
