#!/usr/bin/env bash
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


# Source this helper so the selected context is inherited by build and verify.
ensure_docker_environment() {
    local context endpoint contexts

    if ! command -v docker >/dev/null 2>&1; then
        echo "docker is required but was not found in PATH" >&2
        return 1
    fi
    if ! docker buildx version >/dev/null 2>&1; then
        echo "docker buildx is required but is not available" >&2
        return 1
    fi

    if docker info >/dev/null 2>&1; then
        echo "Docker connection is ready: ${DOCKER_CONTEXT:-${DOCKER_HOST:-$(docker context show)}}"
        return 0
    fi

    # Explicit destinations must not silently redirect a build to another daemon.
    if [[ -n "${DOCKER_CONTEXT:-}" || -n "${DOCKER_HOST:-}" ]]; then
        echo "The explicit DOCKER_CONTEXT or DOCKER_HOST is unavailable. Check it or unset it to enable local context discovery." >&2
        return 1
    fi

    echo "Current Docker connection is unavailable; checking local contexts."
    contexts="$(docker context ls --format '{{.Name}}')" || return 1
    while IFS= read -r context; do
        [[ -n "${context}" ]] || continue
        endpoint="$(docker context inspect "${context}" --format '{{.Endpoints.docker.Host}}')" || continue
        # Do not automatically send source files to a remote Docker daemon.
        [[ "${endpoint}" == unix://* ]] || continue
        if docker --context "${context}" info >/dev/null 2>&1; then
            export DOCKER_CONTEXT="${context}"
            echo "Using Docker context for this build: ${context} (${endpoint})"
            return 0
        fi
    done <<< "${contexts}"

    echo "No usable local Docker context found. Start Colima or Docker Desktop, or set DOCKER_CONTEXT to a running daemon." >&2
    return 1
}
