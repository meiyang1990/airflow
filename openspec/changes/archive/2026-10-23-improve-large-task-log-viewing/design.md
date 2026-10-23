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

## Context

Task logs are currently written by KubernetesExecutor task pods to `/opt/airflow/logs` on the shared RWX `airflow-logs` PVC. Remote logging is disabled in the deployed environment. The public log endpoint reads a log stream and the task-log UI uses an Axios-generated client, which retains the completed response, transforms every entry into JSX, and mounts every line in a single `<pre>`.

The observed `submit_ray_job` attempt is an active 20 MB, approximately 50,000-line file. This is large enough for response accumulation, repeated parsing, copy/download string creation, and unvirtualized DOM rendering to make the UI unusable. The change must continue to work with file logs and not remove compatibility with configured remote task-log handlers.

## Goals / Non-Goals

**Goals:**

- Bound the amount of log data transferred and retained for normal interactive viewing.
- Prioritize the newest output, with explicit navigation to older and newer pages.
- Tail a running task by fetching only entries not already displayed.
- Bound rendered DOM nodes while preserving structured-log formatting, grouping, filtering, and line links for loaded entries.
- Keep full-log retrieval available as a browser-streamed download.

**Non-Goals:**

- Building a global full-text log index or server-side search service.
- Changing task log retention, rotation, or storage provider configuration.
- Replacing existing remote task-log handlers or guaranteeing identical random-access performance for every third-party handler.
- Changing task-log authorization semantics.

## Decisions

### Add an additive, cursor-based bounded read contract

The task-log API will accept a requested page size and direction, and return at most that many parsed entries plus opaque cursors indicating whether older or newer content is available. The UI will request a bounded tail page on first load; existing consumers that omit the new parameters retain the current full-content behavior for API compatibility.

Cursor state will be server-signed and bound to the requested task-instance attempt, map index, and direction. It will carry only the handler continuation state necessary to resume reading, never credentials or raw log content. Every paged request continues to enforce the existing task-log access dependency.

This is preferred to a byte-range-only API because existing handlers expose structured entries and source metadata, and line boundaries and merged-source ordering must remain stable. It is preferred to client-side truncation because client-side truncation still downloads and parses the full file.

### Introduce bounded reads at the log-reader/handler boundary

The core reader contract will gain an optional bounded-read path that reports page metadata without materializing an unbounded result. File-backed task logs will support tail-first retrieval and continuation from the shared PVC. Handlers that can natively continue using their existing metadata will use that capability; handlers without efficient backward reading will retain a safe compatibility path and report the available navigation direction accurately.

The implementation will avoid performing a full-file `list()` conversion in the API route for bounded requests. A page limit will be expressed in parsed entries, with an independently bounded byte/read budget so an unusually large single log event cannot defeat resource limits.

### Treat live tailing as forward cursor continuation

For a running or deferred task, the UI will retain the newest page cursor and poll for only the entries following it. It will append results to a bounded in-memory window, discarding oldest loaded pages/entries once the configured client window is exceeded. The UI will display that older in-memory entries have been discarded and offer loading from persisted logs where the handler supports it.

Polling is used rather than a long-lived browser stream in the first implementation. It works with the existing authentication, retry, proxy, and task-log-handler model and prevents a long-running `ReadableStream` from retaining unbounded data. A later streaming transport can reuse the cursor contract.

### Virtualize visible log rows and defer costly formatting

The task-log viewer will use a virtualized list with measured row heights to support wrapped log entries. It will create formatted JSX only for visible/overscanned rows and will retain parsed data, not pre-created JSX for every loaded line. Group markers are processed as data and rendered within the virtual viewport; groups that span unloaded content are represented as paged boundaries rather than assumed to be complete.

This is complementary to, not a substitute for, pagination: virtualization bounds DOM work while the API contract bounds network and JavaScript memory.

### Stream downloads outside application state

The full-log action will navigate to a download-oriented API response with `Content-Disposition: attachment` rather than constructing `rawLogText` and a Blob in React. The server may stream the complete log response without adding it to query cache or UI state. Authorization and signed download controls remain in effect.

## Risks / Trade-offs

- [Different handlers have different cursor and tail capabilities] → Define explicit capability behavior, keep a compatibility path, and test file logs plus representative remote-handler metadata semantics.
- [Tail-first retrieval can require reverse scanning a large file] → Use file-oriented tail reads and a byte/read budget; preserve a visible loading state and do not claim random access where unavailable.
- [Variable-height rows make virtualization more complex] → Measure rendered rows, overscan modestly, and test wrapped ANSI/structured records and very long individual entries.
- [Client-side filtering applies only to loaded pages] → Clearly label the scope of filters; server-side full-log filtering/search is out of scope.
- [Cursor contents may become stale while a task writes] → Treat stale/invalid cursors as recoverable: reset to a fresh tail page and show a non-fatal notice.
- [Direct download can be large] → Let browser/network download handling manage the stream and retain the existing authorization checks; do not buffer it in the UI.

## Migration Plan

1. Release the API parameters and paged response fields additively while retaining the legacy unbounded response when no paging parameters are supplied.
2. Release the UI behind the new paged parameters, initially using conservative page/window defaults and telemetry/logging for page-size and cursor failures.
3. Verify file logs on the shared PVC with a large, running KubernetesExecutor task; verify compatible behavior with enabled remote-log test handlers.
4. Roll back the UI to the legacy request mode if a handler compatibility issue is found. The additive API can remain deployed without affecting existing callers.

## Resolved Defaults

- Use 1,000 structured entries per interactive page and retain at most 5,000 entries in the browser.
- Advertise backward navigation only for the local `FileTaskHandler`; other handlers retain bounded
  retrieval and native forward-continuation behavior without claiming efficient older-page support.
- Keep the retained-window limit internal for the initial release. It can become configurable after
  operational evidence shows that deployments need a different trade-off.
