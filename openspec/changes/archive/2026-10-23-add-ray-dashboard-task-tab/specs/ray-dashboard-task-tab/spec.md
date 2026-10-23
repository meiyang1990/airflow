## ADDED Requirements

### Requirement: Ray dashboard data can be recorded for a task attempt

The system SHALL provide REST write endpoints that record Ray dashboard metadata, dashboard section snapshots, logs/events, and metric samples for a specific task instance attempt without requiring the worker to access the metadata database directly.

#### Scenario: Running task publishes Ray dashboard metadata

- **WHEN** a task execution request authenticated for `dag_id`, `run_id`, `task_id`, `map_index`, and `try_number` submits Ray dashboard metadata
- **THEN** the system persists the metadata for that exact task attempt

#### Scenario: Running task publishes dashboard section snapshot

- **WHEN** a task execution request submits a supported Ray Dashboard section snapshot for the authenticated task attempt
- **THEN** the system persists that snapshot under the submitted section name and collection timestamp

#### Scenario: Running task publishes metric samples

- **WHEN** a task execution request submits Ray metric samples collected directly from Ray-owned sources for the authenticated task attempt
- **THEN** the system persists the samples with metric name, labels, timestamp, and value

#### Scenario: Repeated metadata publish updates the same attempt

- **WHEN** metadata is submitted more than once for the same `dag_id`, `run_id`, `task_id`, `map_index`, and `try_number`
- **THEN** the system updates the existing metadata record instead of creating duplicates

#### Scenario: Write is rejected for a different task attempt

- **WHEN** a task execution request attempts to write Ray dashboard data for a task attempt outside its authenticated identity
- **THEN** the system rejects the request and does not persist the data

### Requirement: Ray dashboard data is task-attempt scoped

The system SHALL associate each Ray dashboard record with a single task instance attempt using `dag_id`, `run_id`, `task_id`, `map_index`, and `try_number`.

#### Scenario: Mapped tasks have separate dashboard data

- **WHEN** two mapped task instances with different `map_index` values publish Ray dashboard data
- **THEN** the system stores and returns separate data for each mapped task instance

#### Scenario: Retries have separate dashboard data

- **WHEN** a task instance publishes Ray dashboard data for multiple try numbers
- **THEN** the system stores and returns the data for the selected try number without overwriting other tries

### Requirement: Ray dashboard data can be read by authorized users

The system SHALL provide REST read endpoints that return Ray dashboard data for a specific task instance attempt to users authorized to view that task instance.

#### Scenario: Authorized user reads dashboard availability

- **WHEN** an authorized user requests Ray dashboard availability for a task attempt that has Ray dashboard data
- **THEN** the system returns the available dashboard sections and collection status

#### Scenario: Authorized user reads section data

- **WHEN** an authorized user requests a persisted Ray Dashboard section for a task attempt
- **THEN** the system returns the persisted section data for that attempt

#### Scenario: Dashboard data does not exist

- **WHEN** an authorized user requests Ray dashboard data for a task attempt that has no data
- **THEN** the system returns a not-found response or equivalent empty response that the UI can use to hide the tab

#### Scenario: Unauthorized user reads dashboard data

- **WHEN** a user without permission to view the task instance requests Ray dashboard data
- **THEN** the system rejects the request and does not reveal whether dashboard data exists

### Requirement: Ray Dashboard tab covers official dashboard data categories

The Ray Dashboard tab SHALL present persisted data for the official Ray Dashboard categories that are available from the Ray deployment and collector.

#### Scenario: Overview data is available

- **WHEN** the persisted data includes Ray Overview data
- **THEN** the tab displays cluster-level status, recent jobs, resource utilization, autoscaling status, and available Serve application summaries

#### Scenario: Jobs data is available

- **WHEN** the persisted data includes Ray Jobs data
- **THEN** the tab displays job status, task and actor progress breakdowns, placement group data, task timeline references, and Ray status data

#### Scenario: Cluster data is available

- **WHEN** the persisted data includes Ray Cluster data
- **THEN** the tab displays node, worker, hardware utilization, resource assignment, and node/worker log references

#### Scenario: Actors data is available

- **WHEN** the persisted data includes Ray Actors data
- **THEN** the tab displays actor metadata, state, owning job, profiling references, and actor task information

#### Scenario: Tasks and placement groups data is available

- **WHEN** the persisted data includes Ray Task or Placement Group state data
- **THEN** the tab displays tables and status breakdowns for the persisted tasks and placement groups

#### Scenario: Logs and events data is available

- **WHEN** the persisted data includes Ray Logs or Events data
- **THEN** the tab displays task, actor, worker, job, autoscaler, and cluster event entries with filtering or pagination

#### Scenario: Serve data is available

- **WHEN** the persisted data includes Ray Serve data
- **THEN** the tab displays Serve applications, deployments, replicas, status, and relevant metrics or logs

#### Scenario: Ray Data data is available

- **WHEN** the persisted data includes Ray Data workload data
- **THEN** the tab displays dataset execution progress, dataset state, start/end time, and dataset/operator metrics

### Requirement: Ray metrics data is displayed with official coverage

The Ray Dashboard tab SHALL display the metric data needed to cover Ray Dashboard Metrics View from bounded samples collected directly from Ray-owned sources, without requiring Prometheus or Grafana.

#### Scenario: Cluster resource metrics are available

- **WHEN** persisted metric samples include logical and physical resource utilization
- **THEN** the tab displays time-series charts for CPU, GPU, memory, GRAM, disk, network, and logical resources by node when labels are available

#### Scenario: Workload state metrics are available

- **WHEN** persisted metric samples include task, actor, and placement group state metrics
- **THEN** the tab displays state breakdowns over time

#### Scenario: Autoscaler metrics are available

- **WHEN** persisted metric samples include autoscaler status or resource demand metrics
- **THEN** the tab displays pending, active, failed node, and resource demand metrics

#### Scenario: Component metrics are available

- **WHEN** persisted metric samples include per-component CPU or memory usage
- **THEN** the tab displays per-component usage for Ray tasks, actors, and system components

#### Scenario: Ray metric source is unavailable

- **WHEN** metric collection cannot read the Ray-owned metric source
- **THEN** the tab displays the metrics section as unavailable with the recorded collector error or status

### Requirement: Task instance page displays Ray Dashboard tab only for Ray dashboard data

The task instance page SHALL display a `Ray Dashboard` tab only when Ray dashboard data exists for the selected task instance attempt.

#### Scenario: Ray dashboard data exists

- **WHEN** a user opens a task instance page for an attempt with persisted Ray dashboard data
- **THEN** the page displays a `Ray Dashboard` tab

#### Scenario: Ray dashboard data does not exist

- **WHEN** a user opens a task instance page for an attempt without persisted Ray dashboard data
- **THEN** the page does not display a `Ray Dashboard` tab

#### Scenario: User opens Ray route directly without data

- **WHEN** a user navigates directly to the Ray dashboard route for a task attempt without Ray dashboard data
- **THEN** the page shows an empty or not-found state instead of failing the task instance page

### Requirement: Ray dashboard storage is bounded and portable

The system SHALL store Ray dashboard data using schema, limits, pagination, and retention controls compatible with Airflow-supported metadata databases, including MySQL.

#### Scenario: Large section payload is submitted

- **WHEN** a request submits a dashboard section payload exceeding the configured or documented bounds
- **THEN** the system rejects the request without writing a partial record

#### Scenario: Large metric batch is submitted

- **WHEN** a request submits metric samples exceeding the configured or documented batch bounds
- **THEN** the system rejects the request without writing a partial batch

#### Scenario: Logs are read from a large task attempt

- **WHEN** a user reads persisted Ray logs for a task attempt with many log entries
- **THEN** the system returns paginated results instead of returning all log entries at once

#### Scenario: Migration runs on MySQL

- **WHEN** the metadata database backend is MySQL
- **THEN** the migration creates the Ray dashboard tables without indexing unsupported large text, JSON, log, or metric payload fields
