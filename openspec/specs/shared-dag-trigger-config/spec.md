## Purpose

Persist one shared, DAG-scoped Trigger DAG configuration and use it predictably in the trigger dialog.

## Requirements

### Requirement: One shared trigger configuration per DAG
The system SHALL persist at most one trigger configuration for each DAG. A configuration SHALL contain a JSON object, including an empty object, and SHALL not have user ownership or per-user visibility semantics.

#### Scenario: Save a configuration for the first time
- **WHEN** an authorized user saves a valid JSON object for a DAG that has no saved trigger configuration
- **THEN** the system SHALL create the DAG's single shared trigger configuration without creating a DagRun

#### Scenario: Replace an existing configuration
- **WHEN** an authorized user saves a valid JSON object for a DAG that already has a saved trigger configuration
- **THEN** the system SHALL replace the existing shared configuration for that DAG without creating a second record or a DagRun

#### Scenario: Save an explicit empty configuration
- **WHEN** an authorized user saves `{}` for a DAG
- **THEN** the system SHALL retain `{}` as that DAG's shared trigger configuration

### Requirement: Authorized configuration retrieval and persistence
The system SHALL expose DAG-scoped retrieval and upsert operations for the shared trigger configuration. The operations SHALL use existing DAG RUN authorization and SHALL reject access to a nonexistent or unauthorized DAG. A configuration write SHALL be action-logged without logging the configuration contents.

#### Scenario: Retrieve an existing shared configuration
- **WHEN** a user authorized to access a DAG retrieves its saved trigger configuration
- **THEN** the system SHALL return that DAG's stored JSON object

#### Scenario: Retrieve a configuration that has never been saved
- **WHEN** a user authorized to access a DAG retrieves a shared trigger configuration that does not exist
- **THEN** the system SHALL indicate that no saved configuration exists and SHALL not substitute DAG Params defaults in the API response

#### Scenario: Unauthorized write
- **WHEN** a user without DAG RUN write authorization attempts to save a trigger configuration
- **THEN** the system SHALL reject the request and SHALL not create or modify a configuration or DagRun

### Requirement: Normal trigger-dialog configuration prefill
When a user opens the Trigger DAG dialog normally, the UI SHALL prefill the configuration from the DAG's saved shared trigger configuration when one exists. When no saved configuration exists, the UI SHALL prefill from the DAG's current Params defaults.

#### Scenario: Prefill from saved configuration
- **WHEN** a user opens the Trigger DAG dialog for a DAG with a saved shared configuration
- **THEN** the JSON editor and structured Params form SHALL reflect the saved JSON object

#### Scenario: Prefill from Params defaults before first save
- **WHEN** a user opens the Trigger DAG dialog for a DAG with no saved shared configuration
- **THEN** the UI SHALL use the DAG's current Params defaults as it does today

#### Scenario: Persisted empty configuration is not treated as absent
- **WHEN** a user opens the Trigger DAG dialog for a DAG whose saved shared configuration is `{}`
- **THEN** the UI SHALL prefill `{}` and SHALL not replace it with DAG Params defaults

#### Scenario: Reopen fetches the current configuration
- **WHEN** a user reopens the Trigger DAG dialog normally
- **THEN** the UI SHALL retrieve the shared configuration from the API and SHALL not reuse a cached JSON configuration

### Requirement: Saving from the Trigger DAG dialog does not trigger a run
The Trigger DAG dialog SHALL offer a Save configuration action distinct from Trigger. The action SHALL be available only when the current configuration has valid JSON and valid form state, and SHALL persist only the current JSON configuration.

#### Scenario: Save current JSON
- **WHEN** a user enters valid JSON and selects Save configuration
- **THEN** the UI SHALL persist the JSON as the DAG's shared configuration, keep the dialog open, and show a success confirmation

#### Scenario: Save invalid JSON
- **WHEN** the JSON editor reports invalid JSON or the structured Params form reports invalid input
- **THEN** the UI SHALL prevent saving and SHALL not issue a persistence request

#### Scenario: Save does not affect DAG execution state
- **WHEN** a user saves a valid configuration for a paused or unpaused DAG
- **THEN** the system SHALL not create a DagRun, change the DAG's paused state, navigate to a run, or alter per-run fields

### Requirement: Triggering persists the current configuration first
The primary Trigger action SHALL persist the current valid JSON configuration before changing DAG pause state or creating a DagRun.

#### Scenario: Trigger with a valid configuration
- **WHEN** a user selects Trigger with a valid configuration
- **THEN** the system SHALL save that configuration and, after the save succeeds, perform the requested trigger operation

#### Scenario: Configuration persistence fails during trigger
- **WHEN** saving the current configuration fails after a user selects Trigger
- **THEN** the system SHALL report the save error and SHALL not change the DAG pause state or create a DagRun

### Requirement: Explicit historical-run reuse takes precedence
The existing Trigger again with config action SHALL continue to initialize the dialog with the selected historical DagRun's `conf`. That explicit selection SHALL take precedence over the DAG's saved shared configuration and DAG Params defaults for the current dialog session.

#### Scenario: Reuse a historical configuration after a shared configuration exists
- **WHEN** a user chooses Trigger again with config for a historical DagRun and the DAG also has a saved shared configuration
- **THEN** the dialog SHALL prefill from the historical DagRun's `conf`

#### Scenario: Historical reuse retains per-run reset behavior
- **WHEN** a user opens the dialog through Trigger again with config
- **THEN** the UI SHALL reuse only `conf` and SHALL initialize run ID, logical date, partition key, data interval, and note as a new trigger form
