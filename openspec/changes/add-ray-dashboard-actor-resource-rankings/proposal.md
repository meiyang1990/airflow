## Why

Ray Dashboard's Actors view shows actor state records, but it does not identify which actors are the largest CPU or memory consumers. Operators need a quick, task-scoped ranking to diagnose hot actors without downloading and sorting thousands of raw metric samples in the browser.

## What Changes

- Add a task-instance Ray Dashboard API that returns actor CPU and memory rankings for the selected task attempt.
- Rank actors by latest actor-scoped CPU and memory metric samples, returning at most 20 rows per ranking.
- Include enough actor identity and metric context for the UI to show actor name/id, class when available, value, metric name, labels, and sample time.
- Update the Ray Dashboard Actors tab to render CPU and memory ranking tables alongside the existing actor state table.
- Keep raw metric sample rendering unchanged for the Metrics tab; the new ranking endpoint is optimized for the Actors tab.

## Capabilities

### New Capabilities
- `ray-dashboard-actor-resource-rankings`: Provides task-scoped actor CPU and memory rankings for the Ray Dashboard Actors view.

### Modified Capabilities

## Impact

- Affected API: public task instance Ray Dashboard routes under `airflow-core/src/airflow/api_fastapi/core_api/routes/public/task_instances.py`.
- Affected data models: Ray Dashboard API response datamodels for ranking payloads.
- Affected UI: `airflow-core/src/airflow/ui/src/pages/TaskInstance/RayDashboard.tsx`.
- Affected tests: API route tests and Ray Dashboard React tests.
- No new external dependencies are expected.
