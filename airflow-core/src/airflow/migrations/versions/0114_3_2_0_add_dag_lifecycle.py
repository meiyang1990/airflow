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
Persist permanent DAG deletion intent.

Revision ID: 2e879bc6a120
Revises: 1c31f3f5d9ae
Create Date: 2026-11-11 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from airflow.migrations.db_types import StringID
from airflow.utils.sqlalchemy import UtcDateTime

revision = "2e879bc6a120"
down_revision = "1c31f3f5d9ae"
branch_labels = None
depends_on = None
airflow_version = "3.2.0"


def upgrade():
    """Create independent lifecycle records without changing existing DAGs."""
    op.create_table(
        "dag_lifecycle",
        sa.Column("dag_id", StringID(), nullable=False),
        sa.Column("deleted_at", UtcDateTime(), nullable=True),
        sa.Column("bundle_name", StringID(), nullable=True),
        sa.Column("team_name", sa.String(100), nullable=True),
        sa.PrimaryKeyConstraint("dag_id", name="dag_lifecycle_pkey"),
    )


def downgrade():
    """Refuse to discard permanent deletion intent."""
    table = sa.table("dag_lifecycle", sa.column("deleted_at"))
    if op.get_bind().scalar(
        sa.select(sa.func.count()).select_from(table).where(table.c.deleted_at.is_not(None))
    ):
        raise RuntimeError("Cannot downgrade while permanently deleted DAGs exist")
    op.drop_table("dag_lifecycle")
