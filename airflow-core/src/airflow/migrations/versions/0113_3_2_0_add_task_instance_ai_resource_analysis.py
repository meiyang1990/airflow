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
Add task instance AI Ray resource analysis table.

Revision ID: 1c31f3f5d9ae
Revises: 3bc63d0865e2
Create Date: 2026-10-22 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from airflow.migrations.db_types import StringID
from airflow.utils.sqlalchemy import ExtendedJSON, UtcDateTime

revision = "1c31f3f5d9ae"
down_revision = "3bc63d0865e2"
branch_labels = None
depends_on = None
airflow_version = "3.2.0"


def upgrade():
    """Add AI Ray resource analysis persistence."""
    op.create_table(
        "task_instance_ai_resource_analysis",
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("dag_id", StringID(), nullable=False),
        sa.Column("run_id", StringID(), nullable=False),
        sa.Column("task_id", StringID(), nullable=False),
        sa.Column("map_index", sa.Integer(), server_default="-1", nullable=False),
        sa.Column("try_number", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(length=50), nullable=True),
        sa.Column("analysis_schema_version", sa.String(length=32), nullable=False),
        sa.Column("ray_payload_sha256", sa.String(length=64), nullable=False),
        sa.Column("llm_request_id", sa.String(length=128), nullable=True),
        sa.Column("provider", sa.String(length=128), nullable=True),
        sa.Column("model", sa.String(length=256), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("analysis_items", ExtendedJSON(), nullable=False),
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
            name="task_instance_ai_resource_analysis_ti_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="task_instance_ai_resource_analysis_pkey"),
        sa.UniqueConstraint(
            "dag_id",
            "run_id",
            "task_id",
            "map_index",
            "try_number",
            "analysis_schema_version",
            "ray_payload_sha256",
            name="task_instance_ai_resource_analysis_input_uq",
        ),
    )
    op.create_index(
        "idx_task_instance_ai_resource_analysis_lookup",
        "task_instance_ai_resource_analysis",
        [
            "dag_id",
            "run_id",
            "task_id",
            "map_index",
            "try_number",
            "analysis_schema_version",
            "ray_payload_sha256",
        ],
        unique=False,
    )


def downgrade():
    """Remove AI Ray resource analysis persistence."""
    op.drop_index(
        "idx_task_instance_ai_resource_analysis_lookup", table_name="task_instance_ai_resource_analysis"
    )
    op.drop_table("task_instance_ai_resource_analysis")
