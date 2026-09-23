## Why

Failed task investigation currently requires users to manually inspect long task logs and infer the root cause themselves. Adding an AI-assisted diagnosis flow gives operators a faster first-pass explanation while preserving the original logs as the source of truth.

## What Changes

- Add an AI diagnosis view for failed task instances that can summarize likely failure causes from task logs.
- Reuse Airflow task-log access controls before generating or returning a diagnosis.
- Extract all-level task logs using the existing log reader, then send only the configured diagnostic excerpt: log lines 18 through 140 plus the final 300 lines.
- Call the Kubernetes-deployed `zerith-common-mcp-server` LLM proxy when no cached diagnosis exists.
- Persist diagnosis results in PostgreSQL and return cached results for repeated requests for the same task try.
- Render diagnosis results in the task instance AI Diagnosis tab as a polished, scan-friendly table.

## Capabilities

### New Capabilities
- `task-instance-ai-diagnosis`: AI-assisted diagnosis for failed task instances, including log excerpting, LLM proxy invocation, PostgreSQL persistence, cache retrieval, and UI display.

### Modified Capabilities

None.

## Impact

- Airflow metadata database: new table and migration for persisted AI diagnosis results.
- Airflow FastAPI core API: new task instance diagnosis endpoint and datamodels.
- Airflow UI: enhanced `TaskInstance/AIDiagnosis.tsx` page, generated OpenAPI query client usage, and translations.
- External system: calls Kubernetes service `zerith-common-mcp-server.bigdata.svc.cluster.local:8000` at `/llm/proxy`.
- Configuration: new Airflow options for enabling the feature, LLM proxy URL/auth, timeout, and log excerpt limits.
