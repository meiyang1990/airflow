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
Add shared DAG trigger configuration.

Revision ID: 3bc63d0865e2
Revises: 8b05f4a7c9d1
Create Date: 2026-10-14 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from airflow.migrations.db_types import StringID
from airflow.utils.sqlalchemy import UtcDateTime

revision = "3bc63d0865e2"
down_revision = "8b05f4a7c9d1"
branch_labels = None
depends_on = None
airflow_version = "3.2.0"


def upgrade():
    """Add the shared configuration for manually triggering a DAG."""
    op.create_table(
        "dag_trigger_config",
        sa.Column("dag_id", StringID(), nullable=False),
        sa.Column("conf", sa.JSON(), nullable=False),
        sa.Column("updated_at", UtcDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dag_id"], ["dag.dag_id"], name="dag_trigger_config_dag_id_fkey", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("dag_id", name="dag_trigger_config_pkey"),
    )


def downgrade():
    """Remove the shared configuration for manually triggering a DAG."""
    op.drop_table("dag_trigger_config")
