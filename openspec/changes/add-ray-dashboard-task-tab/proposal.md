## Why

Airflow users running Ray workloads need a first-class way to discover and inspect Ray dashboard metadata from the task instance page without leaving the Airflow UI or relying on logs/XCom conventions. Capturing Ray dashboard information through Airflow APIs also gives deployments a controlled, auditable path to persist and expose the data in the metadata database.

## What Changes

- Add a Ray Dashboard tab to the task instance detail page.
- Introduce REST endpoints for writing and reading Ray dashboard data tied to a specific task instance attempt.
- Persist Ray dashboard data in the Airflow metadata database, including MySQL-compatible schema support through normal migrations.
- Show the tab only when the task instance has Ray dashboard metadata; non-Ray tasks keep the existing task page unchanged.
- Display the original Ray Dashboard data categories in Airflow, including Overview, Jobs, Cluster, Actors, Tasks, Placement Groups, Metrics, Logs, Events, Serve, and Ray Data when present in the source Ray deployment.
- Collect Ray metric samples directly from Ray-owned APIs/endpoints and persist bounded samples in MySQL so the Airflow UI does not depend on Prometheus or Grafana.
- Enforce existing Airflow API authentication and task-instance-level authorization for both write and read operations.

## Capabilities

### New Capabilities

- `ray-dashboard-task-tab`: Persist Ray dashboard data for task instances and expose the original Ray Dashboard data categories in the task instance UI.

### Modified Capabilities

None.

## Impact

- Database: add new metadata and dashboard-data tables plus Alembic migrations compatible with Airflow-supported databases, including MySQL.
- API: add FastAPI datamodels and routes under task instance scoped endpoints for Ray dashboard data ingestion and retrieval.
- UI: update the React task instance detail page, generated OpenAPI client usage, and translations/tests for the Ray Dashboard tab.
- Security: reuse existing API auth dependencies and task instance access checks; write endpoints must not grant workers broader metadata database access.
- Tests: add model/migration/API tests and UI tests for Ray and non-Ray task instances.
