## Why

The Ray Dashboard progress view currently treats a producer-supplied pipeline percentage as the primary value even when the task has reported measurable work for its current stage. That value can remain at zero while work is progressing, and a current-stage ratio cannot safely stand in for whole-pipeline progress when stages have different workloads.

## What Changes

- Define a stage-aware Ray Dashboard progress payload that reports ordered stage summaries, including each stage's position, name, state, and local work counts.
- Render a distinct progress bar for every reported stage, labelled with its sequence number and name.
- For a single-stage task, calculate and display its progress from `processed_units / total_units`; do not require or prefer `pipeline_percent`.
- For a multi-stage task, display stage-local progress only and do not fabricate a whole-pipeline percentage from one stage's counts.
- Preserve current-stage throughput, ETA, heartbeat, and stage status information where it is reported.

## Capabilities

### New Capabilities

- `stage-aware-ray-progress`: Defines the Ray Dashboard progress payload and rendering behavior for single-stage and multi-stage workloads.

### Modified Capabilities

- None.

## Impact

- Ray progress producers/collectors must publish stage summaries through the existing `progress` snapshot contract.
- Execution API progress-payload validation and ingestion tests will need the new bounded stage-summary fields.
- `airflow-core/src/airflow/ui/src/pages/TaskInstance/RayDashboard.tsx` and its UI tests will render stage-level progress instead of relying on `pipeline_percent` for multi-stage workloads.
- The fixed-token ingestion contract remains unchanged.
