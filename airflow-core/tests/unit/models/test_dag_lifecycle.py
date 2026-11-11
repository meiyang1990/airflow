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

import importlib
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi import HTTPException, Request
from git import Actor, Repo
from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session

from airflow._shared.timezones import timezone
from airflow.api.common.delete_dag import DagDeletionConflict, delete_dag
from airflow.api_fastapi.auth.managers.base_auth_manager import BaseAuthManager
from airflow.api_fastapi.auth.managers.models.resource_details import DagDetails
from airflow.api_fastapi.auth.managers.simple.user import SimpleAuthManagerUser
from airflow.api_fastapi.core_api.security import requires_access_dag
from airflow.dag_processing import collection
from airflow.dag_processing.collection import update_dag_parsing_results_in_db
from airflow.dag_processing.dagbag import DagBag, sync_bag_to_db
from airflow.exceptions import DagNotFound
from airflow.models.dag import DagModel
from airflow.models.dag_lifecycle import DagLifecycle
from airflow.models.dag_version import DagVersion
from airflow.models.dagbundle import DagBundleModel
from airflow.models.dagrun import DagRun
from airflow.models.dagwarning import DagWarning, DagWarningType
from airflow.models.serialized_dag import SerializedDagModel
from airflow.providers.git.bundles.git import GitDagBundle
from airflow.providers.standard.operators.empty import EmptyOperator
from airflow.serialization.definitions.dag import SerializedDAG
from airflow.serialization.serialized_objects import LazyDeserializedDAG
from airflow.utils.db import compare_server_default, compare_type
from airflow.utils.db_cleanup import config_dict
from airflow.utils.session import create_session
from airflow.utils.state import DagRunState
from airflow.utils.types import DagRunTriggeredByType, DagRunType

from tests_common.test_utils.config import conf_vars
from tests_common.test_utils.db import clear_db_dags, clear_db_runs, clear_db_serialized_dags

pytestmark = pytest.mark.db_test


@pytest.fixture(autouse=True)
def clean_lifecycle():
    clear_db_runs()
    clear_db_serialized_dags()
    clear_db_dags()
    with create_session() as session:
        bundle = session.get(DagBundleModel, "dag_maker")
        if bundle is not None:
            bundle.teams = []
    yield
    clear_db_runs()
    clear_db_serialized_dags()
    clear_db_dags()
    with create_session() as session:
        bundle = session.get(DagBundleModel, "dag_maker")
        if bundle is not None:
            bundle.teams = []


def make_dag(dag_maker, dag_id="main_permanent_deletion"):
    with dag_maker(dag_id=dag_id, schedule=None) as dag:
        EmptyOperator(task_id="task")
    dag_maker.sync_dagbag_to_db()
    return LazyDeserializedDAG.from_dag(dag)


def persist(dags, session, bundle_version=None):
    update_dag_parsing_results_in_db("dag_maker", bundle_version, dags, {}, None, set(), session=session)


def test_metadata_only_cleanup_reproduces_reappearance(dag_maker):
    dag = make_dag(dag_maker)
    with create_session() as session:
        session.execute(delete(DagModel).where(DagModel.dag_id == dag.dag_id))
    with create_session() as session:
        assert session.get(DagModel, dag.dag_id) is None
        persist([dag], session)
        assert session.get(DagModel, dag.dag_id) is not None


@pytest.mark.parametrize("entrypoint", ["parsing", "bulk", "serialized"])
def test_deleted_dag_cannot_be_registered_again(dag_maker, entrypoint):
    dag = make_dag(dag_maker)
    delete_dag(dag.dag_id)
    # Independent sessions represent subsequent parsing cycles / processor restarts.
    for version in (None, "new-source-commit"):
        with create_session() as session:
            if entrypoint == "parsing":
                persist([dag], session, version)
            elif entrypoint == "bulk":
                SerializedDAG.bulk_write_to_db("dag_maker", version, [dag], session=session)
            else:
                assert not SerializedDagModel.write_dag(dag, "dag_maker", version, session=session)
        with create_session() as session:
            assert session.get(DagModel, dag.dag_id) is None
            assert (
                session.scalar(select(SerializedDagModel).where(SerializedDagModel.dag_id == dag.dag_id))
                is None
            )
            assert session.scalar(select(DagVersion).where(DagVersion.dag_id == dag.dag_id)) is None
            assert session.get(DagLifecycle, dag.dag_id).deleted_at is not None


def test_other_dags_in_same_parse_survive(dag_maker):
    deleted = make_dag(dag_maker)
    other = make_dag(dag_maker, "dev_permanent_deletion")
    delete_dag(deleted.dag_id)
    with create_session() as session:
        persist([deleted, other], session)
        assert session.get(DagModel, deleted.dag_id) is None
        assert session.get(DagModel, other.dag_id) is not None


def test_repeated_delete_is_idempotent_and_preserves_marker(dag_maker):
    dag = make_dag(dag_maker)
    delete_dag(dag.dag_id)
    with create_session() as session:
        deleted_at = session.get(DagLifecycle, dag.dag_id).deleted_at
    assert delete_dag(dag.dag_id, keep_records_in_log=False) == 0
    with create_session() as session:
        assert session.get(DagLifecycle, dag.dag_id).deleted_at == deleted_at


def test_unknown_dag_does_not_leave_deletion_intent():
    with pytest.raises(DagNotFound):
        delete_dag("unknown")
    with create_session() as session:
        assert session.get(DagLifecycle, "unknown") is None


def test_rollback_preserves_dag(dag_maker):
    dag = make_dag(dag_maker)
    with create_session() as session:
        delete_dag(dag.dag_id, session=session)
        session.rollback()
    with create_session() as session:
        assert session.get(DagModel, dag.dag_id) is not None
        assert session.get(DagLifecycle, dag.dag_id).deleted_at is None


@pytest.mark.parametrize("state", [DagRunState.QUEUED, DagRunState.RUNNING])
def test_active_run_prevents_delete(dag_maker, state):
    dag = make_dag(dag_maker)
    dag_maker.create_dagrun(state=state)
    with pytest.raises(DagDeletionConflict):
        delete_dag(dag.dag_id)
    with create_session() as session:
        assert session.get(DagModel, dag.dag_id) is not None
        assert session.get(DagLifecycle, dag.dag_id).deleted_at is None


def test_stale_serialized_dag_cannot_create_run(dag_maker):
    dag = make_dag(dag_maker)
    stale_dag = dag_maker.serialized_dag
    delete_dag(dag.dag_id)
    with create_session() as session, pytest.raises(DagNotFound):
        stale_dag.create_dagrun(
            run_id="manual__deleted",
            run_after=timezone.utcnow(),
            run_type=DagRunType.MANUAL,
            triggered_by=DagRunTriggeredByType.TEST,
            state=DagRunState.QUEUED,
            session=session,
        )
    with create_session() as session:
        assert session.scalar(select(DagRun).where(DagRun.dag_id == dag.dag_id)) is None


def test_downgrade_refuses_permanent_markers(dag_maker, mocker):
    dag = make_dag(dag_maker)
    delete_dag(dag.dag_id)
    migration = importlib.import_module("airflow.migrations.versions.0114_3_2_0_add_dag_lifecycle")
    with create_session() as session:
        mocker.patch.object(migration.op, "get_bind", autospec=True, return_value=session.connection())
        drop = mocker.patch.object(migration.op, "drop_table", autospec=True)
        with pytest.raises(RuntimeError, match="permanently deleted"):
            migration.downgrade()
        drop.assert_not_called()


def test_deleted_dag_retains_authorization_scope(dag_maker, testing_team):
    dag = make_dag(dag_maker)
    with create_session() as session:
        bundle = session.get(DagBundleModel, "dag_maker")
        bundle.teams.append(session.merge(testing_team))
    delete_dag(dag.dag_id)
    with create_session() as session:
        assert DagModel.get_team_name(dag.dag_id, include_deleted=True, session=session) == "testing"
        assert session.get(DagLifecycle, dag.dag_id).bundle_name == "dag_maker"


def test_retention_cleanup_cannot_target_lifecycle():
    assert "dag_lifecycle" not in config_dict


def test_first_registration_racing_with_deletion_marker():
    started = Event()

    def register():
        with create_session() as session:
            started.set()
            return DagLifecycle.lock(["new_id"], session=session)["new_id"].deleted_at

    with ThreadPoolExecutor(max_workers=1) as executor:
        with create_session() as session:
            lifecycle = DagLifecycle.lock(["new_id"], session=session)["new_id"]
            lifecycle.deleted_at = timezone.utcnow()
            session.flush()
            future = executor.submit(register)
            assert started.wait(10)
        assert future.result(timeout=30) is not None


@pytest.mark.parametrize("delete_first", [True, False])
def test_concurrent_parse_and_delete(dag_maker, delete_first):
    dag = make_dag(dag_maker)
    started = Event()

    def second_transaction():
        with create_session() as session:
            started.set()
            if delete_first:
                persist([dag], session)
            else:
                delete_dag(dag.dag_id, session=session)

    with ThreadPoolExecutor(max_workers=1) as executor:
        with create_session() as session:
            if delete_first:
                delete_dag(dag.dag_id, session=session)
            else:
                persist([dag], session)
            future = executor.submit(second_transaction)
            assert started.wait(10)
        future.result(timeout=30)
    with create_session() as session:
        assert session.get(DagModel, dag.dag_id) is None
        assert session.get(DagLifecycle, dag.dag_id).deleted_at is not None
        assert (
            session.scalar(select(SerializedDagModel).where(SerializedDagModel.dag_id == dag.dag_id)) is None
        )


@pytest.mark.parametrize("delete_first", [True, False])
def test_concurrent_trigger_and_delete(dag_maker, delete_first):
    dag = make_dag(dag_maker)
    stale_dag = dag_maker.serialized_dag
    started = Event()

    def trigger(session):
        stale_dag.create_dagrun(
            run_id="manual__concurrent",
            run_after=timezone.utcnow(),
            run_type=DagRunType.MANUAL,
            triggered_by=DagRunTriggeredByType.TEST,
            state=DagRunState.QUEUED,
            session=session,
        )

    def second_transaction():
        with create_session() as session:
            started.set()
            if delete_first:
                trigger(session)
            else:
                delete_dag(dag.dag_id, session=session)

    with ThreadPoolExecutor(max_workers=1) as executor:
        with create_session() as session:
            if delete_first:
                delete_dag(dag.dag_id, session=session)
            else:
                trigger(session)
            future = executor.submit(second_transaction)
            assert started.wait(10)
        with pytest.raises(DagNotFound if delete_first else DagDeletionConflict):
            future.result(timeout=30)
    with create_session() as session:
        assert (session.get(DagLifecycle, dag.dag_id).deleted_at is not None) == delete_first
        run = session.scalar(select(DagRun).where(DagRun.dag_id == dag.dag_id))
        assert (run is None) == delete_first


def test_git_bundle_refresh_and_new_parser_cannot_restore_dag(tmp_path, testing_dag_bundle):
    repo_path = tmp_path / "source"
    repo_path.mkdir()
    source = repo_path / "template.py"
    source.write_text(
        "from airflow.sdk import DAG\n"
        'dag = DAG("main_permanent_deletion", schedule=None)\n'
        'other = DAG("dev_permanent_deletion", schedule=None)\n'
    )
    actor = Actor("Test", "test@example.invalid")
    with Repo.init(repo_path, initial_branch="main") as repo:
        repo.index.add(["template.py"])
        initial = repo.index.commit("Initial DAG source", author=actor, committer=actor).hexsha
        with conf_vars({("dag_processor", "dag_bundle_storage_path"): str(tmp_path / "bundles")}):
            bundle = GitDagBundle(name="testing", tracking_ref="main", repo_url=str(repo_path))
            bundle.initialize()

            def parse_new_bag(current_bundle):
                bag = DagBag(
                    dag_folder=current_bundle.path,
                    bundle_path=current_bundle.path,
                    include_examples=False,
                )
                assert not bag.import_errors
                assert "main_permanent_deletion" in bag.dags
                sync_bag_to_db(bag, "testing", current_bundle.get_current_version())

            parse_new_bag(bundle)
            delete_dag("main_permanent_deletion")
            for _ in range(2):
                bundle.refresh()
                parse_new_bag(bundle)
                with create_session() as session:
                    assert session.get(DagModel, "main_permanent_deletion") is None
                    assert session.get(DagModel, "dev_permanent_deletion") is not None
            source.write_text(source.read_text() + "\n# A new source version\n")
            repo.index.add(["template.py"])
            updated = repo.index.commit("Update source", author=actor, committer=actor).hexsha
            assert updated != initial
            # A new bundle and DagBag discard in-memory state, like a restarted processor.
            restarted = GitDagBundle(name="testing", tracking_ref="main", repo_url=str(repo_path))
            restarted.initialize()
            restarted.refresh()
            assert restarted.get_current_version() == updated
            parse_new_bag(restarted)
            with create_session() as session:
                assert session.get(DagModel, "main_permanent_deletion") is None
                assert session.get(DagModel, "dev_permanent_deletion") is not None
                assert session.get(DagLifecycle, "main_permanent_deletion").deleted_at is not None


def test_cleanup_failure_rolls_back_deletion_intent(dag_maker, mocker):
    dag = make_dag(dag_maker)
    mocker.patch(
        "airflow.api.common.delete_dag.get_sqla_model_classes",
        autospec=True,
        side_effect=RuntimeError("cleanup unavailable"),
    )
    with pytest.raises(RuntimeError, match="cleanup unavailable"):
        delete_dag(dag.dag_id)
    with create_session() as session:
        assert session.get(DagLifecycle, dag.dag_id).deleted_at is None
        assert session.get(DagModel, dag.dag_id) is not None


def test_scheduler_row_lock_rejects_delete_without_deadlock(dag_maker):
    dag = make_dag(dag_maker)
    with create_session() as session:
        if session.get_bind().dialect.name == "sqlite":
            pytest.skip("SQLite serializes writers instead of providing scheduler row locks")
        with ThreadPoolExecutor(max_workers=1) as executor:
            session.scalar(select(DagModel).where(DagModel.dag_id == dag.dag_id).with_for_update())
            future = executor.submit(delete_dag, dag.dag_id)
            with pytest.raises(DagDeletionConflict, match="being scheduled"):
                future.result(timeout=10)
    with create_session() as session:
        assert session.get(DagLifecycle, dag.dag_id).deleted_at is None
        assert session.get(DagModel, dag.dag_id) is not None


@pytest.mark.parametrize("authorized", [True, False])
def test_deleted_dag_authorization_uses_retained_team(dag_maker, testing_team, mocker, authorized):
    dag = make_dag(dag_maker)
    with create_session() as session:
        bundle = session.get(DagBundleModel, "dag_maker")
        bundle.teams.append(session.merge(testing_team))
    delete_dag(dag.dag_id)
    auth_manager = mocker.create_autospec(BaseAuthManager, instance=True)
    auth_manager.is_authorized_dag.return_value = authorized
    mocker.patch(
        "airflow.api_fastapi.core_api.security.get_auth_manager", return_value=auth_manager, autospec=True
    )
    request = Request({"type": "http", "path_params": {"dag_id": dag.dag_id}, "query_string": b""})
    user = SimpleAuthManagerUser(username="test", role="admin")
    check = requires_access_dag("DELETE")
    if authorized:
        check(request, user)
    else:
        with pytest.raises(HTTPException) as error:
            check(request, user)
        assert error.value.status_code == 403
    auth_manager.is_authorized_dag.assert_called_once_with(
        method="DELETE", access_entity=None, details=DagDetails(id=dag.dag_id, team_name="testing"), user=user
    )
    with create_session() as session:
        assert session.get(DagLifecycle, dag.dag_id).deleted_at is not None


def test_lifecycle_schema_matches_migration():
    with create_session() as session:
        context = MigrationContext.configure(
            session.connection(),
            opts={
                "compare_type": compare_type,
                "compare_server_default": compare_server_default,
                "include_object": lambda obj, name, type_, reflected, compare_to: (
                    type_ != "table" or name == "dag_lifecycle"
                ),
            },
        )
        assert compare_metadata(context, DagLifecycle.metadata) == []


def test_concurrent_repeated_delete_is_idempotent(dag_maker):
    dag = make_dag(dag_maker)
    started = Event()

    def repeat_delete():
        with create_session() as session:
            started.set()
            return delete_dag(dag.dag_id, session=session)

    with ThreadPoolExecutor(max_workers=1) as executor:
        with create_session() as session:
            delete_dag(dag.dag_id, session=session)
            deleted_at = session.get(DagLifecycle, dag.dag_id).deleted_at
            future = executor.submit(repeat_delete)
            assert started.wait(10)
        assert future.result(timeout=30) == 0
    with create_session() as session:
        assert session.get(DagLifecycle, dag.dag_id).deleted_at == deleted_at
        assert session.get(DagModel, dag.dag_id) is None


def test_scheduler_and_parser_do_not_invert_locks(dag_maker):
    dag = make_dag(dag_maker)
    stale_dag = dag_maker.serialized_dag
    parser_locked_lifecycle = Event()
    parser_rolled_back = Event()

    def parse():
        with create_session() as session:

            def after_query(connection, cursor, statement, parameters, context, executemany):
                if statement.lstrip().upper().startswith("SELECT") and "dag_lifecycle" in statement:
                    parser_locked_lifecycle.set()

            event.listen(session.connection(), "after_cursor_execute", after_query)
            event.listen(session, "after_rollback", lambda session: parser_rolled_back.set())
            persist([dag], session)

    with create_session() as session:
        if session.get_bind().dialect.name == "sqlite":
            pytest.skip("SQLite serializes writers instead of providing scheduler row locks")
    with ThreadPoolExecutor(max_workers=1) as executor:
        with create_session() as session:
            session.scalar(select(DagModel).where(DagModel.dag_id == dag.dag_id).with_for_update())
            future = executor.submit(parse)
            assert parser_locked_lifecycle.wait(10)
            stale_dag.create_dagrun(
                run_id="manual__scheduler_lock_order",
                run_after=timezone.utcnow(),
                run_type=DagRunType.MANUAL,
                triggered_by=DagRunTriggeredByType.TEST,
                state=DagRunState.QUEUED,
                session=session,
            )
        future.result(timeout=30)
    assert not parser_rolled_back.is_set()
    with create_session() as session:
        assert session.scalar(select(DagRun).where(DagRun.dag_id == dag.dag_id)) is not None


@pytest.mark.parametrize("dag_count", [1, 3])
def test_parsing_reuses_batched_lifecycle_locks(dag_maker, dag_count):
    dags = [make_dag(dag_maker, f"lifecycle_query_count_{index}") for index in range(dag_count)]
    statements = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        if "dag_lifecycle" in statement:
            statements.append(statement)

    with create_session(scoped=False) as session:
        event.listen(session.connection(), "before_cursor_execute", capture)
        persist(dags, session)
        assert len(statements) == 2
        persist(dags, session)
        assert len(statements) == 2


@pytest.mark.parametrize("end_transaction", ["commit", "rollback"])
def test_lifecycle_locks_rechecked_after_transaction_end(dag_maker, end_transaction):
    dag = make_dag(dag_maker)
    with create_session(scoped=False) as session:
        assert DagLifecycle.lock([dag.dag_id], session=session)[dag.dag_id].deleted_at is None
        getattr(session, end_transaction)()
        delete_dag(dag.dag_id)
        assert DagLifecycle.lock([dag.dag_id], session=session)[dag.dag_id].deleted_at is not None


def test_lifecycle_lock_rechecked_after_savepoint_rollback():
    with create_session(scoped=False) as session:
        DagLifecycle.lock(["outer_lock"], session=session)
        nested = session.begin_nested()
        DagLifecycle.lock(["savepoint_lock"], session=session)
        nested.rollback()
        assert (
            session.scalar(select(DagLifecycle.dag_id).where(DagLifecycle.dag_id == "savepoint_lock")) is None
        )
        locked = DagLifecycle.lock(["savepoint_lock"], session=session)
        assert locked["savepoint_lock"].dag_id == "savepoint_lock"
        assert session.get(DagLifecycle, "savepoint_lock") is not None


@pytest.fixture
def fab_models():
    models = pytest.importorskip("airflow.providers.fab.auth_manager.models")
    with create_session(scoped=False) as session:
        models.Resource.metadata.create_all(session.get_bind())
    yield models
    with create_session(scoped=False) as session:
        resource_ids = select(models.Resource.id).where(models.Resource.name.like("%main_permanent_deletion"))
        session.execute(delete(models.Permission).where(models.Permission.resource_id.in_(resource_ids)))
        session.execute(delete(models.Resource).where(models.Resource.name.like("%main_permanent_deletion")))


def test_real_fab_commits_do_not_commit_parsing_transaction(dag_maker, fab_models):
    dag = make_dag(dag_maker)
    with create_session(scoped=False) as session:
        committed = Event()
        event.listen(session, "after_commit", lambda session: committed.set())
        with conf_vars(
            {("core", "auth_manager"): "airflow.providers.fab.auth_manager.fab_auth_manager.FabAuthManager"}
        ):
            persist([dag], session)
        assert not committed.is_set()
        assert (
            session.scalar(select(fab_models.Resource).where(fab_models.Resource.name == f"DAG:{dag.dag_id}"))
            is not None
        )
        session.rollback()
    with create_session(scoped=False) as session:
        assert (
            session.scalar(select(fab_models.Resource).where(fab_models.Resource.name == f"DAG:{dag.dag_id}"))
            is None
        )


def test_real_fab_sync_keeps_delete_waiting_until_warnings_saved(dag_maker, fab_models, monkeypatch):
    dag = make_dag(dag_maker)
    started = Event()
    futures = []
    original_sync = collection._sync_dag_perms

    def delete_after_sync():
        with create_session(scoped=False) as session:

            def before_query(connection, cursor, statement, parameters, context, executemany):
                if "dag_lifecycle" in statement:
                    started.set()

            event.listen(session.connection(), "before_cursor_execute", before_query)
            return delete_dag(dag.dag_id, session=session)

    with ThreadPoolExecutor(max_workers=1) as executor:

        def sync_and_start_delete(parsed_dag, *, session):
            original_sync(parsed_dag, session=session)
            futures.append(executor.submit(delete_after_sync))
            assert started.wait(10)

        monkeypatch.setattr(collection, "_sync_dag_perms", sync_and_start_delete)
        with create_session(scoped=False) as session:
            with conf_vars(
                {
                    (
                        "core",
                        "auth_manager",
                    ): "airflow.providers.fab.auth_manager.fab_auth_manager.FabAuthManager"
                }
            ):
                collection.update_dag_parsing_results_in_db(
                    "dag_maker",
                    None,
                    [dag],
                    {},
                    None,
                    {DagWarning(dag.dag_id, DagWarningType.NONEXISTENT_POOL, "missing pool")},
                    session=session,
                )
            assert not futures[0].done()
            assert session.scalar(select(DagWarning).where(DagWarning.dag_id == dag.dag_id)) is not None
        assert futures[0].result(timeout=30) > 0
    with create_session(scoped=False) as session:
        assert session.get(DagModel, dag.dag_id) is None
        assert session.scalar(select(DagWarning).where(DagWarning.dag_id == dag.dag_id)) is None


def test_real_fab_rollback_does_not_rollback_lifecycle_lock(dag_maker, fab_models):
    dag = make_dag(dag_maker)
    security = pytest.importorskip("airflow.providers.fab.auth_manager.security_manager.override")

    def fail_resource_flush(permission_session, flush_context, instances):
        if any(isinstance(obj, fab_models.Resource) for obj in permission_session.new):
            raise ValueError("permission write failed")

    with create_session(scoped=False) as session:
        locked = DagLifecycle.lock([dag.dag_id], session=session)
        rolled_back = Event()
        event.listen(session, "after_rollback", lambda session: rolled_back.set())
        event.listen(Session, "before_flush", fail_resource_flush)
        try:
            with pytest.raises(security.FabException):
                collection._sync_dag_perms(dag, session=session)
        finally:
            event.remove(Session, "before_flush", fail_resource_flush)
        assert not rolled_back.is_set()
        assert session.in_transaction()
        assert DagLifecycle.lock([dag.dag_id], session=session)[dag.dag_id] is locked[dag.dag_id]
        session.add(DagWarning(dag.dag_id, DagWarningType.NONEXISTENT_POOL, "still writable"))
        session.flush()
