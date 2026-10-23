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

## 1. API contract and generated client

- [x] 1.1 Define additive bounded-read query parameters and paged log response metadata in the public OpenAPI models and route contract, including opaque older/newer cursor fields and download response semantics.
- [x] 1.2 Regenerate the UI OpenAPI client and update API documentation/examples without editing generated artifacts by hand.
- [x] 1.3 Add route-level tests for authorization, invalid or cross-task cursors, legacy requests without paging parameters, and bounded response metadata.

## 2. Bounded log-reader implementation

- [x] 2.1 Introduce a bounded-read result and cursor state at the task-log reader boundary, with entry and byte/read limits and no unbounded API-route materialization.
- [x] 2.2 Implement tail-first and older/newer continuation for the file task-log handler used by the shared-PVC KubernetesExecutor deployment.
- [x] 2.3 Implement forward continuation for running and deferred task logs so polling returns only entries emitted after the newest cursor.
- [x] 2.4 Define and implement capability reporting and safe fallback behavior for handlers that do not support efficient backward navigation.
- [x] 2.5 Add focused log-reader and handler tests for page boundaries, large entries, source/group records, stale cursors, growing files, and handler capability fallback.

## 3. Download handling

- [x] 3.1 Add an authorized download-oriented task-log response that streams the complete selected attempt as an attachment without collecting it into the interactive paged response.
- [x] 3.2 Add API tests covering download headers, task-attempt scope, and a log larger than an interactive page.

## 4. Paged and virtualized log viewer

- [x] 4.1 Replace the current whole-response `useLogs` flow with paged query state that requests an initial tail page, loads available older/newer pages, and resets correctly on task-attempt changes.
- [x] 4.2 Implement cursor-based polling for running/deferred tasks with a bounded retained entry window and visible discarded-history state.
- [x] 4.3 Replace the all-row `<pre>` rendering with the existing `@tanstack/react-virtual` dependency, including measured variable-height wrapped rows and lazy structured-log formatting.
- [x] 4.4 Preserve source/level filters, structured log groups, ANSI/link rendering, line links, fullscreen, and attempt selection; label filtering as applying only to loaded pages.
- [x] 4.5 Change the download control to trigger the attachment response and remove complete-log string/Blob construction from UI state.

## 5. Verification and rollout readiness

- [x] 5.1 Add UI unit tests for initial tail view, page navigation, bounded live tailing, virtualized row count, loaded-data filter messaging, and direct download behavior.
- [x] 5.2 Add an integration/regression test using a large file-task log to verify the API page bound and that opening the UI does not request the complete log.
- [x] 5.3 Run relevant backend and UI test suites, static checks, and generated-client validation; record the default page/window values and benchmark results against the observed 20 MB task log.
