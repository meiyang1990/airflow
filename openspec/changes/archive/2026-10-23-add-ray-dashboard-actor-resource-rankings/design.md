## Context

Ray Dashboard metric samples are stored in `ray_dashboard_metric_sample` and exposed today through a generic paginated metric sample endpoint. The Metrics tab can work with bounded sample batches, but the Actors tab needs a more focused operational view: which actors are currently consuming the most CPU and memory.

Computing actor rankings in the browser would require fetching and scanning large raw sample sets. The metadata database already has indexes over `dashboard_id`, `metric_name`, and `sampled_at`, so the ranking should be computed server-side and returned as a small task-scoped response.

## Goals / Non-Goals

**Goals:**
- Provide CPU and memory Top 20 actor rankings for a Ray Dashboard task attempt.
- Keep ranking queries task-scoped by resolving the existing Ray Dashboard task instance record first.
- Return a small response optimized for UI display instead of raw metric pages.
- Preserve the existing generic metric sample endpoint for the Metrics tab.
- Avoid new external dependencies or metadata schema changes unless implementation proves an index is required.

**Non-Goals:**
- Do not query live Ray Dashboard or Ray State APIs from the Airflow API server.
- Do not rank node-level, worker-level, or component-level metrics as actors.
- Do not require Prometheus or Grafana.
- Do not introduce long-running background aggregation jobs.

## Decisions

### Decision: Add a dedicated actor rankings endpoint

Add a public Core API route under the existing task instance Ray Dashboard route family, for example:

```text
GET /api/v2/dags/{dag_id}/dagRuns/{dag_run_id}/taskInstances/{task_id}/{map_index}/rayDashboard/actorRankings?try_number=1
```

The endpoint returns CPU and memory rankings with at most 20 entries per ranking. This avoids overloading the generic metrics endpoint with display-specific semantics and keeps the Actors tab from downloading thousands of raw samples.

Alternative considered: compute rankings in the React component from `/metrics?limit=5000`. Rejected because it pushes grouping, sorting, and JSON transfer costs into the browser and gets worse as metric volume grows.

### Decision: Rank latest actor-scoped metric samples

The first implementation should rank actors by the latest sample per actor for CPU and memory metrics. Actor identity should be extracted from labels using a small allowlist such as `actor_id`, `ActorID`, `actor`, `ActorName`, and `Name`, while excluding samples with no actor identity. Metric names should be matched through the existing CPU and memory naming patterns plus actor-related labels.

Alternative considered: rank by max value over the full retained sample window. Rejected as the default because it answers "peak historical usage" rather than "which actors are hottest now." A future query parameter such as `aggregation=max` can add peak ranking later.

### Decision: Merge optional actor snapshot context

When the latest actors snapshot is available, the endpoint can enrich ranking rows with class/name/state from actor records that share the same actor id or name. Ranking must still work when actor snapshots are missing or empty, because metric labels may be the only available source.

Alternative considered: require actor snapshot rows for ranking. Rejected because completed jobs or collector timing may leave actor state snapshots empty even when metric samples exist.

### Decision: Bound response and query work

The endpoint should return at most 20 CPU rows and 20 memory rows. It should filter by dashboard id first, then metric name/time where possible, and avoid returning raw sample pages. If a deployment has very high metric volume, implementation can add a recent time window parameter or a narrower SQL query using the existing `idx_ray_dashboard_metric_lookup` index.

Alternative considered: add precomputed aggregate tables. Rejected for now because the requested ranking can be derived from existing samples and must remain best-effort.

## Risks / Trade-offs

- Actor metric label names vary by Ray version. -> Use a label-key allowlist and tests covering common variants; display "no ranking data" when no actor labels are present.
- JSON label filtering is database-specific and may not use indexes efficiently. -> Filter by dashboard id and metric name first, keep results bounded, and defer schema/index changes until real data shows the need.
- Latest sample ranking may miss short-lived spikes. -> Document the behavior and leave room for a future `aggregation=max` option.
- Actor snapshot enrichment may be stale relative to metric samples. -> Treat enrichment as display context only; ranking values come from metric samples.

## Migration Plan

1. Add Core API datamodels and route for actor rankings.
2. Implement server-side ranking from persisted metric samples with bounded Top 20 results.
3. Add API tests for successful rankings, missing dashboard data, non-actor samples, and response limits.
4. Update the Actors tab to fetch the ranking endpoint and render CPU and memory tables.
5. Keep the existing Metrics tab behavior and generic metric samples endpoint unchanged.

Rollback is to hide the Actors tab ranking UI and leave the new endpoint unused; existing Ray Dashboard data ingestion and Metrics views continue to work.

## Open Questions

- Which exact Ray metric names are emitted for actor CPU and memory in the current cluster version?
- Should the first implementation include a configurable recent time window, or is latest-per-actor over all retained samples sufficient?
