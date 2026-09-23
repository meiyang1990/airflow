#
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from __future__ import annotations

import httpx
import pytest

from airflow.api_fastapi.core_api.services.public.task_instance_ai_diagnosis import (
    AIDiagnosisLLMProxyError,
    _call_llm_proxy,
    _parse_model_content,
    extract_diagnosis_log_excerpt,
)

from tests_common.test_utils.config import conf_vars


def test_extract_diagnosis_log_excerpt_keeps_context_and_tail_without_duplicates():
    lines = [f"line {index}" for index in range(1, 501)]

    excerpt = extract_diagnosis_log_excerpt(
        lines, context_start_line=18, context_end_line=140, tail_lines=300
    )

    assert excerpt[:3] == ["line 18", "line 19", "line 20"]
    assert "line 141" not in excerpt
    assert excerpt[-3:] == ["line 498", "line 499", "line 500"]
    assert len(excerpt) == 423


def test_extract_diagnosis_log_excerpt_handles_short_logs():
    lines = [f"line {index}" for index in range(1, 10)]

    assert (
        extract_diagnosis_log_excerpt(lines, context_start_line=18, context_end_line=140, tail_lines=300)
        == lines
    )


def test_parse_model_content_from_json():
    summary, items = _parse_model_content(
        '{"summary": "Connection timeout", "items": [{"category": "root", "finding": "timeout"}]}'
    )

    assert summary == "Connection timeout"
    assert items == [
        {
            "category": "root",
            "finding": "timeout",
            "evidence": "",
            "suggestion": "",
            "confidence": "",
        }
    ]


def test_parse_model_content_falls_back_to_plain_text():
    summary, items = _parse_model_content("The task failed because the database timed out.")

    assert summary == "The task failed because the database timed out."
    assert items == []


def test_call_llm_proxy_sends_authorization_header(mocker):
    response = httpx.Response(
        200,
        json={"content": '{"summary": "timeout", "items": []}', "model": "test-model"},
    )
    post = mocker.patch("airflow.api_fastapi.core_api.services.public.task_instance_ai_diagnosis.httpx.post")
    post.return_value = response

    with conf_vars(
        {
            ("ai_diagnosis", "mcp_llm_proxy_url"): "http://mcp.example/llm/proxy",
            ("ai_diagnosis", "mcp_authorization_header"): "Basic token",
            ("ai_diagnosis", "request_timeout_seconds"): "12",
        }
    ):
        payload = _call_llm_proxy(messages=[{"role": "user", "content": "diagnose"}])

    assert payload == {"content": '{"summary": "timeout", "items": []}', "model": "test-model"}
    post.assert_called_once_with(
        "http://mcp.example/llm/proxy",
        json={
            "messages": [{"role": "user", "content": "diagnose"}],
            "parameters": {"temperature": 0.2},
        },
        headers={"Authorization": "Basic token", "Content-Type": "application/json"},
        timeout=12,
    )


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, text="Unauthorized"),
        httpx.Response(200, content=b"not-json"),
    ],
)
def test_call_llm_proxy_maps_bad_responses_to_diagnosis_error(mocker, response):
    post = mocker.patch("airflow.api_fastapi.core_api.services.public.task_instance_ai_diagnosis.httpx.post")
    post.return_value = response

    with pytest.raises(AIDiagnosisLLMProxyError):
        _call_llm_proxy(messages=[{"role": "user", "content": "diagnose"}])
