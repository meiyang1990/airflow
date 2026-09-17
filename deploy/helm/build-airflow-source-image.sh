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
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

AIRFLOW_IMAGE_REPO="${AIRFLOW_IMAGE_REPO:-ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow}"
AIRFLOW_IMAGE_TAG="${AIRFLOW_IMAGE_TAG:-3.2.1-source-$(date +%Y%m%d%H%M)}"
AIRFLOW_VERSION="${AIRFLOW_VERSION:-3.2.1}"
AIRFLOW_PYTHON_VERSION="${AIRFLOW_PYTHON_VERSION:-3.13.13}"
PLATFORM="${PLATFORM:-linux/amd64}"
PUSH_IMAGE="${PUSH_IMAGE:-true}"
USE_CHINA_APT_MIRROR="${USE_CHINA_APT_MIRROR:-true}"
PYPI_INDEX_URL="${PYPI_INDEX_URL:-https://mirrors.aliyun.com/pypi/simple}"
PYPI_TRUSTED_HOST="${PYPI_TRUSTED_HOST:-mirrors.aliyun.com}"
UV_INDEX_URL="${UV_INDEX_URL:-${PYPI_INDEX_URL}}"
# Aliyun's PyPI mirror omits upload-time metadata for some files; frozen uv.lock keeps versions pinned.
DISABLE_UV_EXCLUDE_NEWER_FOR_MIRROR="${DISABLE_UV_EXCLUDE_NEWER_FOR_MIRROR:-true}"
IMAGE_TAG_FILE="${IMAGE_TAG_FILE:-/tmp/airflow-source-image-tags.env}"

AIRFLOW_IMAGE="${AIRFLOW_IMAGE_REPO}:${AIRFLOW_IMAGE_TAG}"
DOCKER_CONTEXT_FILES_DIR="${REPO_ROOT}/docker-context-files"
PIP_CONF_PATH="${DOCKER_CONTEXT_FILES_DIR}/pip.conf"
PIP_CONF_BACKUP=""
PIP_CONF_CREATED="false"

if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required but was not found in PATH" >&2
    exit 1
fi

if [[ "${USE_CHINA_APT_MIRROR}" == "true" ]]; then
    APT_MIRROR_CMD="sed -i 's|http://deb.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g; s|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g' /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true"
else
    APT_MIRROR_CMD=""
fi

cleanup_generated_pip_conf() {
    if [[ "${PIP_CONF_CREATED}" == "true" ]]; then
        rm -f "${PIP_CONF_PATH}"
    elif [[ -n "${PIP_CONF_BACKUP}" && -f "${PIP_CONF_BACKUP}" ]]; then
        mv "${PIP_CONF_BACKUP}" "${PIP_CONF_PATH}"
    fi
}

prepare_pip_conf() {
    mkdir -p "${DOCKER_CONTEXT_FILES_DIR}"
    if [[ -f "${PIP_CONF_PATH}" ]]; then
        PIP_CONF_BACKUP="$(mktemp "${PIP_CONF_PATH}.backup.XXXXXX")"
        cp "${PIP_CONF_PATH}" "${PIP_CONF_BACKUP}"
    else
        PIP_CONF_CREATED="true"
    fi

    cat >"${PIP_CONF_PATH}" <<EOF
[global]
index-url = ${PYPI_INDEX_URL}
trusted-host = ${PYPI_TRUSTED_HOST}
disable-pip-version-check = true
EOF
}

trap cleanup_generated_pip_conf EXIT
prepare_pip_conf

cat >"${IMAGE_TAG_FILE}" <<EOF
AIRFLOW_IMAGE_REPO=${AIRFLOW_IMAGE_REPO}
AIRFLOW_IMAGE_TAG=${AIRFLOW_IMAGE_TAG}
AIRFLOW_IMAGE=${AIRFLOW_IMAGE}
PYPI_INDEX_URL=${PYPI_INDEX_URL}
UV_INDEX_URL=${UV_INDEX_URL}
DISABLE_UV_EXCLUDE_NEWER_FOR_MIRROR=${DISABLE_UV_EXCLUDE_NEWER_FOR_MIRROR}
EOF

echo "Building Airflow image from source"
echo "  repo:      ${AIRFLOW_IMAGE_REPO}"
echo "  tag:       ${AIRFLOW_IMAGE_TAG}"
echo "  image:     ${AIRFLOW_IMAGE}"
echo "  platform:  ${PLATFORM}"
echo "  push:      ${PUSH_IMAGE}"
echo "  pypi:      ${PYPI_INDEX_URL}"
echo "  uv index:  ${UV_INDEX_URL}"
echo "  uv cutoff: relax exclude-newer for mirror metadata = ${DISABLE_UV_EXCLUDE_NEWER_FOR_MIRROR}"
echo "  tag file:  ${IMAGE_TAG_FILE}"
echo

build_args=(
    buildx build
    --platform "${PLATFORM}"
    --build-arg AIRFLOW_INSTALLATION_METHOD=.
    --build-arg AIRFLOW_SOURCES_FROM=.
    --build-arg AIRFLOW_SOURCES_TO=/opt/airflow
    --build-arg "AIRFLOW_VERSION=${AIRFLOW_VERSION}"
    --build-arg "AIRFLOW_PYTHON_VERSION=${AIRFLOW_PYTHON_VERSION}"
    --build-arg "PIP_INDEX_URL=${PYPI_INDEX_URL}"
    --build-arg "PIP_TRUSTED_HOST=${PYPI_TRUSTED_HOST}"
    --build-arg "UV_INDEX_URL=${UV_INDEX_URL}"
    --build-arg "ADDITIONAL_PIP_INSTALL_FLAGS=--index-url ${PYPI_INDEX_URL} --trusted-host ${PYPI_TRUSTED_HOST}"
    --build-arg "DISABLE_UV_EXCLUDE_NEWER_FOR_MIRROR=${DISABLE_UV_EXCLUDE_NEWER_FOR_MIRROR}"
    --build-arg PYTHON_LTO=false
    --build-arg "DEV_APT_COMMAND=${APT_MIRROR_CMD}"
    --build-arg "RUNTIME_APT_COMMAND=${APT_MIRROR_CMD}"
    -t "${AIRFLOW_IMAGE}"
)

if [[ "${PUSH_IMAGE}" == "true" ]]; then
    build_args+=(--push)
else
    build_args+=(--load)
fi

build_args+=("${REPO_ROOT}")

docker "${build_args[@]}"

echo
echo "Airflow image is ready: ${AIRFLOW_IMAGE}"
echo "Image tag variables were written to ${IMAGE_TAG_FILE}"
