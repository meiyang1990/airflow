## Context

The proposed AI diagnosis capability persists a failure explanation for a failed task attempt, while the Ray Dashboard capability persists bounded, task-attempt-scoped resource samples and snapshots. Neither capability currently converts the persisted Ray data into advice about worker sizing. This change combines those inputs only in the Airflow backend, preserving existing task-log/task-instance authorization, the LLM proxy boundary, and the fixed-token-only contract for Ray ingestion.

## Goals / Non-Goals

**Goals:**

- Analyze persisted Ray resource-consumption data for selected failed and successful task attempts.
- Return a failure explanation and a resource analysis in distinct, structured UI tables when the task failed.
- Return only the resource analysis for a successful task.
- Surface worker CPU and memory allocation, idle capacity, saturation/pressure signals when available, evidence, data limitations, and non-binding CPU/memory sizing recommendations.
- Cache results against the exact Ray data fingerprint so changed dashboard data is not represented by an old analysis.

**Non-Goals:**

- Change Ray metric collection, accept an alternative authentication mechanism, or require `api_auth.jwt_secret` for fixed-token ingestion.
- Invent CPU, memory, or utilization values when the persisted Ray data lacks the required fields or labels.
- Apply recommendations, mutate Ray cluster configuration, or autoscale workers.
- Diagnose failed tasks that have no Ray Dashboard data, or replace raw dashboard views and task logs.
- Analyze skipped, queued, running, or other incomplete task states.

## Decisions

### One backend-owned analysis action with state-dependent sections

The task-instance AI endpoint will accept only terminal `success` and `failed` attempts that have accessible Ray Dashboard data. For a failed attempt it will construct an LLM request containing the existing permitted log excerpt plus a bounded Ray resource payload and require two named result sections: `failure_diagnosis` and `resource_analysis`. For a successful attempt it will omit the log excerpt and request only `resource_analysis`.

The response and UI deliberately preserve those sections as separate tables rather than merging rows into one generic diagnosis table. A resource-analysis failure must not discard a usable failure explanation, and a successful task must never be labelled as having a failure cause.

Alternative considered: independent UI calls and model requests for the two tables. Rejected because it duplicates authorization, loading and cache behavior and can produce analyses from inconsistent Ray snapshots.

### Use a canonical, bounded Ray resource-analysis input

The backend will query the persisted Ray Dashboard record, cluster/node/worker snapshots, and metric samples already associated with the selected attempt. It will build a versioned canonical payload that contains only configured/recognized CPU and memory allocation, utilization, free/idle, capacity, and worker identity fields, together with sample timestamps, source labels, and collector-status metadata. It will preserve raw units and explicitly mark unavailable dimensions; it will not substitute similarly named labels or synthesize values.

Before invoking the LLM, the service will derive transparent per-worker and cluster summaries directly from those exact fields: observed capacity/allocation/usage values, available values where explicitly supplied, sample time span, and missing-data indicators. The prompt requires every conclusion and recommendation to cite an input evidence identifier and to state uncertainty where coverage is insufficient.

Alternative considered: pass all persisted dashboard JSON and metric history unchanged. Rejected because it creates unbounded prompts, makes the model's input ambiguous, and risks including unrelated payloads.

### Cache by task attempt, analysis schema, and resource fingerprint

A dedicated persisted result (or an extension of the AI diagnosis result after migration review) will be unique for the attempt, analysis schema version, and SHA-256 fingerprint of the canonical Ray payload. The service may reuse a successful matching result without calling the proxy. It must regenerate analysis if Ray data has a different fingerprint; it cannot use a cache row generated from another try, map index, or schema version.

The persisted result stores normalized analysis rows, summary, proxy metadata, status/error details, timestamps, and the fingerprint—not the complete Ray payload or prompt. Database types and indexes must remain portable across Airflow-supported metadata databases.

Alternative considered: cache only by task attempt. Rejected because dashboard samples can arrive after an initial analysis and would make results stale.

### Strict, evidence-based LLM output with safe degradation

The prompt will request a schema version and a JSON result. Each resource row includes scope (`cluster` or worker identity), resource (`cpu` or `memory`), observation, allocation concern, evidence identifiers, recommendation, and confidence/data-quality status. Recommendations describe suggested per-worker CPU/memory configuration or explicitly state that no sizing recommendation is justified; they are advisory only.

The parser validates required fields, normalizes valid rows, and treats malformed or unsupported output as a resource-analysis error/empty state. It does not turn arbitrary prose into fabricated structured facts. The failed-task failure-diagnosis parser retains the existing graceful textual fallback independently.

### Preserve existing security and ingestion boundaries

The core API performs the same user authorization used for the task instance and Ray Dashboard reads before it accesses inputs or cached results. Ray data continues to enter solely through the existing task-scoped Execution API ingestion endpoint using the deployment fixed token; this analysis feature neither changes that endpoint nor reads JWT secrets.

## Risks / Trade-offs

- [Risk] Sparse or stale samples can lead to misleading sizing advice. → Require timestamps and data-quality states, make missing metrics visible, and permit an explicit “insufficient data” result.
- [Risk] LLM output cites data incorrectly. → Require evidence identifiers, validate the response schema, and retain the source dashboard as the operator's inspectable evidence.
- [Risk] Prompt size grows with worker and sample count. → Bound and deterministically aggregate the canonical input, preserving source counts and omitted-data notices.
- [Risk] A dashboard change invalidates prior advice. → Include the canonical payload fingerprint in cache identity and return cache metadata to the UI.
- [Risk] Existing Ray data may include sensitive identifiers. → Reuse existing access checks, send only the minimal canonical analysis input, and do not persist the prompt/payload.

## Migration Plan

1. Add portable model/migration support for versioned AI Ray resource-analysis results and cache lookup indexes.
2. Implement canonical payload construction from existing persisted Ray data and the LLM proxy request/response parser.
3. Extend the task-instance AI endpoint and generated client models, retaining failed-task compatibility.
4. Update the AI Diagnosis UI to render the two failure-path tables and success-path resource table, including unavailable/insufficient-data states.
5. Release behind the existing AI/Ray feature configuration controls; rollback disables the UI/API path while retaining cached rows safely.

## Open Questions

- Which exact Ray metric names and label keys does the deployed collector guarantee for worker CPU and memory capacity, allocation, usage, and free values?
- What deployment-approved bounds should apply to worker count, samples per worker, and analysis retention?
- Should a user-visible “reanalyze latest Ray data” action be introduced after the initial cache behavior is delivered?
