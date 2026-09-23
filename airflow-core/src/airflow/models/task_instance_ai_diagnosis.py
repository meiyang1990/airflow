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


AI_DIAGNOSIS_STATUS_SUCCESS = "success"


class TaskInstanceAIDiagnosis(Base):
    """AI-generated diagnosis for a failed task instance attempt."""

    __tablename__ = "task_instance_ai_diagnosis"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    dag_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    run_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    task_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    map_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="-1")
    try_number: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    log_line_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    log_excerpt_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    llm_request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    diagnosis_items: Mapped[list[dict[str, Any]]] = mapped_column(ExtendedJSON, nullable=False, default=list)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=AI_DIAGNOSIS_STATUS_SUCCESS,
        server_default=AI_DIAGNOSIS_STATUS_SUCCESS,
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
            name="task_instance_ai_diagnosis_ti_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        UniqueConstraint(
            "dag_id",
            "run_id",
            "task_id",
            "map_index",
            "try_number",
            name="task_instance_ai_diagnosis_attempt_uq",
        ),
        Index("idx_task_instance_ai_diagnosis_lookup", dag_id, run_id, task_id, map_index, try_number),
        Index("idx_task_instance_ai_diagnosis_created_at", created_at),
    )


def task_instance_ai_diagnosis_select(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
):
    """Build a select statement for one task instance AI diagnosis row."""
    return select(TaskInstanceAIDiagnosis).where(
        TaskInstanceAIDiagnosis.dag_id == dag_id,
        TaskInstanceAIDiagnosis.run_id == run_id,
        TaskInstanceAIDiagnosis.task_id == task_id,
        TaskInstanceAIDiagnosis.map_index == map_index,
        TaskInstanceAIDiagnosis.try_number == try_number,
    )


@provide_session
def get_task_instance_ai_diagnosis(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    session: Session = NEW_SESSION,
) -> TaskInstanceAIDiagnosis | None:
    """Return the persisted AI diagnosis for a task instance attempt, if present."""
    return session.scalar(
        task_instance_ai_diagnosis_select(
            dag_id=dag_id,
            run_id=run_id,
            task_id=task_id,
            map_index=map_index,
            try_number=try_number,
        )
    )
