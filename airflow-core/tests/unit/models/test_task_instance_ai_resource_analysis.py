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
from airflow.models.task_instance_ai_resource_analysis import (
    TaskInstanceAIResourceAnalysis,
    get_task_instance_ai_resource_analysis,
)
from airflow.utils.state import State

pytestmark = pytest.mark.db_test


@pytest.fixture(autouse=True)
def clean_ai_resource_analysis(session):
    TaskInstanceAIResourceAnalysis.__table__.drop(session.bind, checkfirst=True)
    TaskInstanceAIResourceAnalysis.__table__.create(session.bind, checkfirst=True)
    if session.get(DagBundleModel, "dag_maker") is None:
        session.add(DagBundleModel(name="dag_maker"))
    session.execute(delete(TaskInstanceAIResourceAnalysis))
    session.commit()


def _analysis_for_ti(ti, **kwargs):
    values = {
        "dag_id": ti.dag_id,
        "run_id": ti.run_id,
        "task_id": ti.task_id,
        "map_index": ti.map_index,
        "try_number": ti.try_number,
        "state": ti.state,
        "analysis_schema_version": "1",
        "ray_payload_sha256": "a" * 64,
        "summary": "Worker CPU is idle.",
        "analysis_items": [{"resource": "cpu", "scope": "worker-1"}],
    }
    values.update(kwargs)
    return TaskInstanceAIResourceAnalysis(**values)


def test_resource_analysis_is_cached_by_input_fingerprint(session, create_task_instance):
    ti = create_task_instance(task_id="ai_resource_analysis_model", state=State.SUCCESS)
    analysis = _analysis_for_ti(ti)
    session.add(analysis)
    session.flush()

    cached = get_task_instance_ai_resource_analysis(
        dag_id=ti.dag_id,
        run_id=ti.run_id,
        task_id=ti.task_id,
        map_index=ti.map_index,
        try_number=ti.try_number,
        analysis_schema_version="1",
        ray_payload_sha256="a" * 64,
        session=session,
    )

    assert cached is not None
    assert cached.id == analysis.id
    assert (
        get_task_instance_ai_resource_analysis(
            dag_id=ti.dag_id,
            run_id=ti.run_id,
            task_id=ti.task_id,
            map_index=ti.map_index,
            try_number=ti.try_number,
            analysis_schema_version="1",
            ray_payload_sha256="b" * 64,
            session=session,
        )
        is None
    )


def test_resource_analysis_unique_per_input_version(session, create_task_instance):
    ti = create_task_instance(task_id="ai_resource_analysis_unique", state=State.SUCCESS)
    session.add(_analysis_for_ti(ti))
    session.add(_analysis_for_ti(ti, summary="duplicate"))

    with pytest.raises(IntegrityError):
        session.flush()


def test_resource_analysis_cache_identity_includes_task_attempt(session, create_task_instance):
    ti = create_task_instance(task_id="ai_resource_analysis_attempt", state=State.SUCCESS)
    session.add(_analysis_for_ti(ti))
    session.flush()

    assert (
        get_task_instance_ai_resource_analysis(
            dag_id=ti.dag_id,
            run_id=ti.run_id,
            task_id=ti.task_id,
            map_index=ti.map_index,
            try_number=ti.try_number + 1,
            analysis_schema_version="1",
            ray_payload_sha256="a" * 64,
            session=session,
        )
        is None
    )
