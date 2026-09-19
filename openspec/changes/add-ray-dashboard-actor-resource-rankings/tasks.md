## 1. API Contract

- [x] 1.1 Add Core API response datamodels for actor resource ranking rows and CPU/memory ranking collections.
- [x] 1.2 Add a public task instance Ray Dashboard actor rankings route that accepts `try_number` and reuses existing DAG task instance access checks.
- [x] 1.3 Return 404 when the requested task attempt has no Ray Dashboard record, matching existing Ray Dashboard endpoint behavior.

## 2. Ranking Implementation

- [x] 2.1 Implement actor identity extraction from metric labels using supported actor label keys.
- [x] 2.2 Filter metric samples to actor-scoped CPU and memory metrics for the resolved `dashboard_id`.
- [x] 2.3 Group samples by actor, select the latest sample per actor for CPU and memory, sort descending by value, and limit each ranking to 20 rows.
- [x] 2.4 Enrich ranking rows with actor snapshot context when a matching actor state record is available.
- [x] 2.5 Keep the generic metric sample endpoint behavior unchanged.

## 3. UI

- [x] 3.1 Add a client-side query for the actor rankings endpoint in the Ray Dashboard page.
- [x] 3.2 Render separate CPU and memory leaderboard tables in the Actors tab without hiding the existing actor state table.
- [x] 3.3 Show empty-state text when no actor-scoped CPU or memory rankings are available.

## 4. Tests and Validation

- [x] 4.1 Add API route tests for ranking success, response limit, sort order, missing dashboard data, and non-actor metric exclusion.
- [x] 4.2 Add React tests for rendering CPU/memory leaderboard rows and empty ranking states.
- [x] 4.3 Run focused backend and frontend tests for the changed API and Ray Dashboard UI.
- [x] 4.4 Run formatting and lint checks for modified Python and TypeScript files.
