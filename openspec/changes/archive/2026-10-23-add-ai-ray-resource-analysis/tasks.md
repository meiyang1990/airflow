## 1. Resource Analysis Persistence and Input Contract

- [x] 1.1 Inspect the existing Ray Dashboard models and persisted metric/snapshot schemas, then define the explicit supported CPU, memory, worker identity, timestamp, and unit fields without adding fallback label interpretation.
- [x] 1.2 Add a portable metadata model and Alembic migration for versioned task-attempt resource-analysis results, including status, LLM metadata, schema version, canonical Ray payload fingerprint, structured rows, timestamps, and cache lookup indexes.
- [x] 1.3 Add model and migration tests for task-attempt identity, analysis-schema/fingerprint cache identity, structured result storage, and supported database backends.
- [x] 1.4 Implement bounded, deterministic canonical Ray resource-payload construction with direct evidence identifiers, retained time range, omitted-record count, and explicit unavailable-data markers.
- [x] 1.5 Add unit tests for CPU/memory worker evidence, missing or ambiguous fields, deterministic bounds, units/timestamps, and no-inference behavior.

## 2. AI Resource Analysis Service

- [x] 2.1 Implement terminal-state and Ray Dashboard availability validation for the task-instance AI analysis service, allowing only failed and successful attempts.
- [x] 2.2 Extend prompt construction so failed attempts supply the permitted failure log excerpt and canonical Ray payload, while successful attempts supply only the canonical Ray payload.
- [x] 2.3 Define and validate the structured LLM resource-analysis response: observations, allocation concerns, evidence identifiers, advisory worker CPU/memory recommendations, confidence, and data-quality state.
- [x] 2.4 Implement cache lookup and persistence keyed by task attempt, analysis schema version, and canonical Ray payload fingerprint; regenerate results when the fingerprint changes.
- [x] 2.5 Ensure a resource-analysis parsing/proxy failure is independently represented and does not discard a valid failed-task diagnosis result.
- [x] 2.6 Add backend tests for failed/successful behavior, cache hit/miss/invalidation, LLM errors and malformed output, insufficient evidence, authorization, and advisory-only recommendation behavior.

## 3. API and Security Boundaries

- [x] 3.1 Extend FastAPI AI analysis datamodels and route responses with separately typed failure-diagnosis and resource-analysis sections plus cache/data-quality metadata.
- [x] 3.2 Reuse existing task-log authorization for failure diagnosis and Ray Dashboard/task-instance authorization for resource input and result reads; add API coverage for denied access.
- [x] 3.3 Verify the implementation does not modify Ray Dashboard/Progress fixed-token ingestion authentication, does not require `api_auth.jwt_secret`, and does not grant fixed-token access to any additional endpoint.
- [x] 3.4 Regenerate the frontend OpenAPI client through the repository workflow and add route/API tests for failed and successful task responses.

## 4. Task Instance UI

- [x] 4.1 Update the AI Diagnosis tab action and state messaging for completed Ray tasks, differentiating unavailable Ray data from non-terminal task state.
- [x] 4.2 Render failed-task failure diagnosis and Ray resource analysis as two independent tables with clear section headings, loading/error states, and cache indicators.
- [x] 4.3 Render successful-task Ray resource analysis without a failure-diagnosis section, including CPU/memory allocation observations, worker-level evidence, recommendations, confidence, and insufficient-data state.
- [x] 4.4 Add English and Simplified Chinese translations for the resource-analysis and advisory recommendation fields.
- [x] 4.5 Add frontend tests covering failed dual-table output, successful resource-only output, unavailable data, cache state, independent section errors, and absence of a failure cause for successful tasks.

## 5. Verification

- [x] 5.1 Run ruff format and ruff check for every modified Python file immediately after editing.
- [x] 5.2 Run focused backend model, canonicalization, service, authorization, and API tests through Breeze as required by repository guidance.
- [x] 5.3 Run `TestRayDashboardIngestion` in `airflow-core/tests/unit/api_fastapi/execution_api/versions/head/test_task_instances.py` through Breeze and the fixed-token tests in `airflow_dags/tests/test_base_pipeline_dag.py`; report any environment blocker.
- [x] 5.4 Run focused UI tests and the required OpenAPI client generation/validation workflow.
- [x] 5.5 Validate this OpenSpec change with `openspec validate add-ai-ray-resource-analysis --strict`.
