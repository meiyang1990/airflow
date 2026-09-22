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

from collections.abc import Iterable, Sequence
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

import uuid6
from sqlalchemy import (
    Float,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    select,
)
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column, relationship

from airflow._shared.timezones import timezone
from airflow.models.base import Base, StringID
from airflow.utils.session import NEW_SESSION, provide_session
from airflow.utils.sqlalchemy import ExtendedJSON, UtcDateTime

if TYPE_CHECKING:
    from sqlalchemy.orm.session import Session


RAY_DASHBOARD_MAX_SECTION_PAYLOAD_BYTES = 1024 * 1024
RAY_DASHBOARD_MAX_METRIC_BATCH_SIZE = 1000
RAY_DASHBOARD_METRIC_POD_NAME_LABEL_KEYS = ("pod_name", "pod", "PodName", "podName")
RAY_DASHBOARD_METRIC_POD_ID_LABEL_KEYS = ("pod_id", "pod_uid", "PodID", "podId")
RAY_DASHBOARD_METRIC_POD_IP_LABEL_KEYS = (
    "ip",
    "IP",
    "Ip",
    "podIp",
    "podIP",
    "pod_ip",
    "PodIP",
    "PodIp",
    "nodeAddress",
    "node_address",
    "NodeAddress",
)
RAY_DASHBOARD_METRIC_ACTOR_NAME_LABEL_KEYS = ("actor_name", "ActorName", "name", "Name", "actor")
RAY_DASHBOARD_METRIC_ACTOR_CLASS_LABEL_KEYS = ("actor_class", "ActorClass", "class_name", "ClassName")
RAY_DASHBOARD_METRIC_ACTOR_ID_LABEL_KEYS = ("actor_id", "ActorID", "id")
RAY_DASHBOARD_NODE_TYPE_NAME_METRIC_NAMES = {
    "ray_cluster_active_nodes",
    "ray_node_cpu_count",
    "ray_node_cpu_utilization",
    "ray_node_disk_free",
    "ray_node_disk_usage",
    "ray_node_mem_available",
    "ray_node_mem_total",
    "ray_node_mem_used",
}
RAY_DASHBOARD_NODE_TYPE_NAME_LABEL_KEYS = ("node_type", "RayNodeType")
RAY_DASHBOARD_TASKS_METRIC_NAME = "ray_tasks"
RAY_DASHBOARD_TASKS_NAME_LABEL_KEYS = ("Name",)
RAY_DASHBOARD_TASKS_STATE_LABEL_KEYS = ("State",)


class RayDashboardSection(StrEnum):
    """Ray Dashboard sections supported by the Airflow task instance tab."""

    OVERVIEW = "overview"
    JOBS = "jobs"
    CLUSTER = "cluster"
    ACTORS = "actors"
    TASKS = "tasks"
    PLACEMENT_GROUPS = "placement_groups"
    OBJECTS = "objects"
    METRICS = "metrics"
    LOGS = "logs"
    EVENTS = "events"
    SERVE = "serve"
    RAY_DATA = "ray_data"


RAY_DASHBOARD_SECTIONS = tuple(section.value for section in RayDashboardSection)


class RayDashboardTaskInstance(Base):
    """Ray Dashboard data root for a single task instance attempt."""

    __tablename__ = "ray_dashboard_task_instance"

    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid6.uuid7)
    dag_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    run_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    task_id: Mapped[str] = mapped_column(StringID(), nullable=False)
    map_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="-1")
    try_number: Mapped[int] = mapped_column(Integer, nullable=False)
    dashboard_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    ray_cluster_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ray_cluster_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ray_namespace: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ray_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ray_submission_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    collector_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    collector_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    collector_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        MutableDict.as_mutable(ExtendedJSON), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=timezone.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=timezone.utcnow, onupdate=timezone.utcnow, nullable=False
    )

    snapshots = relationship(
        "RayDashboardSnapshot",
        back_populates="dashboard",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    metric_samples = relationship(
        "RayDashboardMetricSample",
        back_populates="dashboard",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        ForeignKeyConstraint(
            [dag_id, task_id, run_id, map_index],
            [
                "task_instance.dag_id",
                "task_instance.task_id",
                "task_instance.run_id",
                "task_instance.map_index",
            ],
            name="ray_dashboard_ti_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        UniqueConstraint(
            "dag_id",
            "run_id",
            "task_id",
            "map_index",
            "try_number",
            name="ray_dashboard_task_instance_attempt_uq",
        ),
        Index("idx_ray_dashboard_ti_lookup", dag_id, run_id, task_id, map_index, try_number),
    )


class RayDashboardSnapshot(Base):
    """Bounded dashboard section payload collected for a Ray task attempt."""

    __tablename__ = "ray_dashboard_snapshot"

    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid6.uuid7)
    dashboard_id: Mapped[UUID] = mapped_column(Uuid(), nullable=False)
    section: Mapped[str] = mapped_column(String(50), nullable=False)
    source_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(ExtendedJSON, nullable=True)
    collected_at: Mapped[datetime] = mapped_column(UtcDateTime, default=timezone.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=timezone.utcnow, nullable=False)

    dashboard = relationship("RayDashboardTaskInstance", back_populates="snapshots")

    __table_args__ = (
        ForeignKeyConstraint(
            [dashboard_id],
            ["ray_dashboard_task_instance.id"],
            name="ray_dashboard_snapshot_dashboard_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        UniqueConstraint(
            "dashboard_id",
            "section",
            "collected_at",
            name="ray_dashboard_snapshot_section_collected_uq",
        ),
        Index("idx_ray_dashboard_snapshot_section", dashboard_id, section, collected_at),
    )


class RayDashboardMetricSample(Base):
    """Directly sampled Ray metric value for a task attempt."""

    __tablename__ = "ray_dashboard_metric_sample"

    id: Mapped[UUID] = mapped_column(Uuid(), primary_key=True, default=uuid6.uuid7)
    dashboard_id: Mapped[UUID] = mapped_column(Uuid(), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(255), nullable=False)
    metric_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pod_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pod_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pod_ip: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_class: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(String(255), nullable=True)
    labels: Mapped[dict[str, Any] | None] = mapped_column(MutableDict.as_mutable(ExtendedJSON), nullable=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    sampled_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=timezone.utcnow, nullable=False)

    dashboard = relationship("RayDashboardTaskInstance", back_populates="metric_samples")

    __table_args__ = (
        ForeignKeyConstraint(
            [dashboard_id],
            ["ray_dashboard_task_instance.id"],
            name="ray_dashboard_metric_dashboard_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        Index("idx_ray_dashboard_metric_lookup", dashboard_id, metric_name, sampled_at),
        Index("idx_ray_dashboard_metric_actor_lookup", dashboard_id, actor_id, metric_name, sampled_at),
        Index(
            "idx_ray_dashboard_metric_actor_name_lookup", dashboard_id, actor_name, metric_name, sampled_at
        ),
        Index("idx_ray_dashboard_metric_pod_lookup", dashboard_id, pod_name, metric_name, sampled_at),
        Index("idx_ray_dashboard_metric_pod_ip_lookup", dashboard_id, pod_ip, metric_name, sampled_at),
    )


def _first_metric_label_value(labels: dict[str, Any] | None, keys: tuple[str, ...]) -> str | None:
    if not labels:
        return None
    for key in keys:
        value = labels.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _ray_tasks_label_value(sample: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    if sample["metric_name"] != RAY_DASHBOARD_TASKS_METRIC_NAME:
        return None
    return _first_metric_label_value(sample.get("labels"), keys)


def _ray_node_type_label_value(sample: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    if sample["metric_name"] not in RAY_DASHBOARD_NODE_TYPE_NAME_METRIC_NAMES:
        return None
    return _first_metric_label_value(sample.get("labels"), keys)


def _dashboard_query(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
):
    return select(RayDashboardTaskInstance).where(
        RayDashboardTaskInstance.dag_id == dag_id,
        RayDashboardTaskInstance.run_id == run_id,
        RayDashboardTaskInstance.task_id == task_id,
        RayDashboardTaskInstance.map_index == map_index,
        RayDashboardTaskInstance.try_number == try_number,
    )


@provide_session
def get_ray_dashboard_task_instance(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    session: Session = NEW_SESSION,
) -> RayDashboardTaskInstance | None:
    """Return Ray Dashboard data root for a task attempt."""
    return session.scalar(
        _dashboard_query(
            dag_id=dag_id,
            run_id=run_id,
            task_id=task_id,
            map_index=map_index,
            try_number=try_number,
        )
    )


@provide_session
def upsert_ray_dashboard_task_instance(
    *,
    dag_id: str,
    run_id: str,
    task_id: str,
    map_index: int,
    try_number: int,
    dashboard_url: str | None = None,
    ray_cluster_id: str | None = None,
    ray_cluster_name: str | None = None,
    ray_namespace: str | None = None,
    ray_job_id: str | None = None,
    ray_submission_id: str | None = None,
    status: str | None = None,
    collector_status: str | None = None,
    collector_error: str | None = None,
    collector_metadata: dict[str, Any] | None = None,
    session: Session = NEW_SESSION,
) -> RayDashboardTaskInstance:
    """Create or update the Ray Dashboard root row for a task attempt."""
    dashboard = get_ray_dashboard_task_instance(
        dag_id=dag_id,
        run_id=run_id,
        task_id=task_id,
        map_index=map_index,
        try_number=try_number,
        session=session,
    )
    if dashboard is None:
        dashboard = RayDashboardTaskInstance(
            dag_id=dag_id,
            run_id=run_id,
            task_id=task_id,
            map_index=map_index,
            try_number=try_number,
        )
        session.add(dashboard)

    for field, value in {
        "dashboard_url": dashboard_url,
        "ray_cluster_id": ray_cluster_id,
        "ray_cluster_name": ray_cluster_name,
        "ray_namespace": ray_namespace,
        "ray_job_id": ray_job_id,
        "ray_submission_id": ray_submission_id,
        "status": status,
        "collector_status": collector_status,
        "collector_error": collector_error,
        "collector_metadata": collector_metadata,
    }.items():
        if value is not None:
            setattr(dashboard, field, value)
    dashboard.updated_at = timezone.utcnow()
    return dashboard


@provide_session
def add_ray_dashboard_snapshot(
    *,
    dashboard: RayDashboardTaskInstance,
    section: RayDashboardSection | str,
    payload: dict[str, Any] | list[Any] | None,
    collected_at: datetime | None = None,
    source_status: str | None = None,
    source_error: str | None = None,
    session: Session = NEW_SESSION,
) -> RayDashboardSnapshot:
    """Add a collected Ray Dashboard section snapshot."""
    snapshot = RayDashboardSnapshot(
        dashboard=dashboard,
        section=str(section),
        payload=payload,
        collected_at=collected_at or timezone.utcnow(),
        source_status=source_status,
        source_error=source_error,
    )
    session.add(snapshot)
    dashboard.updated_at = timezone.utcnow()
    return snapshot


@provide_session
def add_ray_dashboard_metric_samples(
    *,
    dashboard: RayDashboardTaskInstance,
    samples: Sequence[dict[str, Any]],
    session: Session = NEW_SESSION,
) -> list[RayDashboardMetricSample]:
    """Add directly sampled Ray metric values for a task attempt."""
    metric_samples = [
        RayDashboardMetricSample(
            dashboard=dashboard,
            metric_name=sample["metric_name"],
            metric_unit=sample.get("metric_unit"),
            pod_name=sample.get("pod_name")
            or _first_metric_label_value(sample.get("labels"), RAY_DASHBOARD_METRIC_POD_NAME_LABEL_KEYS),
            pod_id=sample.get("pod_id")
            or _first_metric_label_value(sample.get("labels"), RAY_DASHBOARD_METRIC_POD_ID_LABEL_KEYS),
            pod_ip=sample.get("pod_ip")
            or _first_metric_label_value(sample.get("labels"), RAY_DASHBOARD_METRIC_POD_IP_LABEL_KEYS),
            actor_name=sample.get("actor_name")
            or _first_metric_label_value(sample.get("labels"), RAY_DASHBOARD_METRIC_ACTOR_NAME_LABEL_KEYS),
            actor_class=sample.get("actor_class")
            or _first_metric_label_value(sample.get("labels"), RAY_DASHBOARD_METRIC_ACTOR_CLASS_LABEL_KEYS),
            actor_id=sample.get("actor_id")
            or _first_metric_label_value(sample.get("labels"), RAY_DASHBOARD_METRIC_ACTOR_ID_LABEL_KEYS),
            name=sample.get("name")
            or _ray_tasks_label_value(sample, RAY_DASHBOARD_TASKS_NAME_LABEL_KEYS)
            or _ray_node_type_label_value(sample, RAY_DASHBOARD_NODE_TYPE_NAME_LABEL_KEYS),
            state=sample.get("state") or _ray_tasks_label_value(sample, RAY_DASHBOARD_TASKS_STATE_LABEL_KEYS),
            labels=sample.get("labels"),
            value=sample["value"],
            sampled_at=sample["sampled_at"],
        )
        for sample in samples
    ]
    session.add_all(metric_samples)
    dashboard.updated_at = timezone.utcnow()
    return metric_samples


@provide_session
def list_ray_dashboard_snapshots(
    *,
    dashboard_id: UUID,
    section: str | None = None,
    limit: int = 100,
    offset: int = 0,
    session: Session = NEW_SESSION,
) -> Iterable[RayDashboardSnapshot]:
    """List section snapshots for a Ray Dashboard task attempt."""
    stmt = select(RayDashboardSnapshot).where(RayDashboardSnapshot.dashboard_id == dashboard_id)
    if section is not None:
        stmt = stmt.where(RayDashboardSnapshot.section == section)
    stmt = stmt.order_by(RayDashboardSnapshot.collected_at.desc()).limit(limit).offset(offset)
    return session.scalars(stmt).all()


@provide_session
def list_ray_dashboard_metric_samples(
    *,
    dashboard_id: UUID,
    metric_name: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 1000,
    offset: int = 0,
    session: Session = NEW_SESSION,
) -> Iterable[RayDashboardMetricSample]:
    """List metric samples for a Ray Dashboard task attempt."""
    stmt = select(RayDashboardMetricSample).where(RayDashboardMetricSample.dashboard_id == dashboard_id)
    if metric_name is not None:
        stmt = stmt.where(RayDashboardMetricSample.metric_name == metric_name)
    if start_date is not None:
        stmt = stmt.where(RayDashboardMetricSample.sampled_at >= start_date)
    if end_date is not None:
        stmt = stmt.where(RayDashboardMetricSample.sampled_at <= end_date)
    stmt = stmt.order_by(RayDashboardMetricSample.sampled_at.asc()).limit(limit).offset(offset)
    return session.scalars(stmt).all()
