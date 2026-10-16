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
"""Routes for the shared configuration used to manually trigger a DAG."""

from __future__ import annotations

import structlog
from fastapi import Depends, HTTPException, status
from sqlalchemy import select

from airflow.api_fastapi.auth.managers.models.resource_details import DagAccessEntity
from airflow.api_fastapi.common.db.common import SessionDep
from airflow.api_fastapi.common.router import AirflowRouter
from airflow.api_fastapi.core_api.datamodels.dag_trigger_config import (
    DAGTriggerConfigBody,
    DAGTriggerConfigResponse,
)
from airflow.api_fastapi.core_api.openapi.exceptions import create_openapi_http_exception_doc
from airflow.api_fastapi.core_api.security import requires_access_dag
from airflow.api_fastapi.logging.decorators import action_logging
from airflow.models.dag import DagModel
from airflow.models.dag_trigger_config import DagTriggerConfig

log = structlog.get_logger(__name__)

dag_trigger_config_router = AirflowRouter(tags=["DagTriggerConfig"], prefix="/dags/{dag_id}/trigger-config")


def _get_dag_trigger_config(dag_id: str, session: SessionDep) -> DagTriggerConfig | None:
    dag_model = session.scalar(select(DagModel).where(~DagModel.is_stale, DagModel.dag_id == dag_id).limit(1))
    if not dag_model:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"DAG with dag_id: '{dag_id}' not found")
    return session.get(DagTriggerConfig, dag_id)


@dag_trigger_config_router.get(
    "",
    responses=create_openapi_http_exception_doc([status.HTTP_404_NOT_FOUND]),
    dependencies=[Depends(requires_access_dag(method="GET", access_entity=DagAccessEntity.RUN))],
)
def get_dag_trigger_config(dag_id: str, session: SessionDep) -> DAGTriggerConfigResponse:
    """Get a DAG's shared manual-trigger configuration."""
    config = _get_dag_trigger_config(dag_id, session)
    if not config:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No saved trigger configuration found")
    return config


@dag_trigger_config_router.put(
    "",
    responses=create_openapi_http_exception_doc([status.HTTP_404_NOT_FOUND]),
    dependencies=[
        Depends(requires_access_dag(method="PUT", access_entity=DagAccessEntity.RUN)),
        Depends(action_logging()),
    ],
)
def put_dag_trigger_config(
    dag_id: str, body: DAGTriggerConfigBody, session: SessionDep
) -> DAGTriggerConfigResponse:
    """Create or replace a DAG's shared manual-trigger configuration."""
    log.info("Received DAG trigger configuration", dag_id=dag_id, json_conf=body.conf.get("json_conf"))
    config = _get_dag_trigger_config(dag_id, session)
    if config:
        config.conf = body.conf
    else:
        config = DagTriggerConfig(dag_id=dag_id, conf=body.conf)
        session.add(config)
    # Flush before serializing the response so ``updated_at`` is current for both
    # creates and replacements.
    session.flush()
    return config
