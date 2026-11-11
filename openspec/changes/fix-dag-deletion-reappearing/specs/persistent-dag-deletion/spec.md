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

<!-- SPDX-License-Identifier: Apache-2.0 -->

## ADDED Requirements

### Requirement: Persistent deletion survives source rediscovery

The system SHALL persist deletion intent for the final DAG ID independently of DAG metadata and SHALL permanently prevent registration and scheduling of that ID without a restoration mechanism.

#### Scenario: Source remains available
- **WHEN** a user persistently deletes a DAG and its unchanged source is parsed repeatedly
- **THEN** the DAG metadata and serialized definition remain absent and no new runs are scheduled

#### Scenario: Bundle changes and services restart
- **WHEN** a deleted DAG is parsed after a Git bundle refresh, new commit, bundle relocation, or processor restart
- **THEN** its deletion intent remains effective for the same final DAG ID

#### Scenario: Other DAGs share the source
- **WHEN** the same file or another branch supplies a different final DAG ID
- **THEN** deleting the target DAG does not prevent that other DAG from registering

### Requirement: Atomic and concurrency safe deletion

The system MUST serialize deletion and registration for the same DAG ID across processes and MUST commit deletion intent and metadata cleanup atomically.

#### Scenario: Parsing overlaps deletion
- **WHEN** parsing and persistent deletion overlap in either transaction order
- **THEN** a successful delete leaves neither active metadata nor serialized registration, including after pending parse results are processed

#### Scenario: Active execution or cleanup failure
- **WHEN** a running task prevents deletion or database cleanup fails
- **THEN** the request reports failure and does not commit a new deletion intent or partial cleanup

#### Scenario: Scheduling overlaps deletion
- **WHEN** scheduling or a trigger request overlaps deletion
- **THEN** deletion either rejects the conflict or succeeds without leaving newly runnable DAG runs for the deleted DAG

#### Scenario: Repeated delete and retention cleanup
- **WHEN** a persistently deleted DAG is deleted again or metadata retention cleanup runs
- **THEN** the repeated persistent delete is successful and the deletion intent is retained

### Requirement: Permanent deletion is irreversible

The system MUST NOT provide any API, UI action, CLI command, or administrative operation that restores a deleted DAG, clears its deletion marker, or permits reuse of its final DAG ID. The system MUST enforce deletion authorization even when DagModel is absent.

#### Scenario: Attempted restoration
- **WHEN** a user or administrator attempts to restore a permanently deleted DAG through a product interface
- **THEN** no supported restoration operation is available and deletion remains effective

#### Scenario: Source is removed and reintroduced
- **WHEN** a source defining the same final DAG ID is removed and later reintroduced or replaced
- **THEN** registration remains blocked and deleted execution history remains deleted

#### Scenario: Schema downgrade would discard deletion intent
- **WHEN** a downgrade would remove or invalidate existing permanent deletion markers
- **THEN** the downgrade is rejected rather than permitting deleted DAGs to reappear

#### Scenario: Unauthorized lifecycle request
- **WHEN** an unauthenticated or unauthorized caller requests deletion, including a repeated deletion
- **THEN** access is rejected and the lifecycle state remains unchanged

### Requirement: Consistent permanent deletion semantics

The system SHALL apply irreversible permanent deletion to all DAG deletion entry points including UI, API, and CLI, SHALL NOT expose an option to permit recreation, and SHALL document this change from metadata-only deletion.

#### Scenario: Legacy caller
- **WHEN** a client calls the existing delete API without additional parameters or uses the DAG deletion CLI
- **THEN** deletion permanently prevents recreation of the final DAG ID

#### Scenario: UI confirms deletion
- **WHEN** a user confirms deletion from the DAG list or detail page
- **THEN** the UI requests permanent deletion, explains that deletion is irreversible, source remains, history is removed, and the same DAG ID cannot be reused, and reports success only after server success

#### Scenario: Unknown DAG
- **WHEN** a client persistently deletes a nonexistent DAG with no lifecycle deletion record
- **THEN** the API returns 404 without creating a deletion marker

#### Scenario: Metadata-only operation on an existing marker
- **WHEN** a legacy cleanup operation targets a persistently deleted DAG
- **THEN** it does not remove the marker or restore registration eligibility
