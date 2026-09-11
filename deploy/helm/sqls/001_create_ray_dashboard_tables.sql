--
-- Licensed to the Apache Software Foundation (ASF) under one
-- or more contributor license agreements.  See the NOTICE file
-- distributed with this work for additional information
-- regarding copyright ownership.  The ASF licenses this file
-- to you under the Apache License, Version 2.0 (the
-- "License"); you may not use this file except in compliance
-- with the License.  You may obtain a copy of the License at
--
--   http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied.  See the License for the
-- specific language governing permissions and limitations
-- under the License.

-- PostgreSQL DDL for Ray Dashboard data collected by Airflow task instances.
-- This mirrors Airflow migration 57c4c8d6f0ab.

CREATE TABLE IF NOT EXISTS ray_dashboard_task_instance (
    id UUID NOT NULL,
    dag_id VARCHAR(250) NOT NULL,
    run_id VARCHAR(250) NOT NULL,
    task_id VARCHAR(250) NOT NULL,
    map_index INTEGER DEFAULT -1 NOT NULL,
    try_number INTEGER NOT NULL,
    dashboard_url TEXT,
    ray_cluster_id VARCHAR(255),
    ray_cluster_name VARCHAR(255),
    ray_namespace VARCHAR(255),
    ray_job_id VARCHAR(255),
    ray_submission_id VARCHAR(255),
    status VARCHAR(100),
    collector_status VARCHAR(100),
    collector_error TEXT,
    collector_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ray_dashboard_task_instance_pkey PRIMARY KEY (id),
    CONSTRAINT ray_dashboard_ti_fkey
        FOREIGN KEY (dag_id, task_id, run_id, map_index)
        REFERENCES task_instance (dag_id, task_id, run_id, map_index)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT ray_dashboard_task_instance_attempt_uq
        UNIQUE (dag_id, run_id, task_id, map_index, try_number)
);

CREATE INDEX IF NOT EXISTS idx_ray_dashboard_ti_lookup
    ON ray_dashboard_task_instance (dag_id, run_id, task_id, map_index, try_number);

CREATE TABLE IF NOT EXISTS ray_dashboard_snapshot (
    id UUID NOT NULL,
    dashboard_id UUID NOT NULL,
    section VARCHAR(50) NOT NULL,
    source_status VARCHAR(100),
    source_error TEXT,
    payload JSONB,
    collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ray_dashboard_snapshot_pkey PRIMARY KEY (id),
    CONSTRAINT ray_dashboard_snapshot_dashboard_fkey
        FOREIGN KEY (dashboard_id)
        REFERENCES ray_dashboard_task_instance (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT ray_dashboard_snapshot_section_collected_uq
        UNIQUE (dashboard_id, section, collected_at)
);

CREATE INDEX IF NOT EXISTS idx_ray_dashboard_snapshot_section
    ON ray_dashboard_snapshot (dashboard_id, section, collected_at);

CREATE TABLE IF NOT EXISTS ray_dashboard_metric_sample (
    id UUID NOT NULL,
    dashboard_id UUID NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    metric_unit VARCHAR(50),
    labels JSONB,
    value DOUBLE PRECISION NOT NULL,
    sampled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ray_dashboard_metric_sample_pkey PRIMARY KEY (id),
    CONSTRAINT ray_dashboard_metric_dashboard_fkey
        FOREIGN KEY (dashboard_id)
        REFERENCES ray_dashboard_task_instance (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ray_dashboard_metric_lookup
    ON ray_dashboard_metric_sample (dashboard_id, metric_name, sampled_at);
