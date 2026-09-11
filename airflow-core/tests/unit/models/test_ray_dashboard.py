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
from sqlalchemy import delete, func, select

from airflow._shared.timezones import timezone
from airflow.models.ray_dashboard import (
    RayDashboardMetricSample,
    RayDashboardSection,
    RayDashboardSnapshot,
    RayDashboardTaskInstance,
    add_ray_dashboard_metric_samples,
    add_ray_dashboard_snapshot,
    get_ray_dashboard_task_instance,
    list_ray_dashboard_metric_samples,
    list_ray_dashboard_snapshots,
    upsert_ray_dashboard_task_instance,
)
from airflow.providers.standard.operators.empty import EmptyOperator

pytestmark = pytest.mark.db_test


@pytest.fixture(autouse=True)
def clean_ray_dashboard(session):
    session.execute(delete(RayDashboardMetricSample))
    session.execute(delete(RayDashboardSnapshot))
    session.execute(delete(RayDashboardTaskInstance))
    session.commit()


@pytest.fixture
def task_instance(dag_maker):
    with dag_maker("ray_dashboard_dag"):
        EmptyOperator(task_id="ray_task")
    dag_run = dag_maker.create_dagrun()
    return dag_run.task_instances[0]


def test_upsert_ray_dashboard_metadata(session, task_instance):
    dashboard = upsert_ray_dashboard_task_instance(
        dag_id=task_instance.dag_id,
        run_id=task_instance.run_id,
        task_id=task_instance.task_id,
        map_index=task_instance.map_index,
        try_number=task_instance.try_number,
        dashboard_url="http://ray-head:8265",
        ray_job_id="ray-job-1",
        status="RUNNING",
        session=session,
    )
    session.flush()

    updated = upsert_ray_dashboard_task_instance(
        dag_id=task_instance.dag_id,
        run_id=task_instance.run_id,
        task_id=task_instance.task_id,
        map_index=task_instance.map_index,
        try_number=task_instance.try_number,
        status="SUCCEEDED",
        session=session,
    )
    session.flush()

    assert updated.id == dashboard.id
    assert updated.dashboard_url == "http://ray-head:8265"
    assert updated.ray_job_id == "ray-job-1"
    assert updated.status == "SUCCEEDED"
    assert session.scalar(select(func.count()).select_from(RayDashboardTaskInstance)) == 1


def test_try_numbers_are_separate(session, task_instance):
    first_try = upsert_ray_dashboard_task_instance(
        dag_id=task_instance.dag_id,
        run_id=task_instance.run_id,
        task_id=task_instance.task_id,
        map_index=task_instance.map_index,
        try_number=1,
        ray_job_id="ray-job-try-1",
        session=session,
    )
    second_try = upsert_ray_dashboard_task_instance(
        dag_id=task_instance.dag_id,
        run_id=task_instance.run_id,
        task_id=task_instance.task_id,
        map_index=task_instance.map_index,
        try_number=2,
        ray_job_id="ray-job-try-2",
        session=session,
    )
    session.flush()

    assert first_try.id != second_try.id
    assert (
        get_ray_dashboard_task_instance(
            dag_id=task_instance.dag_id,
            run_id=task_instance.run_id,
            task_id=task_instance.task_id,
            map_index=task_instance.map_index,
            try_number=1,
            session=session,
        ).ray_job_id
        == "ray-job-try-1"
    )
    assert (
        get_ray_dashboard_task_instance(
            dag_id=task_instance.dag_id,
            run_id=task_instance.run_id,
            task_id=task_instance.task_id,
            map_index=task_instance.map_index,
            try_number=2,
            session=session,
        ).ray_job_id
        == "ray-job-try-2"
    )


def test_snapshot_and_metric_queries(session, task_instance):
    dashboard = upsert_ray_dashboard_task_instance(
        dag_id=task_instance.dag_id,
        run_id=task_instance.run_id,
        task_id=task_instance.task_id,
        map_index=task_instance.map_index,
        try_number=task_instance.try_number,
        session=session,
    )
    session.flush()
    collected_at = timezone.utcnow()

    add_ray_dashboard_snapshot(
        dashboard=dashboard,
        section=RayDashboardSection.JOBS,
        payload={"jobs": [{"id": "ray-job"}]},
        collected_at=collected_at,
        source_status="ok",
        session=session,
    )
    add_ray_dashboard_metric_samples(
        dashboard=dashboard,
        samples=[
            {
                "metric_name": "ray_node_cpu_utilization",
                "metric_unit": "percent",
                "labels": {"node": "head"},
                "sampled_at": collected_at,
                "value": 42.0,
            }
        ],
        session=session,
    )
    session.flush()

    snapshots = list(
        list_ray_dashboard_snapshots(
            dashboard_id=dashboard.id,
            section=RayDashboardSection.JOBS,
            session=session,
        )
    )
    metric_samples = list(
        list_ray_dashboard_metric_samples(
            dashboard_id=dashboard.id,
            metric_name="ray_node_cpu_utilization",
            session=session,
        )
    )

    assert len(snapshots) == 1
    assert snapshots[0].payload == {"jobs": [{"id": "ray-job"}]}
    assert len(metric_samples) == 1
    assert metric_samples[0].labels == {"node": "head"}
    assert metric_samples[0].value == 42.0


def test_missing_ray_dashboard_record_returns_none(session, task_instance):
    assert (
        get_ray_dashboard_task_instance(
            dag_id=task_instance.dag_id,
            run_id=task_instance.run_id,
            task_id=task_instance.task_id,
            map_index=task_instance.map_index,
            try_number=99,
            session=session,
        )
        is None
    )


def test_snapshot_and_metric_pagination(session, task_instance):
    dashboard = upsert_ray_dashboard_task_instance(
        dag_id=task_instance.dag_id,
        run_id=task_instance.run_id,
        task_id=task_instance.task_id,
        map_index=task_instance.map_index,
        try_number=task_instance.try_number,
        session=session,
    )
    session.flush()
    first_collected_at = timezone.datetime(2026, 1, 1)
    second_collected_at = timezone.datetime(2026, 1, 2)

    add_ray_dashboard_snapshot(
        dashboard=dashboard,
        section=RayDashboardSection.TASKS,
        payload={"tasks": [{"id": "first"}]},
        collected_at=first_collected_at,
        session=session,
    )
    add_ray_dashboard_snapshot(
        dashboard=dashboard,
        section=RayDashboardSection.TASKS,
        payload={"tasks": [{"id": "second"}]},
        collected_at=second_collected_at,
        session=session,
    )
    add_ray_dashboard_metric_samples(
        dashboard=dashboard,
        samples=[
            {
                "metric_name": "ray_actor_count",
                "sampled_at": first_collected_at,
                "value": 1,
            },
            {
                "metric_name": "ray_actor_count",
                "sampled_at": second_collected_at,
                "value": 2,
            },
        ],
        session=session,
    )
    session.flush()

    snapshots = list(
        list_ray_dashboard_snapshots(
            dashboard_id=dashboard.id,
            limit=1,
            offset=1,
            session=session,
        )
    )
    metric_samples = list(
        list_ray_dashboard_metric_samples(
            dashboard_id=dashboard.id,
            limit=1,
            offset=1,
            session=session,
        )
    )

    assert len(snapshots) == 1
    assert snapshots[0].payload == {"tasks": [{"id": "first"}]}
    assert len(metric_samples) == 1
    assert metric_samples[0].value == 2
