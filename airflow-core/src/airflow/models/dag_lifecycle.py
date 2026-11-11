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
"""Permanent DAG deletion records and transaction-scoped registration locks."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Mapped, mapped_column

from airflow.models.base import Base, StringID
from airflow.utils.sqlalchemy import UtcDateTime

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from sqlalchemy.sql.dml import Insert


class DagLifecycle(Base):
    """Stable locks and irreversible deletion markers, independent of DAG metadata."""

    __tablename__ = "dag_lifecycle"

    dag_id: Mapped[str] = mapped_column(StringID(), primary_key=True)
    deleted_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    bundle_name: Mapped[str | None] = mapped_column(StringID(), nullable=True)
    team_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    @classmethod
    def lock(cls, dag_ids: Iterable[str], *, session: Session) -> dict[str, DagLifecycle]:
        """
        Lock IDs until the caller's transaction ends, including previously unseen IDs.

        The upsert also serializes SQLite writers, where SELECT FOR UPDATE is
        unavailable. Never delete these rows during metadata cleanup:
        that would remove both the permanent marker and the stable lock identity.
        """
        ids = sorted(set(dag_ids))
        if not ids:
            return {}
        transaction = session.get_nested_transaction() or session.get_transaction()
        cached_transaction, locked = session.info.get("dag_lifecycle_locks", (None, {}))
        if transaction is None or transaction is not cached_transaction:
            locked = {}
        missing = [dag_id for dag_id in ids if dag_id not in locked]
        if not missing:
            return {dag_id: locked[dag_id] for dag_id in ids}

        dialect = session.get_bind().dialect.name
        stmt: Insert
        values = [{"dag_id": dag_id} for dag_id in missing]
        if dialect == "postgresql":
            stmt = postgres_insert(cls).values(values).on_conflict_do_nothing()
        elif dialect == "sqlite":
            stmt = sqlite_insert(cls).values(values).on_conflict_do_nothing()
        elif dialect == "mysql":
            mysql_stmt = mysql_insert(cls).values(values)
            stmt = mysql_stmt.on_duplicate_key_update(dag_id=mysql_stmt.inserted.dag_id)
        else:
            raise ValueError(f"Unsupported DAG lifecycle database: {dialect}")
        session.execute(stmt)
        locked.update(
            {
                row.dag_id: row
                for row in session.scalars(
                    select(cls)
                    .where(cls.dag_id.in_(missing))
                    .order_by(cls.dag_id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            }
        )
        # A savepoint rollback can release locks acquired inside it. Reuse only
        # within the exact SessionTransaction, never across commit or rollback.
        session.info["dag_lifecycle_locks"] = (
            session.get_nested_transaction() or session.get_transaction(),
            locked,
        )
        return {dag_id: locked[dag_id] for dag_id in ids}
