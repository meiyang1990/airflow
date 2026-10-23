## ADDED Requirements

### Requirement: Progress snapshots report bounded stage summaries

The system SHALL accept a `stage_summaries` array in a Ray Dashboard `progress` snapshot. Each summary SHALL identify its stage with a unique positive `stage_position` and a non-empty `stage_name`, and SHALL report non-negative integer `processed_units` and `total_units`. The array SHALL be bounded and invalid summaries SHALL be rejected before persistence.

#### Scenario: Driver reports ordered multi-stage progress
- **WHEN** a current task attempt publishes a valid `progress` snapshot containing stage summaries for its known stages
- **THEN** the system persists the summaries in that task attempt's progress snapshot

#### Scenario: Driver reports duplicate stage positions
- **WHEN** a progress snapshot contains two stage summaries with the same `stage_position`
- **THEN** the system rejects the snapshot without partially persisting it

#### Scenario: Driver exceeds the stage-summary limit
- **WHEN** a progress snapshot contains more stage summaries than the configured progress-detail limit
- **THEN** the system rejects the snapshot without partially persisting it

### Requirement: Single-stage progress is calculated from local work counts

The Ray Dashboard SHALL calculate the displayed progress percentage and bar for a progress snapshot containing exactly one valid stage summary from that stage's `processed_units / total_units` ratio. A producer-supplied `pipeline_percent` or legacy `percent` SHALL NOT override this calculation.

#### Scenario: Single stage has measurable progress
- **WHEN** a progress snapshot contains one stage named `transform` with `processed_units` 5517 and `total_units` 12000
- **THEN** the dashboard displays `Stage 1: transform` and a local progress value of approximately 46 percent

#### Scenario: Single stage has no usable total
- **WHEN** a progress snapshot contains one stage with a zero or unavailable `total_units`
- **THEN** the dashboard displays that stage as indeterminate and does not display a calculated percentage or filled progress bar

### Requirement: Multi-stage progress is displayed per stage

The Ray Dashboard SHALL display one independently calculated local progress indicator for every stage in a progress snapshot containing two or more stage summaries. It SHALL order stages by `stage_position` and label each indicator with its stage sequence and stage name. It SHALL NOT display a synthesized whole-pipeline percentage or aggregate progress bar for the multi-stage workload.

#### Scenario: Multi-stage workload has completed and active stages
- **WHEN** a progress snapshot contains a completed `Stage 1: extract` and an active `Stage 2: transform`
- **THEN** the dashboard displays a separate local progress indicator for each stage in sequence order

#### Scenario: Multi-stage workload includes pipeline percent
- **WHEN** a multi-stage progress snapshot includes `pipeline_percent` or legacy `percent`
- **THEN** the dashboard does not use either value as an overall progress percentage or aggregate progress bar

#### Scenario: Multi-stage workload includes pending work
- **WHEN** a stage summary has a pending phase and no processed units
- **THEN** the dashboard displays the stage label and pending state without claiming that the pipeline is zero percent complete

### Requirement: Existing progress safety and authentication behavior is preserved

The stage-aware progress capability SHALL preserve task-attempt scoping, fixed-token ingestion without a JWT signing secret, current-attempt validation, and safe rendering for absent snapshots, stalled progress, and terminal failures.

#### Scenario: Fixed token ingests stage-aware progress
- **WHEN** the current task attempt posts a valid stage-aware progress snapshot using the deployment's fixed ingestion token and no JWT signing secret is configured
- **THEN** the system accepts and persists the snapshot

#### Scenario: Invalid attempt posts stage-aware progress
- **WHEN** a request using the fixed ingestion token posts a stage-aware progress snapshot for a non-current attempt
- **THEN** the system rejects the request
