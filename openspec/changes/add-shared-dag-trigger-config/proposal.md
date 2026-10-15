## Why

The Trigger DAG dialog only supports immediately creating a DagRun. Users cannot retain a vetted JSON configuration for later runs without triggering a task, so they must repeatedly re-enter configuration or reuse a previous run.

## What Changes

- Add one shared, persistent trigger JSON configuration for each DAG.
- Add a Save configuration action to the Trigger DAG dialog that validates and persists the configuration without creating a DagRun or changing DAG pause state.
- Load the saved DAG configuration when opening the dialog; use DAG `params` defaults only before any shared configuration has been saved.
- Preserve the existing "trigger again with config" behavior, which takes precedence when explicitly selected.
- Do not add user-specific ownership, named presets, configuration history, or a restore-default action.

## Capabilities

### New Capabilities

- `shared-dag-trigger-config`: Persist, retrieve, and use one shared JSON trigger configuration per DAG without triggering a run.

### Modified Capabilities

None.

## Impact

- UI trigger dialog, configuration loading, save mutation, translations, and UI tests.
- Core API routes, schemas, authorization, persistence model, and database migration.
- Generated OpenAPI client artifacts and API/unit tests.
