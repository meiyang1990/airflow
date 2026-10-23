## ADDED Requirements

### Requirement: Failed task instances can request AI diagnosis
The system SHALL provide an AI diagnosis endpoint and task instance UI action for failed task instances.

#### Scenario: Failed task diagnosis is requested
- **WHEN** a user with task log access requests AI diagnosis for a failed task instance try
- **THEN** the system returns a diagnosis result for that task instance try

#### Scenario: Non-failed task diagnosis is requested
- **WHEN** a user requests AI diagnosis for a task instance whose state is not failed
- **THEN** the system rejects or disables the diagnosis request
- **AND** the UI explains that AI diagnosis is only available for failed tasks

#### Scenario: User lacks log permission
- **WHEN** a user without task log access requests AI diagnosis
- **THEN** the system denies the request using the same access control boundary as task log reading

### Requirement: Diagnosis uses deterministic log excerpt
The system SHALL build the model input from all-level task logs using the configured diagnosis excerpt.

#### Scenario: Logs contain more than 440 lines
- **WHEN** a failed task try has more than 440 log lines
- **THEN** the system includes log lines 18 through 140 inclusive
- **AND** the system includes the final 300 log lines
- **AND** duplicate lines from overlapping ranges are included only once in original log order

#### Scenario: Logs contain fewer than 18 lines
- **WHEN** a failed task try has fewer than 18 log lines
- **THEN** the system includes the available final log lines
- **AND** the system does not fail because the 18 through 140 range is empty

#### Scenario: Structured logs are read
- **WHEN** task logs contain structured log entries
- **THEN** the system converts entries to text for model input without applying UI log-level filters

### Requirement: Diagnosis results are persisted and reused
The system SHALL persist diagnosis results in PostgreSQL and reuse existing results for the same task instance try.

#### Scenario: Cached diagnosis exists
- **WHEN** the diagnosis table contains a successful result for the requested dag id, run id, task id, map index, and try number
- **THEN** the system returns the cached diagnosis result
- **AND** the system does not call the LLM proxy

#### Scenario: Cached diagnosis does not exist
- **WHEN** no successful diagnosis result exists for the requested dag id, run id, task id, map index, and try number
- **THEN** the system calls the configured LLM proxy
- **AND** the system stores the diagnosis result before returning it

#### Scenario: Diagnosis row identity
- **WHEN** diagnosis results are stored
- **THEN** the system enforces one row per dag id, run id, task id, map index, and try number

### Requirement: LLM proxy integration
The system SHALL call the configured mcpserver LLM proxy for uncached diagnosis requests.

#### Scenario: Default Kubernetes service URL is configured
- **WHEN** the deployment uses the agreed in-cluster mcpserver service
- **THEN** the system can call `http://zerith-common-mcp-server.bigdata.svc.cluster.local:8000/llm/proxy`

#### Scenario: LLM proxy returns success
- **WHEN** the LLM proxy returns successful model content
- **THEN** the system stores and returns the model provider, model name, request id, summary, and diagnosis items when present

#### Scenario: LLM proxy returns error
- **WHEN** the LLM proxy call fails or times out
- **THEN** the system returns a user-visible error for the diagnosis request
- **AND** the system does not store a successful cached diagnosis

### Requirement: Diagnosis UI displays structured results
The system SHALL display AI diagnosis results in the task instance AI Diagnosis tab.

#### Scenario: Diagnosis is loading
- **WHEN** the user starts an uncached diagnosis request
- **THEN** the UI shows a loading state near the AI diagnosis action

#### Scenario: Diagnosis succeeds
- **WHEN** the system returns a diagnosis result
- **THEN** the UI displays the summary
- **AND** the UI displays a table with category, finding, evidence, suggestion, and confidence columns

#### Scenario: Diagnosis is cached
- **WHEN** the returned diagnosis result came from the database cache
- **THEN** the UI indicates that the diagnosis was previously generated

#### Scenario: Diagnosis fails
- **WHEN** the diagnosis request fails
- **THEN** the UI displays an error state without removing access to the normal task logs
