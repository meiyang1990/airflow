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

from pydantic import Field

from airflow.api_fastapi.core_api.base import BaseModel


class TaskInstanceAIDiagnosisItem(BaseModel):
    """One structured AI diagnosis finding."""

    category: str = ""
    finding: str = ""
    evidence: str = ""
    suggestion: str = ""
    confidence: str = ""


class TaskInstanceAIResourceAnalysisItem(BaseModel):
    """One evidence-based Ray resource analysis finding."""

    scope: str = ""
    resource: str = ""
    observation: str = ""
    allocation_concern: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    recommendation: str = ""
    confidence: str = ""
    data_quality: str = ""


class TaskInstanceAIResourceAnalysisResponse(BaseModel):
    """AI Ray resource-analysis result for a task instance attempt."""

    cached: bool
    analysis_schema_version: str
    ray_payload_sha256: str
    summary: str
    items: list[TaskInstanceAIResourceAnalysisItem] = Field(default_factory=list)
    request_id: str | None = None
    provider: str | None = None
    model: str | None = None
    created_at: datetime
    updated_at: datetime


class TaskInstanceAIDiagnosisResponse(BaseModel):
    """AI diagnosis response for a task instance attempt."""

    cached: bool
    dag_id: str
    run_id: str
    task_id: str
    map_index: int
    try_number: int
    state: str | None
    log_line_count: int | None = None
    log_excerpt_sha256: str | None = None
    request_id: str | None = None
    provider: str | None = None
    model: str | None = None
    summary: str | None = None
    items: list[TaskInstanceAIDiagnosisItem] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    resource_analysis: TaskInstanceAIResourceAnalysisResponse | None = None
    resource_analysis_error: str | None = None
