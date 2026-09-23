CREATE TABLE task_instance_ai_diagnosis (
    id BIGSERIAL PRIMARY KEY,
    dag_id VARCHAR(250) NOT NULL,
    run_id VARCHAR(250) NOT NULL,
    task_id VARCHAR(250) NOT NULL,
    map_index INTEGER NOT NULL DEFAULT -1,
    try_number INTEGER NOT NULL,
    state VARCHAR(50),
    log_line_count INTEGER NOT NULL DEFAULT 0,
    log_excerpt_sha256 CHAR(64) NOT NULL,
    llm_request_id VARCHAR(128),
    provider VARCHAR(128),
    model VARCHAR(256),
    summary TEXT NOT NULL,
    diagnosis_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_response TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_task_instance_ai_diagnosis
        UNIQUE (dag_id, run_id, task_id, map_index, try_number)
);

CREATE INDEX idx_task_instance_ai_diagnosis_lookup
    ON task_instance_ai_diagnosis (dag_id, run_id, task_id, map_index, try_number);

CREATE INDEX idx_task_instance_ai_diagnosis_created_at
    ON task_instance_ai_diagnosis (created_at DESC);