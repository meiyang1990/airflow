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
Add Ray Dashboard task instance tables.

Revision ID: 57c4c8d6f0ab
Revises: 1d6611b6ab7c
Create Date: 2026-09-11 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from airflow.migrations.db_types import StringID
from airflow.utils.sqlalchemy import ExtendedJSON, UtcDateTime

# revision identifiers, used by Alembic.
revision = "57c4c8d6f0ab"
down_revision = "1d6611b6ab7c"
branch_labels = None
depends_on = None
airflow_version = "3.2.0"


def upgrade():
    """Add Ray Dashboard task instance tables."""
    op.create_table(
        "ray_dashboard_task_instance",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dag_id", StringID(), nullable=False),
        sa.Column("run_id", StringID(), nullable=False),
        sa.Column("task_id", StringID(), nullable=False),
        sa.Column("map_index", sa.Integer(), server_default="-1", nullable=False),
        sa.Column("try_number", sa.Integer(), nullable=False),
        sa.Column("dashboard_url", sa.Text(), nullable=True),
        sa.Column("ray_cluster_id", sa.String(length=255), nullable=True),
        sa.Column("ray_cluster_name", sa.String(length=255), nullable=True),
        sa.Column("ray_namespace", sa.String(length=255), nullable=True),
        sa.Column("ray_job_id", sa.String(length=255), nullable=True),
        sa.Column("ray_submission_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=100), nullable=True),
        sa.Column("collector_status", sa.String(length=100), nullable=True),
        sa.Column("collector_error", sa.Text(), nullable=True),
        sa.Column("collector_metadata", ExtendedJSON(), nullable=True),
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
            name="ray_dashboard_ti_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="ray_dashboard_task_instance_pkey"),
        sa.UniqueConstraint(
            "dag_id",
            "run_id",
            "task_id",
            "map_index",
            "try_number",
            name="ray_dashboard_task_instance_attempt_uq",
        ),
    )
    op.create_index(
        "idx_ray_dashboard_ti_lookup",
        "ray_dashboard_task_instance",
        ["dag_id", "run_id", "task_id", "map_index", "try_number"],
        unique=False,
    )

    op.create_table(
        "ray_dashboard_snapshot",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dashboard_id", sa.Uuid(), nullable=False),
        sa.Column("section", sa.String(length=50), nullable=False),
        sa.Column("source_status", sa.String(length=100), nullable=True),
        sa.Column("source_error", sa.Text(), nullable=True),
        sa.Column("payload", ExtendedJSON(), nullable=True),
        sa.Column("collected_at", UtcDateTime(), nullable=False),
        sa.Column("created_at", UtcDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dashboard_id"],
            ["ray_dashboard_task_instance.id"],
            name="ray_dashboard_snapshot_dashboard_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="ray_dashboard_snapshot_pkey"),
        sa.UniqueConstraint(
            "dashboard_id",
            "section",
            "collected_at",
            name="ray_dashboard_snapshot_section_collected_uq",
        ),
    )
    op.create_index(
        "idx_ray_dashboard_snapshot_section",
        "ray_dashboard_snapshot",
        ["dashboard_id", "section", "collected_at"],
        unique=False,
    )

    op.create_table(
        "ray_dashboard_metric_sample",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("dashboard_id", sa.Uuid(), nullable=False),
        sa.Column("metric_name", sa.String(length=255), nullable=False),
        sa.Column("metric_unit", sa.String(length=50), nullable=True),
        sa.Column("labels", ExtendedJSON(), nullable=True),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("sampled_at", UtcDateTime(), nullable=False),
        sa.Column("created_at", UtcDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dashboard_id"],
            ["ray_dashboard_task_instance.id"],
            name="ray_dashboard_metric_dashboard_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="ray_dashboard_metric_sample_pkey"),
    )
    op.create_index(
        "idx_ray_dashboard_metric_lookup",
        "ray_dashboard_metric_sample",
        ["dashboard_id", "metric_name", "sampled_at"],
        unique=False,
    )


def downgrade():
    """Remove Ray Dashboard task instance tables."""
    op.drop_index("idx_ray_dashboard_metric_lookup", table_name="ray_dashboard_metric_sample")
    op.drop_table("ray_dashboard_metric_sample")
    op.drop_index("idx_ray_dashboard_snapshot_section", table_name="ray_dashboard_snapshot")
    op.drop_table("ray_dashboard_snapshot")
    op.drop_index("idx_ray_dashboard_ti_lookup", table_name="ray_dashboard_task_instance")
    op.drop_table("ray_dashboard_task_instance")
