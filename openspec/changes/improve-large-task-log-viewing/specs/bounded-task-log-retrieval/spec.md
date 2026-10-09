## ADDED Requirements

### Requirement: Bounded task-log page retrieval
The system SHALL allow an authorized caller to request a bounded page of structured task-log entries for a specific task-instance attempt, including a requested direction when the configured log handler supports that direction.

#### Scenario: Initial tail page for a completed task
- **WHEN** an authorized caller requests the latest bounded page of a completed task log
- **THEN** the system returns no more than the requested page limit, the newest available entries for that page, and navigation metadata for older entries when they exist

#### Scenario: Request does not use bounded retrieval
- **WHEN** a caller omits the new bounded-retrieval parameters
- **THEN** the system preserves the existing task-log response behavior

### Requirement: Opaque, scoped page cursors
The system SHALL provide opaque, server-signed cursors for task-log page continuation and SHALL bind each cursor to its task-instance attempt, map index, and navigation direction.

#### Scenario: Load an older page
- **WHEN** an authorized caller supplies a valid older-page cursor for the same task-instance attempt
- **THEN** the system returns the corresponding bounded older page and updated navigation metadata

#### Scenario: Cursor is used for a different task attempt
- **WHEN** a caller supplies a valid cursor with a task-instance attempt or map index that does not match the request
- **THEN** the system rejects the cursor without returning log content from the other task attempt

### Requirement: Bounded server resource use
The system SHALL avoid materializing the entire task log in the API response path when serving a bounded page and SHALL apply a bounded entry and read-size budget to each page request.

#### Scenario: Log contains substantially more entries than one page
- **WHEN** an authorized caller requests a bounded page from a large task log
- **THEN** the API returns only the requested page within the configured bounds rather than constructing a complete log-content list

### Requirement: Log-handler capability compatibility
The system SHALL preserve task-log access for configured log handlers that cannot efficiently provide both navigation directions and SHALL accurately report which continuation direction is available.

#### Scenario: Handler is forward-continuation only
- **WHEN** the configured handler can continue from a cursor but cannot provide an efficient older-page read
- **THEN** the system returns supported forward continuation metadata and does not advertise unsupported older-page navigation

### Requirement: Incremental running-task continuation
The system SHALL allow an authorized caller to continue from the newest cursor of a running or deferred task instance and receive only entries that became available after that cursor.

#### Scenario: Running task produces additional output
- **WHEN** a caller requests continuation with a valid newest cursor after the task has emitted more log entries
- **THEN** the response contains the new entries without repeating entries already covered by that cursor
