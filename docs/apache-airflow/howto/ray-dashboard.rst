.. Licensed to the Apache Software Foundation (ASF) under one
   or more contributor license agreements.  See the NOTICE file
   distributed with this work for additional information
   regarding copyright ownership.  The ASF licenses this file
   to you under the Apache License, Version 2.0 (the
   "License"); you may not use this file except in compliance
   with the License.  You may obtain a copy of the License at

..   http://www.apache.org/licenses/LICENSE-2.0

.. Unless required by applicable law or agreed to in writing,
   software distributed under the License is distributed on an
   "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
   KIND, either express or implied.  See the License for the
   specific language governing permissions and limitations
   under the License.

Ray Dashboard task instance tab
===============================

The Ray Dashboard task instance tab stores Ray dashboard data in the Airflow metadata database and
renders it on the task instance page. The feature does not require Prometheus or Grafana. Instead,
Ray task code, a Ray operator, or a task-owned collector reads Ray-owned sources directly and
publishes bounded data through the Execution API.

Collector contract
------------------

A collector must run with the task instance execution token and call the task-instance-scoped
Execution API endpoints for the current task attempt:

* ``PUT /execution/task-instances/{task_instance_id}/ray-dashboard`` publishes dashboard metadata.
* ``POST /execution/task-instances/{task_instance_id}/ray-dashboard/snapshots`` publishes one
  bounded dashboard section snapshot.
* ``POST /execution/task-instances/{task_instance_id}/ray-dashboard/metrics`` publishes one bounded
  batch of directly sampled Ray metric values.

The token scope ensures the collector can only write data for its own task instance. Workers and
tasks must not write directly to the metadata database.

Recommended Ray sources
-----------------------

Collectors should prefer stable Ray APIs when available:

* Ray Jobs API for job and submission metadata.
* Ray State API for jobs, cluster, nodes, actors, tasks, placement groups, objects, Serve, and
  Ray Data state.
* Ray Dashboard API or internal endpoints for data not exposed by Ray State API in the deployed
  Ray version.
* Ray log and event endpoints for bounded log/event snapshots.
* Ray metrics endpoints for directly sampled task-level metric values.

Supported Airflow sections are:

* ``overview``
* ``jobs``
* ``cluster``
* ``actors``
* ``tasks``
* ``placement_groups``
* ``objects``
* ``metrics``
* ``logs``
* ``events``
* ``serve``
* ``ray_data``

Sampling and retention
----------------------

Metric samples are stored in MySQL through the Airflow metadata database, so collectors should keep
sampling bounded. Recommended defaults are:

* Sample every 15 to 60 seconds while the Ray job is running.
* Publish only a metric allowlist needed by the Airflow task instance tab.
* Keep each metric batch below the configured API limit.
* Publish a final snapshot and final metric batch before the task exits.
* Retain detailed samples only for the operational period required by the deployment.

When a Ray source is unavailable, collectors should still publish metadata and set the section
``source_status`` or metadata ``collector_status`` with a useful error summary. The Airflow UI will
show the section as unavailable rather than requiring Prometheus or Grafana.
