## 1. Data Contract and Storage

- [x] 1.1 Define supported Ray Dashboard section names for Overview, Jobs, Cluster, Actors, Tasks, Placement Groups, Objects, Metrics, Logs, Events, Serve, and Ray Data.
- [x] 1.2 Add a `RayDashboardTaskInstance` SQLAlchemy model for task-attempt-scoped Ray dashboard metadata.
- [x] 1.3 Add snapshot models for section-scoped Ray Dashboard payloads with source status, collection timestamp, and bounded JSON payload.
- [x] 1.4 Add metric sample models for directly collected Ray metrics with metric name, labels, timestamp, and numeric value.
- [x] 1.5 Add log/event storage models or section types with pagination-ready fields.
- [x] 1.6 Create Alembic migrations for all Ray dashboard tables with MySQL-compatible column types, indexes, and constraints.
- [x] 1.7 Add query/upsert utilities for metadata, section snapshots, metric batches, logs/events, and availability discovery.
- [ ] 1.8 Add database/model tests covering create, update, mapped task separation, retry separation, pagination, retention boundaries, and missing records.

## 2. REST API

- [x] 2.1 Add Execution API datamodels for publishing Ray dashboard metadata.
- [x] 2.2 Add Execution API datamodels for publishing bounded section snapshots.
- [x] 2.3 Add Execution API datamodels for publishing bounded metric sample batches.
- [x] 2.4 Add Execution API datamodels for publishing paginated logs/events.
- [x] 2.5 Add Execution API routes that validate task-instance-scoped identity and write metadata, snapshots, metrics, logs, and events.
- [x] 2.6 Add core API datamodels for dashboard availability, section reads, metric queries, log/event queries, and collector status.
- [x] 2.7 Add core API routes under the task instance namespace for reading dashboard availability, section data, metrics, logs, and events.
- [ ] 2.8 Add API tests for successful reads/writes, repeated write idempotency, missing data, unauthorized reads, mismatched write identity, large payload rejection, and pagination.

## 3. Ray Dashboard Collector Integration

- [x] 3.1 Define the collector contract for how Ray task/operator code gathers official Ray Dashboard data before submitting it to Airflow.
- [x] 3.2 Add helper code or documentation for publishing dashboard URL, cluster/job identifiers, and collection status.
- [x] 3.3 Add helper code or documentation for publishing Ray State API-derived Jobs, Cluster, Actors, Tasks, Placement Groups, Objects, Events, Serve, and Ray Data snapshots.
- [x] 3.4 Add helper code or documentation for directly sampling Ray metric endpoints and publishing metric samples used by Ray Dashboard Metrics View.
- [ ] 3.5 Add tests or examples for collector behavior when Ray metric endpoints or optional Ray dashboard sections are unavailable.

## 4. OpenAPI and UI Integration

- [ ] 4.1 Regenerate or update the UI OpenAPI client artifacts for the new Ray dashboard endpoints.
- [x] 4.2 Add a `RayDashboard` task instance page with internal sections for Overview, Jobs, Cluster, Actors, Tasks, Placement Groups, Metrics, Logs, Events, Serve, and Ray Data.
- [ ] 4.3 Add chart/table components for metric time series, resource utilization, state breakdowns, autoscaler status, task/actor tables, and log/event lists.
- [x] 4.4 Register the `ray_dashboard` task instance child route in the React router.
- [x] 4.5 Add a conditional tab hook that shows `Ray Dashboard` only when Ray dashboard data exists for the selected task attempt.
- [x] 4.6 Add translations and icons for the Ray Dashboard tab, sections, empty states, unavailable collector states, and page labels.
- [ ] 4.7 Add UI tests for tab visibility, non-Ray hidden state, direct route empty state, each major dashboard section, metric unavailable state, pagination, and rendered metadata fields.

## 5. Validation and Documentation

- [x] 5.1 Run ruff format/check on modified Python files immediately after editing them.
- [ ] 5.2 Run focused backend tests through the repository-approved Airflow test workflow.
- [ ] 5.3 Run focused UI tests for the task instance page.
- [x] 5.4 Add user-facing documentation for Ray dashboard data collection requirements, including direct Ray metric sampling, sampling interval, metric allowlist, and MySQL retention guidance.
- [x] 5.5 Add a newsfragment or internal documentation note if the change is user-visible for this fork.
- [x] 5.6 Validate the OpenSpec change before implementation is marked complete.
