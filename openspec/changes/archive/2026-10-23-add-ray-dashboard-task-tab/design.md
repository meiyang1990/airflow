## Context

The task instance page is implemented in `airflow-core/src/airflow/ui/src/pages/TaskInstance/TaskInstance.tsx` and its routes are registered in `airflow-core/src/airflow/ui/src/router.tsx`. Existing tabs are driven by the React route tree and by hook-based filtering for conditional tabs such as human-in-the-loop review.

Airflow workers must not access the metadata database directly. Task execution already communicates with the API server through the Execution API using task-instance-scoped JWT tokens. Browser users read task data through the FastAPI core API with existing authentication and authorization dependencies. The Ray dashboard feature must follow the same boundary: Ray task code, Ray-specific operator logic, or a task-owned collector writes dashboard data through REST endpoints, and the UI reads persisted data through authenticated task-instance-scoped APIs.

Ray's official Dashboard contains multiple data areas: Overview, Jobs, Cluster, Actors, Tasks, Placement Groups, Metrics, Logs, Events, Serve, and workload-specific views such as Ray Data. This change will not depend on Prometheus or Grafana. Instead, a Ray dashboard collector running in the task context will read Ray-owned sources directly, including Ray Jobs API, Ray State API, Ray Dashboard API/internal endpoints where available, Ray logs/events endpoints, and Ray metrics endpoints. The collector will submit bounded snapshots and sampled metric data to Airflow for storage in MySQL.

## Goals / Non-Goals

**Goals:**

- Persist Ray dashboard metadata, dashboard view snapshots, logs/events, and metric samples for a task instance attempt in the Airflow metadata database.
- Expose REST write paths that can be called from the task execution side or a task-owned Ray dashboard collector without direct database access.
- Expose REST read paths for the Airflow UI to render the original Ray Dashboard data categories.
- Add a Ray Dashboard tab on task instance pages only when persisted Ray dashboard data exists.
- Support mapped task instances and retries by scoping all Ray dashboard records with `dag_id`, `run_id`, `task_id`, `map_index`, and `try_number`.
- Keep the implementation database-portable, including MySQL.
- Avoid any required dependency on Prometheus, Grafana, or externally hosted monitoring dashboards.

**Non-Goals:**

- Embedding the live Ray dashboard UI in an iframe as the primary implementation.
- Polling Ray clusters directly from the Airflow webserver/API server.
- Depending on Prometheus or Grafana for task instance Ray dashboard rendering.
- Introducing a hard dependency on Ray in `airflow-core`.
- Defining or implementing a complete Ray provider/operator package.
- Recreating every interaction and visualization from the Ray frontend pixel-for-pixel.
- Storing unbounded Ray dashboard payloads or unlimited historical time-series metrics in the metadata database.

## Decisions

1. Store Ray dashboard data in three dedicated table families.

   Add a parent model such as `RayDashboardTaskInstance` with task attempt identity columns, dashboard URL, Ray cluster/job identifiers, status, collection metadata, `created_at`, and `updated_at`. Add child models such as `RayDashboardSnapshot` for dashboard sections (`overview`, `jobs`, `cluster`, `actors`, `tasks`, `placement_groups`, `objects`, `logs`, `events`, `serve`, `ray_data`) and `RayDashboardMetricSample` for directly collected Ray metric samples. Use a unique constraint over `dag_id`, `run_id`, `task_id`, `map_index`, and `try_number` for the parent record. Avoid indexing large URL, JSON, log, or metric value payload columns for MySQL compatibility.

   Alternative considered: XCom. XCom would avoid a migration, but it is user-data-oriented, harder to authorize as a UI feature contract, and makes conditional tab discovery depend on conventions rather than a first-class capability.

2. Use Execution API for writes and core API for reads.

   Add write endpoints under the task execution API so running tasks or a task-owned collector can publish Ray dashboard metadata, dashboard section snapshots, and metric sample batches using their existing task-instance-scoped identity. Add read endpoints under the task instance API namespace for the browser UI. The write path validates that the token belongs to the same task instance attempt being updated.

   Alternative considered: a public API POST endpoint with regular user auth. That is useful for manual tooling but does not fit the worker security boundary as well as the Execution API.

3. Treat persisted Ray dashboard data as the source of Ray-ness.

   The UI SHALL display the Ray Dashboard tab only after the Ray dashboard availability endpoint returns data for the selected task attempt. This avoids brittle checks against operator class names and lets future Ray integrations participate by writing the same data contract.

   Alternative considered: checking the operator name for `RayOperator`. That would be faster locally but would exclude custom operators and would require the UI to know provider-specific implementation details.

4. Mirror Ray Dashboard data categories rather than proxying the live UI.

   The API accepts bounded structured snapshots for each Ray Dashboard category and bounded metric sample batches. The UI renders category-specific views for Overview, Jobs, Cluster, Actors, Tasks, Placement Groups, Metrics, Logs, Events, Serve, and Ray Data when the collector publishes those sections. The implementation does not iframe the Ray dashboard because that would bypass Airflow authorization, break when the Ray dashboard is not externally routable, and fail the requirement to persist data in MySQL.

   Alternative considered: storing a single complete Ray dashboard response blob. That makes read-time filtering/pagination difficult, creates metadata DB growth risk, and causes backend compatibility issues, especially for MySQL row sizes and JSON handling.

5. Bound retention and pagination for complete dashboard coverage.

   Complete coverage of Ray Dashboard data can be large. The API therefore stores all supported categories but enforces per-section payload size, metric batch size, log line limits, and retention controls. UI reads are paginated or section-scoped so the task instance page can load without pulling every metric/log row at once.

   Alternative considered: loading all data into one page response. That is simpler but unsafe for large Ray jobs with many tasks, actors, logs, and metric samples.

6. Collect metrics directly and store Airflow-owned samples.

   The collector periodically samples Ray metrics while the Ray job is running and writes those samples through the Execution API. The UI charts are built from MySQL-backed metric sample queries. The default Task SDK helper scrapes all finite numeric samples exposed by the Ray Prometheus-format metrics endpoint without requiring a Prometheus server. Sampling interval, optional metric-name filtering, retention period, and maximum samples per task attempt are configurable. This keeps the feature self-contained and avoids Prometheus/Grafana, while accepting that Airflow will show bounded task-level metrics rather than an unlimited observability history.

   Alternative considered: using Prometheus/Grafana for metrics. That provides a stronger time-series backend and ready-made charts, but it adds infrastructure dependencies that this direction explicitly avoids.

7. Add the tab as a native task instance route.

   Register a `ray_dashboard` child route in `taskInstanceRoutes`, add a task instance tab with an appropriate icon and translation, and filter it through a small hook similar to the existing conditional-tab hooks. The tab page fetches and displays Ray dashboard data and respects task auto-refresh while the task is pending/running.

   Alternative considered: plugin tab only. Plugin tabs are useful extension points, but this request is for a built-in second-development feature with a first-class backend contract.

## Risks / Trade-offs

- Metadata DB growth from complete Ray Dashboard snapshots, logs, and metric samples -> enforce request size limits, section-specific bounds, batch limits, retention controls, and pagination.
- Stale Ray dashboard URLs after cluster teardown -> show timestamps and status exactly as last published, and allow final task code to update status before completion.
- Retry ambiguity -> scope records by try number and make the UI use the selected/current try number consistently.
- MySQL JSON/text differences -> use existing Airflow migration/type conventions and avoid indexing JSON, logs, or large metric payload columns.
- Authorization mistakes exposing task metadata across DAGs -> reuse existing task instance access validation and add tests for unauthorized reads/writes.
- Conditional tab flicker while loading availability -> keep the tab hidden until data exists and use an explicit empty state if a user navigates directly to the route without metadata.
- Metrics completeness depends on what Ray-owned endpoints are available and sampled by the collector -> record collector/source status per section and show unavailable sections explicitly in the UI.

## Migration Plan

1. Add an Alembic migration that creates the Ray dashboard metadata, snapshot, and metric sample tables and indexes task attempt lookup columns.
2. Add SQLAlchemy models and include them in metadata imports according to Airflow conventions.
3. Add Execution API write datamodels/routes for metadata, dashboard section snapshots, logs/events, and metric sample batches.
4. Add core API read datamodels/routes for dashboard availability, section reads, metrics reads, logs reads, and pagination.
5. Add collector helper code for Ray-owned API/endpoint reads and bounded sampling.
6. Regenerate/update OpenAPI clients used by the UI.
7. Add the Ray Dashboard route, tab filtering hook, page components, section navigation, charts/tables, and translations.
8. Add unit/API/UI tests and migration tests against supported backends through the existing test workflow.

Rollback removes the UI route/tab and API endpoints first, then drops the tables in the migration downgrade path if the deployment permits downgrades.

## Open Questions

- Should there also be an authenticated public POST endpoint for external Ray launchers or collectors that are not running inside an Airflow task?
- Which collector is responsible for fetching official Ray Dashboard sources: the Ray task/operator itself, a sidecar process, or an Airflow-triggered collector running in the task context?
- Which metric names should deployment-specific filters keep when operators need to reduce metric storage volume?
- What sampling interval and retention defaults should apply for metric samples and logs in MySQL?
- Should the feature be behind a configuration flag for deployments that do not use Ray?
