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
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    select,
)
from sqlalchemy.orm import Mapped, mapped_column

from airflow._shared.timezones import timezone
from airflow.models.base import Base, StringID
from airflow.utils.session import NEW_SESSION, provide_session
from airflow.utils.sqlalchemy import ExtendedJSON, UtcDateTime

if TYPE_CHECKING:
    from sqlalchemy.orm.session import Session


AI_RESOURCE_ANALYSIS_STATUS_SUCCESS = "success"


class TaskInstanceAIResourceAnalysis(Base):
    """AI-generated Ray resource analysis for one task instance attempt and input version."""

    __tablename__ = "task_instance_ai_resource_analysis"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    dag_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    run_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    task_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    map_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="-1")
    try_number: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    analysis_schema_version: Mapped[str] = mapped_column(String(32), nullable=False)
    ray_payload_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    llm_request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    analysis_items: Mapped[list[dict[str, Any]]] = mapped_column(ExtendedJSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=AI_RESOURCE_ANALYSIS_STATUS_SUCCESS,
        server_default=AI_RESOURCE_ANALYSIS_STATUS_SUCCESS,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=timezone.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=timezone.utcnow, onupdate=timezone.utcnow, nullable=False
    )

    __table_args__ = (
        ForeignKeyConstraint(
            [dag_id, task_id, run_id, map_index],
            [
                "task_instance.dag_id",
                "task_instance.task_id",
                "task_instance.run_id",
                "task_instance.map_index",
            ],
            name="task_instance_ai_resource_analysis_ti_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        UniqueConstraint(
            "dag_id",
            "run_id",
            "task_id",
            "map_index",
            "try_number",
            "analysis_schema_version",
            "ray_payload_sha256",
            name="task_instance_ai_resource_analysis_input_uq",
        ),
        Index(
            "idx_task_instance_ai_resource_analysis_lookup",
            dag_id,
            run_id,
            task_id,
            map_index,
            try_number,
            analysis_schema_version,
            ray_payload_sha256,
        ),
    )


@provide_session
def get_task_instance_ai_resource_analysis(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    analysis_schema_version: str,
    ray_payload_sha256: str,
    session: Session = NEW_SESSION,
) -> TaskInstanceAIResourceAnalysis | None:
    """Return a cached resource analysis for the exact task attempt and Ray input."""
    return session.scalar(
        select(TaskInstanceAIResourceAnalysis).where(
            TaskInstanceAIResourceAnalysis.dag_id == dag_id,
            TaskInstanceAIResourceAnalysis.run_id == run_id,
            TaskInstanceAIResourceAnalysis.task_id == task_id,
            TaskInstanceAIResourceAnalysis.map_index == map_index,
            TaskInstanceAIResourceAnalysis.try_number == try_number,
            TaskInstanceAIResourceAnalysis.analysis_schema_version == analysis_schema_version,
            TaskInstanceAIResourceAnalysis.ray_payload_sha256 == ray_payload_sha256,
            TaskInstanceAIResourceAnalysis.status == AI_RESOURCE_ANALYSIS_STATUS_SUCCESS,
        )
    )
