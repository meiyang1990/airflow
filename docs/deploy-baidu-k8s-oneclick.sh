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

usage() {
    cat <<'EOF'
Usage:
  docs/deploy-baidu-k8s-oneclick.sh <airflow-image>

Required:
  <airflow-image>  Full Airflow image, for example:
                   ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow:3.2.1-source-20260920183823

Optional environment variables:
  NAMESPACE                 Kubernetes namespace. Default: bigdata
  RELEASE_NAME              Helm release name. Default: airflow
  VALUES_FILE               Helm values file. Default: deploy/helm/baidu-k8s.yaml
  CHART_DIR                 Helm chart directory. Default: deploy/helm/airflow
  SSH_PRIVATE_KEY_PATH      If set, create/update airflow-ssh-secret from this private key file
  SSH_SECRET_NAME           DAG Git SSH secret name. Default: airflow-ssh-secret
  WAIT_TIMEOUT              kubectl rollout timeout. Default: 10m
  SKIP_DEPENDENCY_BUILD     Set true to skip helm dependency build. Default: false
  SKIP_PVC_APPLY            Set true to skip applying helper PVC manifests. Default: false
  SKIP_ROLLOUT_WAIT         Set true to skip rollout status checks. Default: false
EOF
}

find_repo_root() {
    local current_dir="${SCRIPT_DIR}"

    while [[ "${current_dir}" != "/" ]]; do
        if [[ -d "${current_dir}/deploy/helm/airflow" && -d "${current_dir}/airflow-core" ]]; then
            echo "${current_dir}"
            return
        fi
        current_dir="$(dirname "${current_dir}")"
    done

    echo "Could not find Airflow repository root from ${SCRIPT_DIR}" >&2
    exit 1
}

require_command() {
    local command_name="${1}"

    if ! command -v "${command_name}" >/dev/null 2>&1; then
        echo "${command_name} is required but was not found in PATH" >&2
        exit 1
    fi
}

apply_manifest_in_namespace() {
    local manifest="${1}"

    if [[ "${NAMESPACE}" == "bigdata" ]]; then
        kubectl -n "${NAMESPACE}" apply -f "${manifest}"
        return
    fi

    sed "s/namespace: bigdata/namespace: ${NAMESPACE}/" "${manifest}" | kubectl apply -f -
}

parse_airflow_image() {
    local image="${1}"
    local last_segment="${image##*/}"

    if [[ "${image}" == *"@sha256:"* ]]; then
        echo "Image digests are not supported by this script. Please pass an image with a tag." >&2
        exit 1
    fi

    if [[ "${last_segment}" != *":"* ]]; then
        echo "Airflow image must include a tag: ${image}" >&2
        exit 1
    fi

    AIRFLOW_IMAGE_REPOSITORY="${image%:*}"
    AIRFLOW_IMAGE_TAG="${image##*:}"

    if [[ -z "${AIRFLOW_IMAGE_REPOSITORY}" || -z "${AIRFLOW_IMAGE_TAG}" ]]; then
        echo "Invalid Airflow image: ${image}" >&2
        exit 1
    fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

if [[ "$#" -ne 1 ]]; then
    usage >&2
    exit 1
fi

require_command kubectl
require_command helm

AIRFLOW_IMAGE="${1}"
parse_airflow_image "${AIRFLOW_IMAGE}"

REPO_ROOT="$(find_repo_root)"
NAMESPACE="${NAMESPACE:-bigdata}"
RELEASE_NAME="${RELEASE_NAME:-airflow}"
VALUES_FILE="${VALUES_FILE:-${REPO_ROOT}/deploy/helm/baidu-k8s.yaml}"
CHART_DIR="${CHART_DIR:-${REPO_ROOT}/deploy/helm/airflow}"
SSH_SECRET_NAME="${SSH_SECRET_NAME:-airflow-ssh-secret}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-10m}"
SKIP_DEPENDENCY_BUILD="${SKIP_DEPENDENCY_BUILD:-false}"
SKIP_PVC_APPLY="${SKIP_PVC_APPLY:-false}"
SKIP_ROLLOUT_WAIT="${SKIP_ROLLOUT_WAIT:-false}"

cd "${REPO_ROOT}"

if [[ ! -f "${VALUES_FILE}" ]]; then
    echo "Values file does not exist: ${VALUES_FILE}" >&2
    exit 1
fi

if [[ ! -d "${CHART_DIR}" ]]; then
    echo "Chart directory does not exist: ${CHART_DIR}" >&2
    exit 1
fi

echo "Deploying Airflow to Baidu Cloud Kubernetes"
echo "  namespace:  ${NAMESPACE}"
echo "  release:    ${RELEASE_NAME}"
echo "  image:      ${AIRFLOW_IMAGE}"
echo "  repository: ${AIRFLOW_IMAGE_REPOSITORY}"
echo "  tag:        ${AIRFLOW_IMAGE_TAG}"
echo "  values:     ${VALUES_FILE}"
echo "  chart:      ${CHART_DIR}"
echo

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

if [[ -n "${SSH_PRIVATE_KEY_PATH:-}" ]]; then
    if [[ ! -f "${SSH_PRIVATE_KEY_PATH}" ]]; then
        echo "SSH_PRIVATE_KEY_PATH does not exist: ${SSH_PRIVATE_KEY_PATH}" >&2
        exit 1
    fi

    kubectl -n "${NAMESPACE}" create secret generic "${SSH_SECRET_NAME}" \
        --from-file=gitSshKey="${SSH_PRIVATE_KEY_PATH}" \
        --dry-run=client -o yaml | kubectl apply -f -
else
    if ! kubectl -n "${NAMESPACE}" get secret "${SSH_SECRET_NAME}" >/dev/null 2>&1; then
        echo "Secret ${SSH_SECRET_NAME} does not exist in namespace ${NAMESPACE}." >&2
        echo "Set SSH_PRIVATE_KEY_PATH=/path/to/private_key to create it automatically." >&2
        exit 1
    fi
fi

if [[ "${SKIP_PVC_APPLY}" != "true" ]]; then
    apply_manifest_in_namespace "${REPO_ROOT}/deploy/helm/airflow-openmetadata-configs-pvc.yaml"
fi

if [[ "${SKIP_DEPENDENCY_BUILD}" != "true" ]]; then
    helm dependency build "${CHART_DIR}"
fi

helm upgrade --install "${RELEASE_NAME}" "${CHART_DIR}" \
    -n "${NAMESPACE}" \
    -f "${VALUES_FILE}" \
    --set-string "defaultAirflowRepository=${AIRFLOW_IMAGE_REPOSITORY}" \
    --set-string "defaultAirflowTag=${AIRFLOW_IMAGE_TAG}" \
    --set-string "images.airflow.repository=${AIRFLOW_IMAGE_REPOSITORY}" \
    --set-string "images.airflow.tag=${AIRFLOW_IMAGE_TAG}"

if [[ "${SKIP_ROLLOUT_WAIT}" != "true" ]]; then
    for deployment in \
        "${RELEASE_NAME}-api-server" \
        "${RELEASE_NAME}-scheduler" \
        "${RELEASE_NAME}-dag-processor" \
        "${RELEASE_NAME}-triggerer"
    do
        if kubectl -n "${NAMESPACE}" get deployment "${deployment}" >/dev/null 2>&1; then
            kubectl -n "${NAMESPACE}" rollout status "deployment/${deployment}" --timeout="${WAIT_TIMEOUT}"
        fi
    done
fi

echo
helm -n "${NAMESPACE}" status "${RELEASE_NAME}"
echo
kubectl -n "${NAMESPACE}" get pods
echo
kubectl -n "${NAMESPACE}" get svc
