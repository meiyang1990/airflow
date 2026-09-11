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
from typing import Any
from uuid import UUID

from pydantic import Field, JsonValue

from airflow.api_fastapi.core_api.base import BaseModel


class RayDashboardResponse(BaseModel):
    """Ray Dashboard metadata response."""

    id: UUID
    dag_id: str
    run_id: str
    task_id: str
    map_index: int
    try_number: int
    dashboard_url: str | None
    ray_cluster_id: str | None
    ray_cluster_name: str | None
    ray_namespace: str | None
    ray_job_id: str | None
    ray_submission_id: str | None
    status: str | None
    collector_status: str | None
    collector_error: str | None
    collector_metadata: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class RayDashboardAvailabilityResponse(BaseModel):
    """Available Ray Dashboard data for a task attempt."""

    dashboard: RayDashboardResponse
    sections: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)


class RayDashboardSnapshotResponse(BaseModel):
    """Ray Dashboard section snapshot response."""

    id: UUID
    dashboard_id: UUID
    section: str
    source_status: str | None
    source_error: str | None
    payload: JsonValue | None
    collected_at: datetime
    created_at: datetime


class RayDashboardSnapshotCollectionResponse(BaseModel):
    """Ray Dashboard section snapshot collection response."""

    snapshots: list[RayDashboardSnapshotResponse]
    total_entries: int


class RayDashboardMetricSampleResponse(BaseModel):
    """Ray Dashboard metric sample response."""

    id: UUID
    dashboard_id: UUID
    metric_name: str
    metric_unit: str | None
    labels: dict[str, Any] | None
    value: float
    sampled_at: datetime
    created_at: datetime


class RayDashboardMetricSampleCollectionResponse(BaseModel):
    """Ray Dashboard metric sample collection response."""

    samples: list[RayDashboardMetricSampleResponse]
    total_entries: int
