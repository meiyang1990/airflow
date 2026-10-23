<!--
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
 -->

## Why

The current task-log page transfers, parses, retains, and renders an entire task log in the browser. A running KubernetesExecutor task in the current deployment already produces a 20 MB, roughly 50,000-line log on the shared `airflow-logs` PVC, which makes the page unresponsive and worsens as the task continues to run.

Users need to inspect the most recent task output promptly without requiring a complete log download or sacrificing access to older content and full-log downloads.

## What Changes

- Add bounded task-log retrieval with opaque continuation cursors so the UI can request an initial tail page and adjacent pages instead of receiving an entire log.
- Add an incremental tailing path for running task instances that fetches only new log entries and retains a bounded in-browser window.
- Replace all-at-once task-log rendering with a virtualized log viewport, including clear loading and truncation context.
- Change full-log download to a browser-managed streaming download rather than constructing a complete in-memory string and Blob in the UI.
- Preserve existing task-log authorization, try selection, structured log display, ANSI rendering, grouping, filters, and compatibility with configured task log handlers.

## Capabilities

### New Capabilities

- `bounded-task-log-retrieval`: Page and continue task-log reads without transferring the entire log response.
- `large-task-log-viewing`: Efficiently inspect, tail, navigate, and download large task logs in the Airflow UI.

### Modified Capabilities

- None.

## Impact

- Backend task-log route and log-reader/handler integration under `airflow-core/src/airflow/api_fastapi/core_api/routes/public/log.py` and `airflow-core/src/airflow/utils/log/`.
- Generated OpenAPI client and React log query/view components under `airflow-core/src/airflow/ui/src/`.
- Unit and UI tests for cursor handling, running-task tailing, download behavior, and large-log rendering.
- No new infrastructure dependency or remote-log backend is required; the initial target is the existing shared-PVC file-task-log deployment, while preserving handler compatibility.
