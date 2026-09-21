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

find_repo_root() {
    local current_dir="${SCRIPT_DIR}"

    while [[ "${current_dir}" != "/" ]]; do
        if [[ -x "${current_dir}/deploy/helm/build-airflow-source-image.sh" &&
            -d "${current_dir}/airflow-core" ]]; then
            echo "${current_dir}"
            return
        fi
        current_dir="$(dirname "${current_dir}")"
    done

    echo "Could not find Airflow repository root from ${SCRIPT_DIR}" >&2
    exit 1
}

REPO_ROOT="$(find_repo_root)"
UI_DIST_DIR="${REPO_ROOT}/airflow-core/src/airflow/ui/dist"
UI_DIR="${REPO_ROOT}/airflow-core/src/airflow/ui"
SIMPLE_AUTH_MANAGER_UI_DIR="${REPO_ROOT}/airflow-core/src/airflow/api_fastapi/auth/managers/simple/ui"
SIMPLE_AUTH_MANAGER_UI_DIST_DIR="${SIMPLE_AUTH_MANAGER_UI_DIR}/dist"
SOURCE_IMAGE_SCRIPT="${REPO_ROOT}/deploy/helm/build-airflow-source-image.sh"

cd "${REPO_ROOT}"

if [[ ! -x "${SOURCE_IMAGE_SCRIPT}" ]]; then
    echo "Build script is missing or not executable: ${SOURCE_IMAGE_SCRIPT}" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required but was not found in PATH" >&2
    exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
    echo "docker buildx is required but is not available" >&2
    exit 1
fi

if [[ "${ALLOW_CONCURRENT_BUILD:-false}" != "true" ]]; then
    current_pid="$$"
    existing_builds="$(
        ps -eo pid=,args= |
            awk -v current_pid="${current_pid}" -v repo="${REPO_ROOT}" '
                /docker buildx build/ && index($0, repo) && $1 != current_pid { print $1 }
            '
    )"
    if [[ -n "${existing_builds}" ]]; then
        echo "Another Airflow source image build appears to be running: ${existing_builds}" >&2
        echo "Set ALLOW_CONCURRENT_BUILD=true to override." >&2
        exit 1
    fi
fi

ensure_ui_dist() {
    local ui_dir="${1}"
    local dist_dir="${2}"
    local label="${3}"

    if [[ "${REUSE_FRONTEND_DIST:-false}" == "true" ]] &&
        [[ -d "${dist_dir}" ]] &&
        find "${dist_dir}" -type f \( -name "*.js" -o -name "*.css" -o -name "index.html" \) | grep -q .; then
        echo "Reusing existing ${label} dist because REUSE_FRONTEND_DIST=true: ${dist_dir}"
        return
    fi

    if ! command -v pnpm >/dev/null 2>&1; then
        echo "pnpm is required to build ${label} assets but was not found in PATH" >&2
        exit 1
    fi

    if [[ -d "${dist_dir}" ]]; then
        echo "Removing existing ${label} dist before rebuild: ${dist_dir}"
        rm -rf "${dist_dir}"
    fi

    echo "Building ${label} frontend assets in ${ui_dir}"
    (
        cd "${ui_dir}"
        pnpm install --frozen-lockfile --config.confirmModulesPurge=false
        pnpm run build
    )
}

ensure_ui_dist "${UI_DIR}" "${UI_DIST_DIR}" "Airflow UI"
ensure_ui_dist "${SIMPLE_AUTH_MANAGER_UI_DIR}" "${SIMPLE_AUTH_MANAGER_UI_DIST_DIR}" "Simple auth manager UI"

export AIRFLOW_IMAGE_TAG="${AIRFLOW_IMAGE_TAG:-3.2.1-source-$(date +%Y%m%d%H%M%S)}"
export PUSH_IMAGE="${PUSH_IMAGE:-true}"
export PLATFORM="${PLATFORM:-linux/amd64}"
export IMAGE_TAG_FILE="${IMAGE_TAG_FILE:-/tmp/airflow-source-image-tags.env}"

echo "Building Airflow source image with:"
echo "  AIRFLOW_IMAGE_TAG=${AIRFLOW_IMAGE_TAG}"
echo "  PUSH_IMAGE=${PUSH_IMAGE}"
echo "  PLATFORM=${PLATFORM}"
echo "  IMAGE_TAG_FILE=${IMAGE_TAG_FILE}"
echo

"${SOURCE_IMAGE_SCRIPT}"

if [[ "${VERIFY_IMAGE:-true}" == "true" ]]; then
    # shellcheck disable=SC1090
    source "${IMAGE_TAG_FILE}"

    echo
    echo "Verifying frontend assets in ${AIRFLOW_IMAGE}"
    docker run --rm --platform "${PLATFORM}" --entrypoint /bin/bash "${AIRFLOW_IMAGE}" \
        -lc '
            set -euo pipefail
            airflow_package_dir="$(python - <<'"'"'PY'"'"'
import airflow
from pathlib import Path

print(Path(airflow.__file__).parent)
PY
)"

            for dist in \
                "${airflow_package_dir}/ui/dist" \
                "${airflow_package_dir}/api_fastapi/auth/managers/simple/ui/dist"
            do
                if [[ ! -d "${dist}" ]]; then
                    echo "Missing frontend dist directory: ${dist}" >&2
                    exit 1
                fi
                find "${dist}" -type f \( -name "*.js" -o -name "*.css" -o -name "index.html" \) -print | sed -n "1,20p"
            done
        '
fi

echo
echo "Airflow source image build completed."
echo "Image variables:"
cat "${IMAGE_TAG_FILE}"
