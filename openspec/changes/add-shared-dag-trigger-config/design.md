## Context

The Trigger DAG dialog currently starts with the current DAG `params` defaults, held only in the browser for the lifetime of the dialog. A user can explicitly reopen a selected DagRun's `conf` through "trigger again with config", but there is no persisted configuration associated with the DAG itself. Triggering currently posts to the DagRun API and necessarily creates a queued run.

The requested configuration is shared by DAG, not owned by an authenticated user. Each DAG has at most one saved JSON object. Once it exists, it becomes the normal dialog prefill for every authorized user; there is intentionally no UI operation to remove it and return to code defaults.

## Goals / Non-Goals

**Goals:**

- Persist one JSON configuration per DAG without creating a DagRun.
- Return the saved configuration to authorized users and use it as the normal trigger-dialog prefill.
- Keep the saved configuration independent of the DAG source definition and DAG `params` defaults.
- Preserve existing one-off historical DagRun configuration reuse.
- Reuse existing DAG RUN authorization and create audit events through the normal API action-logging mechanism.

**Non-Goals:**

- Per-user configuration ownership or visibility.
- Multiple named presets, revision history, deletion, or restoration of DAG `params` defaults.
- Persisting run ID, dates, data interval, partition key, note, or other per-run fields.
- Automatically triggering a DAG after saving, or changing its paused state.
- Guaranteeing that a saved configuration will remain valid if the DAG's Params schema changes later.

## Decisions

### Store a dedicated one-to-one DAG configuration record

Introduce a metadata-database model and migration with `dag_id` as the primary key, a non-null JSON `conf` object, and update metadata. This provides an explicit lifecycle and query shape for one shared configuration per DAG.

Do not reuse Airflow Variables: their keys, permissions, runtime availability, and secret semantics do not express a DAG-scoped UI configuration. Do not alter `DagModel` or serialized DAG content: those represent parsed deployment state, while this is mutable UI state.

### Expose a resource API separate from DagRun creation

Add `GET` and idempotent `PUT` endpoints at `/dags/{dag_id}/trigger-config`. `GET` returns either the saved configuration or a not-found result so the UI can distinguish an absent record from a saved empty object `{}`. `PUT` upserts the JSON configuration and returns the stored representation.

Both endpoints use existing `DagAccessEntity.RUN` authorization: the configuration controls manual DAG triggers, and using the existing authorization vocabulary avoids an auth-manager contract expansion. `PUT` also uses action logging. A missing or stale DAG returns the same DAG-not-found behavior as other DAG-scoped resources.

`conf` is a JSON object, including `{}`. The API validates its JSON-object shape but does not persist a rendered Param schema or mutate data based on the current DAG definition. The UI disables Save when its JSON editor or structured Param fields report invalid input; the trigger endpoint remains the authoritative validation point for a particular run.

### Define deterministic prefill precedence

For ordinary dialog opens, load the saved resource first. If it exists, initialize `conf` from its contents; if it does not exist, initialize from the DAG `params` response. The absence of a saved record is distinct from a saved empty configuration.

When the user selects the existing "trigger again with config" action, the selected DagRun's `conf` overrides both sources for that dialog session. Only `conf` is reused; existing behavior continues to reset per-run fields such as IDs and times.

### Keep save independent from submit

The form exposes a secondary `Save configuration` action. It serializes the current `conf` and calls `PUT`; it does not call `useTrigger`, toggle pause state, navigate, close the modal, or invalidate DagRun/Grid queries. On success it refreshes the saved-configuration query and displays a confirmation.

Concurrent saves use last-successful-write-wins semantics. The UI does not cache the saved JSON configuration; reopening the dialog fetches the current value from the API.

### Persist configuration before triggering

The primary Trigger action first upserts the form's current JSON configuration. Only after that write succeeds may it unpause the DAG when selected and create the DagRun. If persistence fails, the dialog remains open and neither the pause state nor a DagRun changes. The automatic write updates the cached saved configuration but does not show the separate Save configuration success notification; the normal trigger success notification remains the final user feedback.

## Risks / Trade-offs

- [A user with RUN write access can change the shared default for other users] → This follows the confirmed DAG-shared ownership model and existing manual-run authorization. Action logging records writes; deployments that need stronger separation can enforce it in their auth manager.
- [A saved configuration can become incompatible after a DAG code change] → Keep the record intact and surface normal client/server validation when it is loaded or triggered; do not silently delete user data.
- [JSON payloads may contain sensitive values] → Treat the resource as DAG configuration data protected by DAG authorization; do not expose it via Variables or task-runtime APIs. Follow existing API response/log-redaction policies and avoid logging `conf` contents.
- [Last-write-wins can overwrite an adjacent edit] → Scope is one shared record and no collaboration/version feature was requested; return `updated_at` for future optimistic-concurrency support if needed.

## Migration Plan

1. Add the metadata table and migration; existing deployments receive no configuration records.
2. Deploy the API and UI together. With no row present, all DAGs retain their existing Params-default behavior.
3. Rollback can leave the new table unused; it does not modify DAG definitions, DagRuns, Variables, or task data.

## Open Questions

None for the agreed one-record-per-DAG scope.
