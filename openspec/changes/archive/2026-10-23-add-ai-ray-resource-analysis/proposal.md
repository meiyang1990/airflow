## Why

The AI diagnosis flow explains task failures but does not turn the Ray resource data already associated with a task attempt into actionable cluster guidance. Operators need a resource analysis for both failed and successful Ray tasks so they can identify idle or constrained worker CPU and memory and tune worker sizing from evidence rather than guesswork.

## What Changes

- Add an AI Ray resource-analysis capability that supplies task-attempt-scoped Ray cluster resource-consumption data to the configured LLM proxy and persists its structured result.
- For a failed task, return the existing task-failure diagnosis and the Ray resource analysis as two separately rendered result tables.
- For a successful task, allow the AI action to return the Ray resource analysis table without creating a failure-cause diagnosis.
- Define a structured resource-analysis result covering current allocation, worker CPU and memory idle/pressure observations, evidence, and per-worker CPU/memory configuration recommendations.
- Reuse the existing Ray Dashboard data, task-attempt authorization, fixed-token ingestion contract, and LLM proxy integration; do not introduce a second Ray collector or expose model credentials to the browser.

## Capabilities

### New Capabilities

- `task-instance-ai-ray-resource-analysis`: Generate, cache, and present AI analysis and sizing recommendations from persisted Ray cluster resource-consumption data for a task attempt.

### Modified Capabilities

- `task-instance-ai-diagnosis`: Permit successful task instances to request the shared AI analysis action while preserving failure-cause diagnosis exclusively for failed task instances.

## Impact

- Airflow metadata database: persisted resource-analysis result linked to a task attempt and its Ray Dashboard data version or fingerprint.
- FastAPI task-instance endpoints and datamodels: an AI analysis response containing separate failure-diagnosis and resource-analysis sections.
- Airflow UI: AI Diagnosis tab presents two distinct tables for failed tasks and the resource-analysis table for successful tasks.
- Existing Ray Dashboard storage/ingestion and `zerith-common-mcp-server` LLM proxy: resource data becomes model input; the fixed-token, POST-only ingestion contract remains unchanged.
- Tests: backend authorization, state-specific behavior, cache invalidation, data-quality states, prompt shaping, and UI rendering for success and failure paths.
