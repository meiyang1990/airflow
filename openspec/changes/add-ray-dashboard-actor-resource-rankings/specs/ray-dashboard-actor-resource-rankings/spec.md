## ADDED Requirements

### Requirement: Actor resource ranking API
The system SHALL provide a task-scoped Ray Dashboard API that returns actor CPU and memory rankings for a specific task attempt.

#### Scenario: Ranking data is available
- **WHEN** a task attempt has Ray Dashboard metric samples containing actor identity labels and CPU or memory metric names
- **THEN** the API response SHALL include separate `cpu` and `memory` ranking arrays for that task attempt
- **AND** each ranking row SHALL include actor identity, metric name, value, sample time, and metric labels

#### Scenario: Dashboard data is missing
- **WHEN** the requested task attempt has no Ray Dashboard record
- **THEN** the API SHALL return a not found response consistent with the existing Ray Dashboard endpoints

### Requirement: Rankings are bounded and sorted
The system SHALL bound actor resource ranking responses and order them by descending resource usage.

#### Scenario: More than twenty actor CPU samples are available
- **WHEN** more than 20 actors have CPU ranking values for the selected task attempt
- **THEN** the API SHALL return at most 20 CPU ranking rows
- **AND** the CPU rows SHALL be sorted from highest value to lowest value

#### Scenario: More than twenty actor memory samples are available
- **WHEN** more than 20 actors have memory ranking values for the selected task attempt
- **THEN** the API SHALL return at most 20 memory ranking rows
- **AND** the memory rows SHALL be sorted from highest value to lowest value

### Requirement: Rankings exclude non-actor metrics
The system SHALL exclude metric samples that cannot be attributed to an actor.

#### Scenario: Node and component metrics are present
- **WHEN** metric samples include node-level or component-level CPU and memory metrics without actor identity labels
- **THEN** those samples SHALL NOT appear in actor CPU or memory rankings

#### Scenario: Actor labels use supported variants
- **WHEN** metric labels identify actors with supported keys such as `actor_id`, `ActorID`, `actor`, `ActorName`, or `Name`
- **THEN** the API SHALL use those labels to group samples by actor

### Requirement: Actors tab displays resource rankings
The Ray Dashboard Actors tab SHALL display CPU and memory ranking tables returned by the actor ranking API.

#### Scenario: Ranking rows are returned
- **WHEN** the Actors tab receives CPU and memory ranking rows
- **THEN** it SHALL display separate CPU and memory leaderboard tables with at most 20 rows each
- **AND** the tables SHALL show actor identity, value, metric name, sample time, and labels or source context

#### Scenario: No actor ranking rows are returned
- **WHEN** the actor ranking API returns empty CPU and memory arrays
- **THEN** the Actors tab SHALL show an empty-state message for the resource rankings without hiding the existing actor state table
