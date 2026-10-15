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
"""Persisted shared configuration used to manually trigger a DAG."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from airflow._shared.timezones import timezone
from airflow.models.base import Base, StringID
from airflow.utils.sqlalchemy import UtcDateTime


class DagTriggerConfig(Base):
    """The single shared manual-trigger configuration for a DAG."""

    __tablename__ = "dag_trigger_config"

    dag_id: Mapped[str] = mapped_column(StringID(), primary_key=True)
    conf: Mapped[dict[str, Any]] = mapped_column(sa.JSON(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime, nullable=False, default=timezone.utcnow, onupdate=timezone.utcnow
    )

    __table_args__ = (
        sa.ForeignKeyConstraint(
            ("dag_id",), ["dag.dag_id"], name="dag_trigger_config_dag_id_fkey", ondelete="CASCADE"
        ),
    )
