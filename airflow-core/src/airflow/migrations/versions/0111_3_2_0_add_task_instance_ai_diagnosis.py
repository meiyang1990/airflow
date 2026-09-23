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

"""
Add task instance AI diagnosis table.

Revision ID: 8b05f4a7c9d1
Revises: 57c4c8d6f0ab
Create Date: 2026-09-23 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from airflow.migrations.db_types import StringID
from airflow.utils.sqlalchemy import ExtendedJSON, UtcDateTime

# revision identifiers, used by Alembic.
revision = "8b05f4a7c9d1"
down_revision = "57c4c8d6f0ab"
branch_labels = None
depends_on = None
airflow_version = "3.2.0"


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_index(table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name))


def upgrade():
    """Add task instance AI diagnosis table."""
    if not _has_table("task_instance_ai_diagnosis"):
        op.create_table(
            "task_instance_ai_diagnosis",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("dag_id", StringID(), nullable=False),
            sa.Column("run_id", StringID(), nullable=False),
            sa.Column("task_id", StringID(), nullable=False),
            sa.Column("map_index", sa.Integer(), server_default="-1", nullable=False),
            sa.Column("try_number", sa.Integer(), nullable=False),
            sa.Column("state", sa.String(length=50), nullable=True),
            sa.Column("log_line_count", sa.Integer(), nullable=False),
            sa.Column("log_excerpt_sha256", sa.String(length=64), nullable=False),
            sa.Column("llm_request_id", sa.String(length=128), nullable=True),
            sa.Column("provider", sa.String(length=128), nullable=True),
            sa.Column("model", sa.String(length=256), nullable=True),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("diagnosis_items", ExtendedJSON(), nullable=False),
            sa.Column("raw_response", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=32), server_default="success", nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", UtcDateTime(), nullable=False),
            sa.Column("updated_at", UtcDateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["dag_id", "task_id", "run_id", "map_index"],
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
            sa.PrimaryKeyConstraint("id", name="task_instance_ai_diagnosis_pkey"),
            sa.UniqueConstraint(
                "dag_id",
                "run_id",
                "task_id",
                "map_index",
                "try_number",
                name="task_instance_ai_diagnosis_attempt_uq",
            ),
        )
    if not _has_index("task_instance_ai_diagnosis", "idx_task_instance_ai_diagnosis_lookup"):
        op.create_index(
            "idx_task_instance_ai_diagnosis_lookup",
            "task_instance_ai_diagnosis",
            ["dag_id", "run_id", "task_id", "map_index", "try_number"],
            unique=False,
        )
    if not _has_index("task_instance_ai_diagnosis", "idx_task_instance_ai_diagnosis_created_at"):
        op.create_index(
            "idx_task_instance_ai_diagnosis_created_at",
            "task_instance_ai_diagnosis",
            ["created_at"],
            unique=False,
        )


def downgrade():
    """Remove task instance AI diagnosis table."""
    op.drop_index("idx_task_instance_ai_diagnosis_created_at", table_name="task_instance_ai_diagnosis")
    op.drop_index("idx_task_instance_ai_diagnosis_lookup", table_name="task_instance_ai_diagnosis")
    op.drop_table("task_instance_ai_diagnosis")
