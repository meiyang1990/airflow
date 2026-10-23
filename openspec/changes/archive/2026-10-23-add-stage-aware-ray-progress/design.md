## Context

The Ray Dashboard stores task-owned progress as a bounded `progress` section snapshot. The existing UI renders `pipeline_percent` before `percent`, while also showing top-level `processed_units` and `total_units`. This allows an unchanging or stale pipeline value of `0` to mask active current-stage work. Calculating a replacement pipeline percentage from the current stage would be incorrect because stage workloads and weights are business-specific.

The user has defined the intended display semantics: a single-stage workload uses its own processed-to-total ratio; a multi-stage workload shows one local progress bar per stage, labelled with the stage sequence and name. The existing fixed-token path for `POST /execution/task-instances/{task_instance_id}/ray-dashboard/ingest` is an established authentication contract and is out of scope for this change.

## Goals / Non-Goals

**Goals:**

- Make a progress snapshot describe a bounded, ordered set of stages with enough information to render local progress correctly.
- Render a computed percentage only where that percentage has an unambiguous scope: one stage.
- Make all multi-stage progress visible without assuming equal stage weights or inventing a pipeline-wide percentage.
- Maintain safe handling for zero/unknown totals, malformed snapshots, no progress snapshot, stale heartbeats, and terminal failures.
- Preserve the existing fixed-token ingestion behavior and current-attempt validation.

**Non-Goals:**

- Define a business-wide or cross-stage weighting formula.
- Derive stage values from Ray task/actor metrics when the driver has not reported them.
- Change task state, ETA calculation, or ingestion authentication.
- Persist a separate database table for stage progress; stage summaries remain part of the bounded progress snapshot.

## Decisions

1. Add `stage_summaries` to the `progress` snapshot payload.

   Each item will contain `stage_position`, `stage_name`, `phase`, `processed_units`, `total_units`, and optional local metadata such as `unit_type`, `throughput_per_minute`, `eta_seconds`, and `estimated_completion_at`. Positions are unique positive integers and summaries are bounded by the same small-detail limit used for actor summaries. The Execution API will reject a malformed or over-limit list before persistence.

   This makes stage scope explicit and lets one snapshot represent completed, active, and pending stages. A separate storage model would add migration and query complexity without a requirement for independent stage history.

2. Use stage-local ratios as the only computed percentage.

   When exactly one stage is reported, the overview and Progress view calculate `processed_units / total_units * 100` from that stage. The UI must render an indeterminate state, not `0%`, if the total is zero or unavailable. `pipeline_percent` and legacy `percent` will not override this calculated single-stage value.

   For two or more stages, the UI omits the global percentage and global progress bar. It renders each stage independently, sorted by `stage_position`, with a bar only when its local total is positive. This avoids the invalid alternatives of equal stage weighting or using only the current stage to represent the pipeline.

3. Make stage labels explicit and stable.

   Each stage card/bar uses `Stage {stage_position}: {stage_name}`. Phase determines the textual state (`Pending`, active processing, completed, or producer-provided state) but does not alter the local arithmetic. Current-stage heartbeat, ETA, throughput, and the existing actor-detail panel remain associated with reported current-stage data.

4. Retain legacy top-level fields only as transitional display data.

   Existing top-level progress fields remain accepted to avoid breaking old producers. The UI can continue to show a safe legacy/no-stage state, but it must not present a derived global percentage for a payload declaring multiple stages. Ray progress producers will be updated to provide `stage_summaries`; tests will make the new path the expected behavior.

## Risks / Trade-offs

- [A producer reports only an active stage] → The UI displays only the reported stage and does not imply that it represents total pipeline completion.
- [A stage total is zero, missing, or invalid] → Render that stage as indeterminate rather than divide by zero or show a fabricated percentage.
- [Stage ordering changes between reports] → Sort at render time and reject duplicate positions, so the visual order is deterministic.
- [A multi-stage producer still sends `pipeline_percent`] → Ignore it for aggregate display; it cannot supersede the user-approved stage-local model.
- [Payload growth] → Enforce the existing section byte limit and a fixed maximum number of stage summaries.

## Migration Plan

1. Extend progress-payload validation and the producer/collector payload contract with bounded `stage_summaries`.
2. Update Ray progress producers to send all known stages on each progress heartbeat.
3. Update the dashboard UI to render single-stage and multi-stage layouts according to the new contract, while retaining a safe legacy fallback.
4. Add API and UI regression tests, including fixed-token/current-attempt ingestion coverage.
5. Deploy producer and UI changes together when possible; older payloads continue to render without introducing false aggregate progress.

Rollback consists of reverting the producer/UI changes. Existing snapshots remain readable because the new field is optional JSON within the existing `progress` section.

## Open Questions

- Should an unreported future stage be included as a `Pending` summary by the producer, or only appear once known to the driver?
- Which producer-owned phase vocabulary will distinguish `pending`, `processing`, `completed`, and `failed` consistently across workloads?
