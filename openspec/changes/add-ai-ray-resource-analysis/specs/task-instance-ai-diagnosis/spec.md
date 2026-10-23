## MODIFIED Requirements

### Requirement: Failed task instances can request AI diagnosis
The system SHALL provide an AI analysis endpoint and task instance UI action for failed task instances and successful Ray task instances. Failure-cause diagnosis SHALL be generated only for failed task instances; successful task instances can receive only Ray resource analysis when persisted Ray Dashboard data is available.

#### Scenario: Failed task diagnosis is requested
- **WHEN** a user with task log access requests AI analysis for a failed task instance try
- **THEN** the system returns a failure-diagnosis result for that task instance try
- **AND** the system returns Ray resource analysis when persisted Ray Dashboard data is available

#### Scenario: Successful Ray task analysis is requested
- **WHEN** a user with task-instance and Ray Dashboard access requests AI analysis for a successful task instance try that has persisted Ray Dashboard data
- **THEN** the system returns Ray resource analysis for that task instance try
- **AND** the system does not generate a task failure-cause diagnosis

#### Scenario: Non-terminal task analysis is requested
- **WHEN** a user requests AI analysis for a task instance whose state is neither failed nor successful
- **THEN** the system rejects or disables the request
- **AND** the UI explains that AI analysis is available only after task completion

#### Scenario: User lacks log permission for failed-task diagnosis
- **WHEN** a user without task log access requests AI analysis for a failed task instance
- **THEN** the system denies the request using the same access control boundary as task log reading
