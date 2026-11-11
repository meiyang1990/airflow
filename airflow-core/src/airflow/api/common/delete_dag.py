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
"""Delete DAGs APIs."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, cast

from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError

from airflow import models
from airflow._shared.timezones import timezone
from airflow.exceptions import AirflowException, DagNotFound
from airflow.models import DagModel, DagRun
from airflow.models.dag_lifecycle import DagLifecycle
from airflow.models.errors import ParseImportError
from airflow.models.taskinstance import TaskInstance
from airflow.utils.db import get_sqla_model_classes
from airflow.utils.session import NEW_SESSION, provide_session
from airflow.utils.sqlalchemy import is_lock_not_available_error
from airflow.utils.state import DagRunState, TaskInstanceState

if TYPE_CHECKING:
    from sqlalchemy.engine import CursorResult, Result
    from sqlalchemy.orm import Session

log = logging.getLogger(__name__)


class DagDeletionConflict(AirflowException):
    """A DAG cannot be deleted while execution is still active."""


@provide_session
def delete_dag(dag_id: str, keep_records_in_log: bool = True, *, session: Session = NEW_SESSION) -> int:
    """
    Delete a DAG by a dag_id.

    :param dag_id: the dag_id of the DAG to delete
    :param keep_records_in_log: whether keep records of the given dag_id
        in the Log table in the backend database (for reasons like auditing).
        The default value is True.
    :param session: session used
    :return count of deleted dags
    """
    log.info("Deleting DAG: %s", dag_id)
    lifecycle = DagLifecycle.lock([dag_id], session=session)[dag_id]
    if lifecycle.deleted_at is not None:
        return 0
    # The scheduler already holds DagModel locks when creating runs. Do not wait
    # for that lock while holding the lifecycle lock (the reverse lock order).
    try:
        dag = session.scalar(select(DagModel).where(DagModel.dag_id == dag_id).with_for_update(nowait=True))
    except OperationalError as error:
        if is_lock_not_available_error(error):
            raise DagDeletionConflict("DAG is being scheduled; retry deletion when it is idle") from error
        raise
    if dag is None:
        raise DagNotFound(f"Dag id {dag_id} not found")
    running_tis = session.scalar(
        select(models.TaskInstance.state)
        .where(models.TaskInstance.dag_id == dag_id)
        .where(models.TaskInstance.state == TaskInstanceState.RUNNING)
        .limit(1)
    )
    active_run = session.scalar(
        select(DagRun.id)
        .where(DagRun.dag_id == dag_id, DagRun.state.in_([DagRunState.QUEUED, DagRunState.RUNNING]))
        .limit(1)
    )
    if running_tis or active_run is not None:
        raise DagDeletionConflict("DAG runs or task instances are still active")

    lifecycle.deleted_at = timezone.utcnow()
    lifecycle.bundle_name = dag.bundle_name
    lifecycle.team_name = DagModel.get_team_name(dag_id, session=session)
    session.flush()

    # To ensure the TaskInstance and DagRun model is deleted before
    # each of the model DagVersion and BackFill respectively.
    models_for_deletion = [TaskInstance, DagRun] + [
        model
        for model in get_sqla_model_classes()
        if model.__name__ not in ["TaskInstance", "DagRun", "DagLifecycle"]
    ]

    count: int = 0
    for model in models_for_deletion:
        if hasattr(model, "dag_id") and (not keep_records_in_log or model.__name__ != "Log"):
            result: Result = session.execute(
                delete(model).where(model.dag_id == dag_id).execution_options(synchronize_session="fetch")
            )
            cursor_result = cast("CursorResult", result)
            count += cursor_result.rowcount

    # Delete entries in Import Errors table for a deleted DAG
    # This handles the case when the dag_id is changed in the file
    session.execute(
        delete(ParseImportError)
        .where(
            ParseImportError.filename == dag.relative_fileloc,
            ParseImportError.bundle_name == dag.bundle_name,
        )
        .execution_options(synchronize_session="fetch")
    )

    return count
