## Context

The task instance page already includes an `AI 诊断` tab, but it currently renders only an unavailable empty state. Task logs are available through the existing task log reader and FastAPI route, and the UI already parses all log levels client-side before applying display filters.

The external LLM entry point is the Kubernetes-deployed `zerith-common-mcp-server` service in the `bigdata` namespace. The service exposes port `8000` and the LLM proxy path `/llm/proxy`, so the in-cluster default URL should be:

```text
http://zerith-common-mcp-server.bigdata.svc.cluster.local:8000/llm/proxy
```

The mcpserver LLM proxy owns upstream model credentials, provider selection, timeout/retry handling, and LLM audit logging. Airflow should integrate with that proxy rather than calling the upstream model provider directly.

## Goals / Non-Goals

**Goals:**
- Provide an AI diagnosis action for failed task instances.
- Reuse Airflow task-log permissions before reading logs or returning diagnosis data.
- Extract all-level logs and build a deterministic excerpt from log lines 18 through 140 plus the final 300 lines.
- Persist one diagnosis result per task instance try and return cached results on later requests.
- Display the diagnosis as a clean, table-oriented UI under the AI Diagnosis tab.
- Keep LLM provider credentials out of the browser and out of Airflow source code.

**Non-Goals:**
- Diagnose successful, running, queued, skipped, or otherwise non-failed task instances.
- Store the full task log excerpt or full prompt in the Airflow metadata database.
- Replace the normal task log page or hide raw log evidence from users.
- Add streaming LLM responses, conversational follow-up, or historical diagnosis comparison in the first implementation.
- Change the mcpserver LLM proxy contract.

## Decisions

### Backend-owned diagnosis flow

Airflow will expose a backend diagnosis endpoint under the task instance API surface. The UI will call Airflow only; Airflow will check permissions, read logs, consult the diagnosis table, and call mcpserver when needed.

Alternatives considered:
- Browser calls mcpserver directly. Rejected because it exposes service topology/auth concerns to the browser and bypasses Airflow permission checks.
- UI builds the prompt from already-fetched logs. Rejected because diagnosis persistence and cache identity should be owned server-side.

### Persist cached diagnosis by task try

Use a new PostgreSQL table keyed by `(dag_id, run_id, task_id, map_index, try_number)`. The table stores the normalized diagnosis summary, structured diagnosis items, mcpserver metadata, a SHA-256 hash of the sent log excerpt, status/error fields, and timestamps.

Initial PostgreSQL shape:

```sql
CREATE TABLE task_instance_ai_diagnosis (
    id BIGSERIAL PRIMARY KEY,
    dag_id VARCHAR(250) NOT NULL,
    run_id VARCHAR(250) NOT NULL,
    task_id VARCHAR(250) NOT NULL,
    map_index INTEGER NOT NULL DEFAULT -1,
    try_number INTEGER NOT NULL,
    state VARCHAR(50),
    log_line_count INTEGER NOT NULL DEFAULT 0,
    log_excerpt_sha256 CHAR(64) NOT NULL,
    llm_request_id VARCHAR(128),
    provider VARCHAR(128),
    model VARCHAR(256),
    summary TEXT NOT NULL,
    diagnosis_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_response TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_task_instance_ai_diagnosis
        UNIQUE (dag_id, run_id, task_id, map_index, try_number)
);

CREATE INDEX idx_task_instance_ai_diagnosis_lookup
    ON task_instance_ai_diagnosis (dag_id, run_id, task_id, map_index, try_number);

CREATE INDEX idx_task_instance_ai_diagnosis_created_at
    ON task_instance_ai_diagnosis (created_at DESC);
```

Airflow implementation should represent this through an ORM model and migration rather than raw application-time DDL.

### Deterministic log excerpting

The diagnosis service will read all available log content for the selected task try through `TaskLogReader`, convert structured entries to text, and build the excerpt from:
- lines 18 through 140, inclusive
- the final 300 lines

If ranges overlap, duplicated lines will be removed while preserving original log order. If fewer than 18 lines exist, the excerpt will contain only the final-300-lines section. The prompt will label sections so the model understands that the first selected block is contextual and the tail block is failure-proximate.

### Strict response shape from the model

The prompt will ask mcpserver to return JSON containing `summary` and `items`. Airflow will parse that JSON and store structured rows for the UI. If the model returns non-JSON text, Airflow will fall back to storing that content as the summary with an empty item list rather than failing the whole diagnosis.

### Configurable external service

Add Airflow configuration for:
- feature enabled flag
- LLM proxy URL
- optional Basic Auth username/password or secret-backed environment values
- request timeout
- log context start/end lines and tail line count

Defaults should match the agreed deployment where reasonable, but deployments must be able to override them.

### UI as diagnosis panel, not chat

The AI Diagnosis tab should present a toolbar and results table. The primary action is an `AI诊断` button. Below it, the summary and table show category, finding, evidence, suggestion, and confidence. Evidence should use compact monospace styling, while the overall layout should remain consistent with the current Chakra UI patterns.

## Risks / Trade-offs

- [Risk] LLM calls can be slow or fail. -> Mitigation: use a backend timeout, show loading/error states, and cache successful results.
- [Risk] Logs may contain sensitive values. -> Mitigation: do not store full prompts or excerpts in the diagnosis table; store only a hash and the model-produced result.
- [Risk] Cached diagnosis may become stale if remote logs change for the same try. -> Mitigation: store `log_excerpt_sha256`; a later refresh capability can compare hashes if needed.
- [Risk] Model output may be malformed. -> Mitigation: parse JSON defensively and preserve useful text as a fallback summary.
- [Risk] LLM proxy credentials and service URLs vary by deployment. -> Mitigation: use Airflow configuration rather than hard-coded credentials.

## Migration Plan

1. Add the metadata database migration and ORM model for diagnosis results.
2. Deploy Airflow with the feature disabled or with the LLM proxy URL configured.
3. Enable the feature in environments where the Airflow webserver can reach `zerith-common-mcp-server.bigdata.svc.cluster.local:8000`.
4. Roll back by disabling the feature flag. The table can remain unused if the feature is disabled.

## Open Questions

- Should a later version add an explicit `重新诊断` action that bypasses the cache and updates the existing row?
- Should diagnosis rows be retained forever, or should deployments have a cleanup policy based on age?
