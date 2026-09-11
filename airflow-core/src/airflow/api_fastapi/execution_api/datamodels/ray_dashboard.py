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

import json
from datetime import datetime
from typing import Any

from pydantic import AwareDatetime, Field, JsonValue, field_validator, model_validator

from airflow.api_fastapi.core_api.base import StrictBaseModel
from airflow.models.ray_dashboard import (
    RAY_DASHBOARD_MAX_METRIC_BATCH_SIZE,
    RAY_DASHBOARD_MAX_SECTION_PAYLOAD_BYTES,
    RAY_DASHBOARD_SECTIONS,
)


class RayDashboardMetadataPayload(StrictBaseModel):
    """Payload for publishing Ray Dashboard metadata."""

    dashboard_url: str | None = None
    ray_cluster_id: str | None = None
    ray_cluster_name: str | None = None
    ray_namespace: str | None = None
    ray_job_id: str | None = None
    ray_submission_id: str | None = None
    status: str | None = None
    collector_status: str | None = None
    collector_error: str | None = None
    collector_metadata: dict[str, Any] | None = None


class RayDashboardSnapshotPayload(StrictBaseModel):
    """Payload for publishing a Ray Dashboard section snapshot."""

    section: str
    payload: JsonValue | None = None
    collected_at: AwareDatetime | None = None
    source_status: str | None = None
    source_error: str | None = None

    @field_validator("section")
    @classmethod
    def validate_section(cls, section: str) -> str:
        """Validate Ray Dashboard section name."""
        if section not in RAY_DASHBOARD_SECTIONS:
            raise ValueError(f"section must be one of: {', '.join(RAY_DASHBOARD_SECTIONS)}")
        return section

    @model_validator(mode="after")
    def validate_payload_size(self):
        """Reject unbounded section payloads."""
        payload_bytes = len(json.dumps(self.payload, default=str).encode("utf-8"))
        if payload_bytes > RAY_DASHBOARD_MAX_SECTION_PAYLOAD_BYTES:
            raise ValueError(f"payload is larger than {RAY_DASHBOARD_MAX_SECTION_PAYLOAD_BYTES} bytes")
        return self


class RayDashboardMetricSamplePayload(StrictBaseModel):
    """Payload for a directly collected Ray metric sample."""

    metric_name: str
    metric_unit: str | None = None
    labels: dict[str, Any] | None = None
    value: float
    sampled_at: AwareDatetime


class RayDashboardMetricSamplesPayload(StrictBaseModel):
    """Payload for publishing a batch of directly collected Ray metric samples."""

    samples: list[RayDashboardMetricSamplePayload] = Field(default_factory=list)

    @field_validator("samples")
    @classmethod
    def validate_sample_count(cls, samples: list[RayDashboardMetricSamplePayload]):
        """Reject unbounded metric batches."""
        if len(samples) > RAY_DASHBOARD_MAX_METRIC_BATCH_SIZE:
            raise ValueError(f"samples cannot contain more than {RAY_DASHBOARD_MAX_METRIC_BATCH_SIZE} items")
        return samples


class RayDashboardWriteResponse(StrictBaseModel):
    """Response for Ray Dashboard write endpoints."""

    dashboard_id: str
    updated_at: datetime
