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

from unittest.mock import patch

import pytest
from sqlalchemy import delete, select

from airflow.models import DagRun
from airflow.models.dag_trigger_config import DagTriggerConfig
from airflow.providers.standard.operators.empty import EmptyOperator

from tests_common.test_utils.api_fastapi import _check_last_log
from tests_common.test_utils.db import (
    clear_db_dag_bundles,
    clear_db_dags,
    clear_db_logs,
    clear_db_serialized_dags,
)

pytestmark = pytest.mark.db_test

DAG_ID = "test_dag"
URL = f"/dags/{DAG_ID}/trigger-config"


class TestDagTriggerConfig:
    @pytest.fixture(autouse=True)
    def setup(self, dag_maker, session):
        session.execute(delete(DagTriggerConfig))
        session.commit()
        clear_db_dags()
        clear_db_dag_bundles()
        clear_db_serialized_dags()
        clear_db_logs()

        with dag_maker(DAG_ID, schedule=None):
            EmptyOperator(task_id="task")
        dag_maker.sync_dagbag_to_db()

    def test_save_get_and_replace_configuration_without_dag_run(self, test_client, session):
        conf = {"json_conf": {"environment": "staging"}, "batch_size": 100}
        initial_response = test_client.put(URL, json={"conf": conf})

        assert initial_response.status_code == 200
        assert initial_response.json()["dag_id"] == DAG_ID
        assert initial_response.json()["conf"] == conf
        assert initial_response.json()["updated_at"]
        assert session.scalars(select(DagTriggerConfig).where(DagTriggerConfig.dag_id == DAG_ID)).all()
        assert session.scalar(select(DagTriggerConfig).where(DagTriggerConfig.dag_id == DAG_ID)).conf == conf
        assert not session.scalars(select(DagRun).where(DagRun.dag_id == DAG_ID)).all()
        _check_last_log(
            session,
            dag_id=DAG_ID,
            event="put_dag_trigger_config",
            logical_date=None,
            expected_extra={"method": "PUT"},
        )

    def test_replace_configuration(self, test_client, session):
        test_client.put(URL, json={"conf": {"json_conf": {"old": True}}})
        replacement_response = test_client.put(URL, json={"conf": {"json_conf": {}}})

        assert replacement_response.status_code == 200
        assert replacement_response.json()["conf"] == {"json_conf": {}}
        assert (
            len(session.scalars(select(DagTriggerConfig).where(DagTriggerConfig.dag_id == DAG_ID)).all()) == 1
        )
        get_response = test_client.get(URL)

        assert get_response.json()["conf"] == {"json_conf": {}}
        assert get_response.headers["cache-control"] == "no-store"

    def test_save_logs_json_conf_received_from_the_client(self, test_client):
        json_conf = {"dag": {"tags": ["staged_pipeline"]}}

        with patch("airflow.api_fastapi.core_api.routes.public.dag_trigger_config.log.info") as log_info:
            response = test_client.put(URL, json={"conf": {"json_conf": json_conf}})

        assert response.status_code == 200
        log_info.assert_called_once_with(
            "Received DAG trigger configuration", dag_id=DAG_ID, json_conf=json_conf
        )

    def test_get_unsaved_configuration_returns_not_found(self, test_client):
        response = test_client.get(URL)

        assert response.status_code == 404
        assert response.json()["detail"] == "No saved trigger configuration found"

    def test_missing_dag_returns_not_found(self, test_client):
        response = test_client.put("/dags/missing/trigger-config", json={"conf": {"json_conf": {}}})

        assert response.status_code == 404
        assert response.json()["detail"] == "DAG with dag_id: 'missing' not found"

    @pytest.mark.parametrize("client_fixture", ["unauthenticated_test_client", "unauthorized_test_client"])
    def test_save_requires_dag_run_access(self, request, client_fixture, session):
        client = request.getfixturevalue(client_fixture)

        response = client.put(URL, json={"conf": {"json_conf": {"environment": "production"}}})

        assert response.status_code in {401, 403}
        assert session.scalar(select(DagTriggerConfig).where(DagTriggerConfig.dag_id == DAG_ID)) is None

    @pytest.mark.parametrize("conf", [[], "value", 1, None])
    def test_save_requires_a_json_object(self, test_client, conf, session):
        response = test_client.put(URL, json={"conf": conf})

        assert response.status_code == 422
        assert session.scalar(select(DagTriggerConfig).where(DagTriggerConfig.dag_id == DAG_ID)) is None

    @pytest.mark.parametrize("body", [{}, {"conf": {}}, {"conf": {"workflow": {}}}])
    @pytest.mark.parametrize("existing", [False, True])
    def test_missing_required_fields_do_not_change_configuration(self, test_client, session, body, existing):
        original = {"json_conf": {"keep": True}, "batch_size": 100}
        if existing:
            assert test_client.put(URL, json={"conf": original}).status_code == 200

        response = test_client.put(URL, json=body)

        assert response.status_code == 422
        error = response.json()["detail"][0]
        assert error["loc"] == ["body", "conf"]
        assert error["type"] == ("missing" if "conf" not in body else "value_error")
        session.expire_all()
        saved = session.get(DagTriggerConfig, DAG_ID)
        assert (saved.conf if saved else None) == (original if existing else None)

    @pytest.mark.parametrize("value", [{}, None, False, 0, "", []])
    def test_json_conf_presence_is_not_a_truthiness_check(self, test_client, value):
        conf = {"json_conf": value, "batch_size": 100}
        response = test_client.put(URL, json={"conf": conf})

        assert response.status_code == 200
        assert response.json()["conf"] == conf
