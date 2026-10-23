## 1. Progress payload contract

- [x] 1.1 Add bounded `stage_summaries` validation to the Execution API progress snapshot contract, including unique positive positions, non-empty names, and non-negative local counts.
- [x] 1.2 Preserve compatibility for existing progress snapshots while documenting `stage_summaries` as the producer contract for stage-aware rendering.
- [x] 1.3 Update the Ray progress producer/collector to publish all known stage summaries, with stage position, name, phase, and local work counts on each heartbeat.

## 2. Ray Dashboard rendering

- [x] 2.1 Add UI helpers that normalize and order valid stage summaries and calculate only a stage-local percentage when the total is positive.
- [x] 2.2 Render a single-stage workload from its local counts, ignoring `pipeline_percent` and legacy `percent` for the displayed percentage.
- [x] 2.3 Render multi-stage workloads as one labelled progress indicator per stage (`Stage {position}: {name}`), without an aggregate percentage or aggregate bar.
- [x] 2.4 Retain safe states for missing/zero totals, absent progress snapshots, stalled updates, and failed Ray jobs.

## 3. Regression coverage and verification

- [x] 3.1 Add execution API tests for valid stage summaries and rejection of duplicate positions, invalid fields, and over-limit summary lists.
- [x] 3.2 Extend `TestRayDashboardIngestion` to cover fixed-token persistence of valid stage-aware progress without a JWT secret and rejection for a non-current attempt.
- [x] 3.3 Add UI tests for computed single-stage progress, ordered multi-stage local bars, ignored aggregate percentages, and indeterminate zero-total stages.
- [ ] 3.4 Run the affected UI tests and `TestRayDashboardIngestion` through Breeze.
- [x] 3.5 Run the fixed-token Ray Dashboard/Progress tests in `airflow_dags/tests/test_base_pipeline_dag.py` and report any test-environment blocker.
