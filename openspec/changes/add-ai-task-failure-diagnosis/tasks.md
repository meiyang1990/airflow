## 1. Database Persistence

- [x] 1.1 Add an Airflow metadata DB migration for `task_instance_ai_diagnosis` with the agreed PostgreSQL-compatible columns, unique constraint, and indexes.
- [x] 1.2 Add the SQLAlchemy ORM model for persisted task instance AI diagnosis results.
- [x] 1.3 Add model or migration tests covering table shape, uniqueness, and JSON diagnosis item storage.

## 2. Backend Diagnosis Service

- [x] 2.1 Add Airflow configuration options for enabling AI diagnosis, LLM proxy URL, optional Basic Auth credentials, timeout, and log excerpt limits.
- [x] 2.2 Implement task instance lookup and failed-state validation for diagnosis requests.
- [x] 2.3 Implement all-level log loading through `TaskLogReader` using the same task-log permission boundary.
- [x] 2.4 Implement deterministic log excerpting for lines 18 through 140 plus the final 300 lines, with overlap deduplication.
- [x] 2.5 Implement prompt construction that asks the LLM for JSON with summary and diagnosis items and includes task identity metadata.
- [x] 2.6 Implement the mcpserver `/llm/proxy` HTTP client with timeout, optional Basic Auth, success parsing, and error mapping.
- [x] 2.7 Implement cache lookup and persistence so successful existing diagnosis rows are returned without calling the LLM proxy.
- [x] 2.8 Add backend unit tests for cache hits, cache misses, log excerpting, non-failed task rejection, LLM proxy failures, and malformed model output fallback.

## 3. API Surface

- [x] 3.1 Add request and response datamodels for task instance AI diagnosis.
- [x] 3.2 Add the task instance AI diagnosis route under the FastAPI core API.
- [x] 3.3 Ensure OpenAPI generation includes the new endpoint for frontend query generation.
- [x] 3.4 Add API tests covering authorization, successful cached response, generated response, and failed-state validation.

## 4. UI Implementation

- [x] 4.1 Replace the current AI Diagnosis empty state with a toolbar containing try selection, diagnosis action, cache status, and loading/error states.
- [x] 4.2 Disable or explain the diagnosis action for non-failed task instances.
- [x] 4.3 Render successful diagnosis output with a summary panel and table columns for category, finding, evidence, suggestion, and confidence.
- [x] 4.4 Add or update i18n strings for English and Simplified Chinese.
- [x] 4.5 Add frontend tests for failed-task diagnosis, cached result display, loading state, error state, and non-failed task behavior.

## 5. Verification

- [x] 5.1 Run ruff format and ruff check for each modified Python file immediately after editing.
- [x] 5.2 Run focused backend tests for the new model, service, and API route.
- [x] 5.3 Run focused frontend tests for the AI Diagnosis page.
- [x] 5.4 Regenerate frontend OpenAPI client artifacts if required by the repository workflow.
- [x] 5.5 Validate the OpenSpec change with `openspec validate add-ai-task-failure-diagnosis --strict`.
