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

## Defaults and limits

- Interactive page size: 1,000 structured entries.
- Maximum retained browser window: 5,000 structured entries.
- Server-side serialized page budget: 5 MiB; a single oversized entry is allowed so progress remains possible.
- Public API maximum requested page size: 5,000 entries.
- Full logs remain available through the authorized `download=true` attachment response.

## Observed production-log benchmark

Measured on 2026-10-09 inside the `airflow-api-server` pod against the shared-PVC file for
`dev_agibot_world_to_mcap / manual__2026-10-09T02:32:10.436770+00:00 / submit_ray_job / attempt 1`.

| Measurement | Result |
|---|---:|
| Complete file | 23,559,121 bytes; 57,549 lines |
| Latest 1,000 physical lines | 437,245 bytes |
| Payload reduction represented by the initial tail | 98.1% |
| Cached full-file sequential read, median of 5 | 4.50 ms |
| Cached `tail -n 1000`, median of 5 | 2.12 ms |

The timings isolate shared-volume file access and do not include structured parsing, JSON serialization,
network transfer, React formatting, or DOM creation. Those omitted costs are precisely where bounded API
responses, lazy formatting, and row virtualization provide the larger end-to-end improvement.

## Validation

- OpenAPI v2 generation and schema validation: passed; the UI client was regenerated from the resulting schema.
- Backend route and log-reader suites: 53 passed; the final focused large-log, attachment, and growing-file
  regression run passed 3/3.
- Frontend paging, virtualization, filter-scope, and direct-download tests: 23 passed.
- Frontend ESLint and TypeScript compilation: passed.
- Targeted Mypy for the four modified Python source modules: passed with no issues.
- Ruff formatting and checks for every modified Python file: passed.
- `git diff --check`: passed.
- `openspec validate improve-large-task-log-viewing --strict`: passed.

The repository-wide `prek run --files ...` also ran. Checks applicable to these files passed or made only
the expected formatting/license updates, while the aggregate command remained red because of existing branch
and environment issues outside this change: unrelated Ray dashboard Mypy failures, Python 3.10 importing the
Python 3.11-only `enum.StrEnum` in existing Ray code during the generic OpenAPI hook, an existing unused
Boring Cyborg pattern, and a missing `apache-airflow-ctl` project directory. The equivalent targeted checks
for this change are green as recorded above.
