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

usage() {
    cat <<'EOF'
Usage:
  docs/create-airflow-ssh-secret.sh <private-key-path>

Creates or updates the Kubernetes Secret used by Airflow to clone DAG bundles over SSH.

Optional environment variables:
  NAMESPACE        Kubernetes namespace. Default: bigdata
  SSH_SECRET_NAME  Secret name. Default: airflow-ssh-secret

Example:
  docs/create-airflow-ssh-secret.sh ~/.ssh/airflow_dags_deploy_baidu
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

if [[ "$#" -ne 1 ]]; then
    usage >&2
    exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
    echo "kubectl is required but was not found in PATH" >&2
    exit 1
fi

private_key_path="${1}"
namespace="${NAMESPACE:-bigdata}"
ssh_secret_name="${SSH_SECRET_NAME:-airflow-ssh-secret}"

if [[ ! -f "${private_key_path}" ]]; then
    echo "Private key file does not exist: ${private_key_path}" >&2
    exit 1
fi

kubectl create namespace "${namespace}" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "${namespace}" create secret generic "${ssh_secret_name}" \
    --from-file=gitSshKey="${private_key_path}" \
    --dry-run=client -o yaml | kubectl apply -f -

echo "Secret ${ssh_secret_name} is ready in namespace ${namespace}."
