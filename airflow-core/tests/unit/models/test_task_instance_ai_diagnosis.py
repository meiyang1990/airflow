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

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from airflow.models.dagbundle import DagBundleModel
from airflow.models.task_instance_ai_diagnosis import (
    TaskInstanceAIDiagnosis,
    get_task_instance_ai_diagnosis,
)
from airflow.utils.state import State

pytestmark = pytest.mark.db_test


@pytest.fixture(autouse=True)
def clean_ai_diagnosis(session):
    TaskInstanceAIDiagnosis.__table__.drop(session.bind, checkfirst=True)
    TaskInstanceAIDiagnosis.__table__.create(session.bind, checkfirst=True)
    if session.get(DagBundleModel, "dag_maker") is None:
        session.add(DagBundleModel(name="dag_maker"))
    session.execute(delete(TaskInstanceAIDiagnosis))
    session.commit()


def _diagnosis_for_ti(ti, **kwargs):
    values = {
        "dag_id": ti.dag_id,
        "run_id": ti.run_id,
        "task_id": ti.task_id,
        "map_index": ti.map_index,
        "try_number": ti.try_number,
        "state": ti.state,
        "log_line_count": 10,
        "log_excerpt_sha256": "a" * 64,
        "summary": "Database connection timed out.",
        "diagnosis_items": [{"category": "root cause", "finding": "timeout"}],
    }
    values.update(kwargs)
    return TaskInstanceAIDiagnosis(**values)


def test_store_and_get_task_instance_ai_diagnosis(session, create_task_instance):
    ti = create_task_instance(task_id="ai_diagnosis_model", state=State.FAILED)
    diagnosis = _diagnosis_for_ti(ti)
    session.add(diagnosis)
    session.flush()

    fetched = get_task_instance_ai_diagnosis(
        dag_id=ti.dag_id,
        run_id=ti.run_id,
        task_id=ti.task_id,
        map_index=ti.map_index,
        try_number=ti.try_number,
        session=session,
    )

    assert fetched.id == diagnosis.id
    assert fetched.diagnosis_items == [{"category": "root cause", "finding": "timeout"}]


def test_task_instance_ai_diagnosis_unique_per_try(session, create_task_instance):
    ti = create_task_instance(task_id="ai_diagnosis_unique", state=State.FAILED)
    session.add(_diagnosis_for_ti(ti))
    session.add(_diagnosis_for_ti(ti, summary="duplicate"))

    with pytest.raises(IntegrityError):
        session.flush()
