## ADDED Requirements

### Requirement: Terminal Ray task attempts receive state-appropriate AI analysis
The system SHALL provide AI Ray resource analysis only for authorized task attempts in `failed` or `success` state that have persisted Ray Dashboard data for the selected attempt.

#### Scenario: Failed Ray task is analyzed
- **WHEN** an authorized user requests AI analysis for a failed task attempt with persisted Ray Dashboard data
- **THEN** the system returns a failure-diagnosis section and a Ray resource-analysis section
- **AND** the UI renders their structured results in two separate tables

#### Scenario: Successful Ray task is analyzed
- **WHEN** an authorized user requests AI analysis for a successful task attempt with persisted Ray Dashboard data
- **THEN** the system returns a Ray resource-analysis section
- **AND** the system does not generate or display a failure-cause diagnosis

#### Scenario: Task state is not terminal or Ray data is unavailable
- **WHEN** a user requests AI analysis for a task attempt that is not failed or successful, or has no persisted Ray Dashboard data
- **THEN** the system rejects or disables the request with an actionable unavailable reason

### Requirement: Ray resource analysis uses exact persisted resource evidence
The system SHALL construct the model input from a bounded, versioned canonical payload derived from the selected attempt's persisted Ray Dashboard resource data.

#### Scenario: Worker CPU and memory data is available
- **WHEN** persisted Ray data contains recognized worker CPU or memory allocation, capacity, usage, or explicitly reported available values
- **THEN** the canonical payload includes the exact values, units, timestamps, source labels, and worker identity for those measurements
- **AND** the analysis identifies allocation, idle-capacity, or pressure observations only when supported by that evidence

#### Scenario: Resource dimension is missing or ambiguous
- **WHEN** the persisted Ray data lacks a required CPU or memory field, unit, timestamp, or recognized identity label
- **THEN** the system marks that dimension or worker as unavailable or insufficient for analysis
- **AND** the system does not infer a value from another field or label

#### Scenario: Input exceeds the configured analysis bound
- **WHEN** the selected attempt has more Ray resource records than the analysis input bound
- **THEN** the system deterministically retains the configured bounded representation
- **AND** the input and result identify the retained time range and omitted-data count

### Requirement: Resource analysis gives traceable sizing advice
The system SHALL return structured resource-analysis results that distinguish observed facts from advisory recommendations.

#### Scenario: Evidence supports a worker configuration recommendation
- **WHEN** the model can ground a CPU or memory configuration recommendation in canonical resource evidence
- **THEN** each recommendation identifies its cluster or worker scope, resource type, observed allocation concern, evidence identifiers, suggested per-worker CPU or memory configuration, confidence, and data-quality state
- **AND** the system presents the recommendation as advisory rather than applying it to Ray

#### Scenario: Evidence is insufficient for a recommendation
- **WHEN** the canonical payload cannot support a per-worker CPU or memory sizing recommendation
- **THEN** the result explicitly reports insufficient evidence or no justified recommendation
- **AND** it does not present an invented resource configuration value

### Requirement: Resource-analysis results are cache-safe and attempt-scoped
The system SHALL persist and reuse successful resource-analysis results only for the exact task attempt, analysis schema version, and canonical Ray payload fingerprint.

#### Scenario: Matching cached analysis exists
- **WHEN** a successful resource-analysis result exists for the same dag id, run id, task id, map index, try number, analysis schema version, and Ray payload fingerprint
- **THEN** the system returns the cached resource analysis without calling the LLM proxy

#### Scenario: Ray resource data changes
- **WHEN** the canonical Ray payload fingerprint differs from the cached result for the selected attempt
- **THEN** the system requests and persists a new resource analysis
- **AND** the system does not return the stale cached result as current analysis

#### Scenario: Different retry or mapped task is requested
- **WHEN** another try number or map index is selected
- **THEN** the system does not reuse a resource-analysis result from a different task attempt

### Requirement: Resource-analysis access and ingestion boundaries remain protected
The system SHALL enforce existing task-instance/Ray Dashboard authorization before reading or returning AI resource-analysis data and SHALL preserve the fixed-token Ray ingestion contract.

#### Scenario: Unauthorized resource-analysis request
- **WHEN** a user lacks access to the selected task instance or its Ray Dashboard data
- **THEN** the system denies the request without exposing resource-analysis availability or content

#### Scenario: Resource analysis is added to a fixed-token deployment
- **WHEN** a deployment uses the existing fixed-token Ray Dashboard and Progress ingestion path without an API JWT secret
- **THEN** Ray data ingestion and subsequent resource analysis continue to work without requiring `api_auth.jwt_secret` or JWT signing keys
- **AND** no endpoint other than the existing POST ray-dashboard ingest path gains fixed-token access
