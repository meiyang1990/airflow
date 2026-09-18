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
"""Short-lived tokens for Ray Dashboard ingestion."""

from __future__ import annotations

import hmac
from uuid import UUID

from fastapi import HTTPException, status

from airflow.api_fastapi.auth.tokens import JWTGenerator, get_signing_args
from airflow.configuration import conf

RAY_DASHBOARD_INGESTION_CLAIM = "ray_dashboard_ingestion"
RAY_DASHBOARD_STATIC_INGESTION_CLAIM = "ray_dashboard_static_ingestion"
RAY_DASHBOARD_STATIC_INGESTION_TOKEN_OPTION = "ray_dashboard_ingestion_token"


def get_static_ray_dashboard_ingestion_token() -> str:
    """Return the configured static Ray Dashboard ingestion token, if any."""
    return conf.get("api_auth", RAY_DASHBOARD_STATIC_INGESTION_TOKEN_OPTION, fallback="").strip()


def is_static_ray_dashboard_ingestion_token(token: str) -> bool:
    """Check whether a bearer token matches the configured static ingestion token."""
    configured_token = get_static_ray_dashboard_ingestion_token()
    return bool(configured_token and hmac.compare_digest(configured_token, token))


def generate_ray_dashboard_ingestion_token(
    *,
    task_instance_id: UUID | str,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    valid_for: int,
) -> str:
    """Generate a short-lived token scoped to one task attempt's Ray Dashboard ingestion."""
    generator = JWTGenerator(
        valid_for=valid_for,
        audience=conf.get_mandatory_list_value("execution_api", "jwt_audience")[0],
        issuer=conf.get("api_auth", "jwt_issuer", fallback=None),
        **get_signing_args(make_secret_key_if_needed=False),
    )
    return generator.generate(
        {
            "sub": str(task_instance_id),
            "scope": "execution",
            RAY_DASHBOARD_INGESTION_CLAIM: True,
            "dag_id": dag_id,
            "run_id": run_id,
            "task_id": task_id,
            "map_index": map_index,
            "try_number": try_number,
        }
    )


def validate_ray_dashboard_ingestion_claims(
    *,
    claims: dict,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
) -> None:
    """Validate that token claims authorize ingestion for the requested task attempt."""
    expected_claims = {
        RAY_DASHBOARD_INGESTION_CLAIM: True,
        "dag_id": dag_id,
        "run_id": run_id,
        "task_id": task_id,
        "map_index": map_index,
        "try_number": try_number,
    }
    for claim, expected_value in expected_claims.items():
        if claims.get(claim) != expected_value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Ray Dashboard ingestion token claim mismatch: {claim}",
            )
