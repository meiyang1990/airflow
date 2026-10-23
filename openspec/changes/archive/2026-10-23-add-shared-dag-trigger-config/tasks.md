## 1. Persistence and API contract

- [x] 1.1 Add a DAG-scoped trigger-configuration metadata model with one record per `dag_id`, JSON-object configuration, and update metadata.
- [x] 1.2 Add an Alembic migration that creates the trigger-configuration table and its one-to-one DAG constraint.
- [x] 1.3 Define core API request and response data models for the shared trigger configuration, including an explicit absence response.
- [x] 1.4 Add authorized `GET` and idempotent `PUT` DAG-scoped trigger-configuration endpoints, validating the target DAG and using DAG RUN authorization plus action logging for writes.
- [x] 1.5 Update the OpenAPI definition and regenerate the UI request client artifacts.

## 2. Trigger dialog integration

- [x] 2.1 Add UI queries and a save mutation for the shared trigger-configuration resource, including success and error notifications.
- [x] 2.2 Load a saved configuration for ordinary Trigger DAG dialog opens and fall back to the DAG Params defaults only when the resource is absent.
- [x] 2.3 Preserve historical DagRun `conf` as the highest-priority explicit prefill source for Trigger again with config.
- [x] 2.4 Add a secondary Save configuration button that respects existing JSON/form validation and does not trigger, unpause, navigate, or close the dialog.
- [x] 2.5 Add translations and UI state handling for loading, saving, saved, and failed configuration operations.
- [x] 2.6 Persist the current configuration before the primary Trigger action unpauses the DAG or creates a DagRun; prevent either operation when persistence fails.
- [x] 2.7 Do not cache shared trigger JSON in the UI; fetch it from the API whenever the Trigger DAG dialog opens.

## 3. Verification

- [x] 3.1 Add core API/model tests for creation, replacement, saved empty objects, absence, DAG-not-found, authorization, action logging, and the guarantee that saving creates no DagRun.
- [x] 3.2 Add UI unit tests for default fallback, saved-config prefill, empty-config distinction, historical-config precedence, validation, and save-without-trigger behavior.
- [x] 3.3 Add or extend end-to-end coverage for saving a configuration and using it in a later normal Trigger DAG dialog session.
- [x] 3.4 Run the targeted Breeze/UV tests and relevant static checks, then record results.

### Verification results

- `BUILDER=colima breeze run --platform linux/amd64 --skip-image-upgrade-check pytest airflow-core/tests/unit/api_fastapi/core_api/routes/public/test_dag_trigger_config.py -q` — 9 passed.
- `pnpm --dir airflow-core/src/airflow/ui exec vitest run src/components/TriggerDag/SaveDagTriggerConfigButton.test.tsx src/components/TriggerDag/TriggerDAGModal.test.ts` — 5 passed.
- `pnpm --dir airflow-core/src/airflow/ui lint` — passed.
- Targeted Ruff format/check, `git diff --check`, and `openspec validate add-shared-dag-trigger-config --strict` — passed.
