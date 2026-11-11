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


set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/helm/docker-preflight.sh
source "${SCRIPT_DIR}/docker-preflight.sh"

# Stub Docker so these cases never build, push, or change the user's contexts.
docker() {
    case "$*" in
        "buildx version") [[ "${scenario}" != missing-buildx ]] ;;
        info) [[ "${scenario}" == current ]] ;;
        "context show") echo current ;;
        "context ls --format {{.Name}}") printf '%s\n' remote default colima desktop-linux ;;
        "context inspect remote --format {{.Endpoints.docker.Host}}") echo ssh://remote ;;
        "context inspect default --format {{.Endpoints.docker.Host}}") echo unix:///missing.sock ;;
        "context inspect colima --format {{.Endpoints.docker.Host}}") echo unix:///colima.sock ;;
        "context inspect desktop-linux --format {{.Endpoints.docker.Host}}") echo unix:///desktop.sock ;;
        "--context colima info") [[ "${scenario}" == fallback ]] ;;
        "--context desktop-linux info") [[ "${scenario}" == desktop ]] ;;
        "--context default info") return 1 ;;
        *) echo "Unexpected Docker command: $*" >&2; exit 99 ;;
    esac
}

for scenario in current fallback desktop unavailable explicit-context explicit-host missing-buildx; do
    (
        unset DOCKER_CONTEXT DOCKER_HOST
        case "${scenario}" in
            explicit-context) export DOCKER_CONTEXT=chosen ;;
            explicit-host) export DOCKER_HOST=unix:///chosen.sock ;;
        esac
        result=0
        ensure_docker_environment || result=$?
        case "${scenario}" in
            current) [[ "${result}" == 0 && -z "${DOCKER_CONTEXT:-}" ]] ;;
            fallback) [[ "${result}" == 0 && "${DOCKER_CONTEXT}" == colima ]] ;;
            desktop) [[ "${result}" == 0 && "${DOCKER_CONTEXT}" == desktop-linux ]] ;;
            explicit-context) [[ "${result}" == 1 && "${DOCKER_CONTEXT}" == chosen ]] ;;
            explicit-host) [[ "${result}" == 1 && "${DOCKER_HOST}" == unix:///chosen.sock ]] ;;
            *) [[ "${result}" == 1 ]] ;;
        esac
    )
    echo "PASS: ${scenario}"
done
