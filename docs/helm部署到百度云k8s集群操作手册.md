<!--
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
 -->

# 百度云 Kubernetes 部署 Airflow

本文档说明如何使用 `deploy/helm/baidu-k8s.yaml` 在百度云 Kubernetes 集群中部署 Airflow。

该 values 文件基于仓库内 Helm Chart `deploy/helm/airflow`，主要部署 Airflow 3.2.1、KubernetesExecutor、外部 PostgreSQL、CFS 共享存储，以及 OpenMetadata 相关 DAG 配置目录。

## 部署内容

`deploy/helm/baidu-k8s.yaml` 中的关键配置如下：

| 配置项 | 当前值 |
| --- | --- |
| Airflow 版本 | `3.2.1` |
| Airflow 镜像 | `ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow:3.2.1-source-20260919123407` |
| Executor | `KubernetesExecutor` |
| PostgreSQL | 使用外部数据库，Chart 内置 PostgreSQL 关闭 |
| 数据库地址 | `192.168.48.2:5432/airflow_meta` |
| API Server Service | `LoadBalancer` |
| 公网 EIP | `120.48.176.248` |
| DAG 存储 | CFS PVC，`storageClassName: cfs-shared-sc`，`ReadWriteMany`，`1Gi` |
| 日志存储 | CFS PVC，`storageClassName: cfs-shared-sc`，`100Gi` |
| StatsD | 启用 |
| Redis / PgBouncer / Flower | 关闭 |
| DAG 来源 | Airflow 3 GitDagBundle，跟踪 `main`、`dev`、`test` 分支 |

## 前置条件

部署前确认以下资源可用：

1. 已连接到目标百度云 Kubernetes 集群，并且 `kubectl` 当前上下文指向该集群。
2. 已安装 Helm 3。
3. 集群可以拉取以下镜像仓库中的镜像：
   - `ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow`
   - `ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/statsd-exporter`
   - `ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/git-sync`
4. 集群中存在名为 `cfs-shared-sc` 的 StorageClass，并支持 `ReadWriteMany`。
5. 外部 PostgreSQL 已创建数据库和用户，并允许 Kubernetes 节点或 Pod 网络访问：
   - 数据库：`airflow_meta`
   - 用户：`airflow_user`
   - 地址：`192.168.48.2:5432`
6. 百度云负载均衡 EIP `120.48.176.248` 可绑定到当前集群 Service。
7. DAG Git 仓库 SSH 私钥可用，用于访问 `git@github.com:inFpZero/airflow_dags.git`。

## 安全配置检查

`deploy/helm/baidu-k8s.yaml` 中当前包含数据库密码、API Secret 和默认管理员密码。生产部署前建议改为使用 Kubernetes Secret 或单独的私有 values 文件，避免把敏感信息提交到仓库。

至少需要检查并替换以下配置：

| 配置项 | 说明 |
| --- | --- |
| `data.metadataConnection.pass` | Airflow metadata database 密码 |
| `apiSecretKey` | Airflow API Server Flask secret key |
| `jwtSecret` 或 `jwtSecretName` | JWT 签名密钥。当前为空时 Helm 可能生成动态值，升级时可能影响任务 |
| `createUserJob.defaultUser.password` | 初始管理员密码 |

如需使用已有 Secret 管理数据库连接，可创建包含 `connection` key 的 Secret，然后在 values 中设置 `data.metadataSecretName`。

## 创建命名空间

以下命令使用 `bigdata` 命名空间：

```bash
kubectl create namespace bigdata
```

如果命名空间已存在，可以忽略 `AlreadyExists` 错误。

## 创建 DAG 仓库 SSH Secret

values 文件会把名为 `airflow-ssh-secret` 的 Secret 挂载到所有 Airflow 容器：

```yaml
volumes:
  - name: git-ssh-key
    secret:
      secretName: airflow-ssh-secret
      defaultMode: 0400
volumeMounts:
  - name: git-ssh-key
    mountPath: /etc/git-secret/ssh
    subPath: gitSshKey
    readOnly: true
```

创建 Secret：

```bash
kubectl -n bigdata create secret generic airflow-ssh-secret \
  --from-file=gitSshKey=/path/to/private_key
```

确认 Secret 存在：

```bash
kubectl -n bigdata get secret airflow-ssh-secret
```

## 准备共享存储

values 文件会让 Helm Chart 创建 DAG 和日志 PVC：

```yaml
dags:
  persistence:
    enabled: true
    size: 1Gi
    storageClassName: cfs-shared-sc
    accessMode: ReadWriteMany

logs:
  persistence:
    enabled: true
    size: 100Gi
    storageClassName: cfs-shared-sc
```

另外，多个组件会挂载名为 `airflow-openmetadata-configs` 的 PVC 到 `/opt/airflow/dag_generated_configs`，该 PVC 不在 `baidu-k8s.yaml` 中创建，需要提前应用仓库内清单：

```bash
kubectl -n bigdata apply -f deploy/helm/airflow-openmetadata-configs-pvc.yaml
```

如果需要提前创建日志 PVC，也可以应用仓库内清单：

```bash
kubectl -n bigdata apply -f deploy/helm/airflow-logs-pvc.yaml
```

创建后检查 PVC 状态：

```bash
kubectl -n bigdata get pvc
```

所有相关 PVC 都应为 `Bound`。

## 检查数据库连通性

在部署前确认集群内可以访问外部 PostgreSQL：

```bash
kubectl -n bigdata run pg-check --rm -it --restart=Never \
  --image=postgres:16 \
  --env PGPASSWORD='<database-password>' \
  -- psql -h 192.168.48.2 -p 5432 -U airflow_user -d airflow_meta -c 'select 1;'
```

如果连接失败，先检查数据库白名单、安全组、VPC 路由、用户名密码和数据库是否已创建。

## 部署 Airflow

从仓库根目录执行：

一键部署方式：

```bash
docs/deploy-baidu-k8s-oneclick.sh \
  ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow:3.2.1-source-20260920183823
```

脚本唯一必填参数是 Airflow 完整镜像，脚本会自动从镜像中拆分出 Helm values 需要的 repository 和 tag，并执行以下操作：

- 创建 `bigdata` 命名空间。
- 检查或创建 `airflow-ssh-secret`。如需自动创建，传入 `SSH_PRIVATE_KEY_PATH=/path/to/private_key`。
- 应用 `deploy/helm/airflow-openmetadata-configs-pvc.yaml`。
- 执行 `helm dependency build deploy/helm/airflow`。
- 执行 `helm upgrade --install airflow deploy/helm/airflow -n bigdata -f deploy/helm/baidu-k8s.yaml`，并用传入镜像覆盖 Airflow repository 和 tag。
- 等待 API Server、Scheduler、Dag Processor、Triggerer 完成滚动。

常用可选参数通过环境变量传入：

```bash
NAMESPACE=bigdata \
RELEASE_NAME=airflow \
SSH_PRIVATE_KEY_PATH=/path/to/private_key \
docs/deploy-baidu-k8s-oneclick.sh \
  ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow:3.2.1-source-20260920183823
```

如果需要手动执行，可以使用以下步骤。

```bash
helm dependency build deploy/helm/airflow
```

安装或升级 release：

```bash
helm upgrade --install airflow deploy/helm/airflow \
  -n bigdata \
  -f deploy/helm/baidu-k8s.yaml
```

等待部署完成：

```bash
kubectl -n bigdata get pods -w
```

关键 Pod 包括：

- `airflow-api-server`
- `airflow-scheduler`
- `airflow-dag-processor`
- `airflow-statsd`
- `airflow-run-airflow-migrations`
- `airflow-create-user`

## 发布 Ray Dashboard 上报链路更新

Ray Dashboard task tab 的本次更新分为两部分：

1. `airflow` 镜像内的 Airflow / Task SDK 代码：新增 `airflow.sdk.execution_time.ray_dashboard` helper，并由 task supervisor 代为调用 Execution API。
2. `airflow_dags` 仓库内的 DAG 代码：`utils/ray_dashboard_reporter.py` 改为调用 Task SDK helper，不再自行获取 Execution API token。

必须先发布 Airflow 镜像，再发布 DAG 仓库代码。否则 DAG 代码会找不到新的 Task SDK helper，Ray Dashboard 上报会被跳过。

### 1. 构建并推送 Airflow 镜像

在 `airflow` 仓库完成代码提交后，为本次更新生成一个新的镜像 tag。建议不要复用线上已有 tag，避免节点镜像缓存造成版本不一致。

仓库内提供了源码镜像构建脚本：

```bash
export AIRFLOW_IMAGE_REPO=ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow
export AIRFLOW_IMAGE_TAG=3.2.1-ray-dashboard-$(date +%Y%m%d%H%M)

deploy/helm/build-airflow-source-image.sh
```

脚本会基于当前仓库源码执行 `docker buildx build --platform linux/amd64`，并默认推送到百度云镜像仓库。构建完成后会把镜像变量写入 `/tmp/airflow-source-image-tags.env`：

```bash
source /tmp/airflow-source-image-tags.env
echo "${AIRFLOW_IMAGE}"
```

可通过环境变量覆盖默认行为：

```bash
AIRFLOW_IMAGE_TAG=3.2.1-ray-dashboard-20260917162118 \
AIRFLOW_PYTHON_VERSION=3.13.13 \
PLATFORM=linux/amd64 \
PUSH_IMAGE=true \
deploy/helm/build-airflow-source-image.sh
```

如果只想本地构建不推送，可设置 `PUSH_IMAGE=false`。如果使用其他内部构建流水线，以流水线产出的镜像 tag 为准。

### 2. 更新 Helm values 中的镜像 tag

修改 `deploy/helm/baidu-k8s.yaml`：

```yaml
images:
  airflow:
    repository: ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow
    tag: "<new-airflow-image-tag>"
```

`KubernetesExecutor` 的 worker 镜像由同一个 values 配置传递：

```yaml
config:
  kubernetes_executor:
    worker_container_repository: '{{ .Values.images.airflow.repository | default .Values.defaultAirflowRepository }}'
    worker_container_tag: '{{ .Values.images.airflow.tag | default .Values.defaultAirflowTag }}'
```

因此 API Server、Scheduler、Dag Processor、Triggerer、迁移 Job 和任务 Pod 都会使用同一版 Airflow / Task SDK 代码。

### 3. 执行 Helm 升级

```bash
helm upgrade airflow deploy/helm/airflow \
  -n bigdata \
  -f deploy/helm/baidu-k8s.yaml
```

等待核心组件滚动完成：

```bash
kubectl -n bigdata rollout status deploy/airflow-api-server
kubectl -n bigdata rollout status deploy/airflow-scheduler
kubectl -n bigdata rollout status deploy/airflow-dag-processor
kubectl -n bigdata rollout status deploy/airflow-triggerer
```

确认新镜像已生效：

```bash
kubectl -n bigdata get pods \
  -l component=scheduler \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'
```

验证 Task SDK helper 已存在：

```bash
kubectl -n bigdata exec deploy/airflow-scheduler -- \
  python -c "from airflow.sdk.execution_time.ray_dashboard import publish_metadata; print(publish_metadata.__name__)"
```

输出应为：

```text
publish_metadata
```

### 4. 发布 airflow_dags 仓库代码

在 `/Users/storm/Documents/code/zerith/airflow_dags` 仓库提交并推送 DAG 代码：

```bash
git status --short
git add utils/ray_dashboard_reporter.py tests/test_base_pipeline_dag.py
git commit -m "Use Task SDK helper for Ray Dashboard reporting"
git push origin <branch>
```

`baidu-k8s.yaml` 中 Dag Processor 使用 GitDagBundle 跟踪 `main`、`dev`、`test` 分支，`refresh_interval` 为 60 秒。推送到对应分支后，Dag Processor 会自动刷新：

```bash
kubectl -n bigdata logs deploy/airflow-dag-processor --tail=200
```

如果需要立即触发 Dag Processor 重新加载，可重启 Dag Processor：

```bash
kubectl -n bigdata rollout restart deploy/airflow-dag-processor
kubectl -n bigdata rollout status deploy/airflow-dag-processor
```

### 5. 验证 Ray Dashboard 上报

触发一个 RayJob DAG 后查看任务日志：

```bash
kubectl -n bigdata logs <task-pod-name> --tail=200
```

不应再出现以下旧日志：

```text
[ray_dashboard] 跳过上报：无法获取 Execution API token
```

成功时应看到类似日志：

```text
[ray_dashboard] 已上报 Ray Dashboard 概览数据: rayjob=..., namespace=..., status=..., ray_cluster=...
```

然后在 Airflow UI 打开对应 Task Instance 的 Ray Dashboard tab，确认 overview section 有 RayJob 状态数据。

## 验证部署

查看 Helm release：

```bash
helm -n bigdata status airflow
```

查看 Pod 状态：

```bash
kubectl -n bigdata get pods
```

查看 Service 和 EIP：

```bash
kubectl -n bigdata get svc
```

API Server Service 应为 `LoadBalancer`，并绑定 `120.48.176.248`。

查看数据库迁移 Job：

```bash
kubectl -n bigdata get jobs
kubectl -n bigdata logs job/airflow-run-airflow-migrations
```

查看初始用户创建 Job：

```bash
kubectl -n bigdata logs job/airflow-create-user
```

访问 Airflow：

```text
http://120.48.176.248:8080
```

默认管理员账号来自 `createUserJob.defaultUser`：

```text
用户名：openmetadata
密码：omd12376#5
```

生产环境部署后应立即修改默认密码。

## DAG 配置

当前 values 使用 Airflow 3 的 GitDagBundle，不启用 git-sync sidecar：

```yaml
dags:
  gitSync:
    enabled: false

dagProcessor:
  dagBundleConfigList:
    - name: dag_main
      classpath: airflow.providers.git.bundles.git.GitDagBundle
      kwargs:
        git_conn_id: airflow_dags_repo
        subdir: dags
        tracking_ref: main
        refresh_interval: 60
```

同一个 Git 仓库会跟踪 `main`、`dev`、`test` 三个分支。Git 连接通过环境变量注入：

```yaml
extraEnv: |
  - name: AIRFLOW_CONN_AIRFLOW_DAGS_REPO
    value: '{"conn_type": "git", "host": "git@github.com:inFpZero/airflow_dags.git", "login": "git", "extra": {"key_file": "/etc/git-secret/ssh"}}'
```

如果 DAG 没有出现，优先检查：

```bash
kubectl -n bigdata logs deploy/airflow-dag-processor
kubectl -n bigdata exec deploy/airflow-dag-processor -- ls -la /etc/git-secret/ssh
```

## OpenMetadata 配置目录

Scheduler、API Server、Triggerer 和 Dag Processor 会挂载 `airflow-openmetadata-configs` PVC 到：

```text
/opt/airflow/dag_generated_configs
```

确认挂载：

```bash
kubectl -n bigdata exec deploy/airflow-dag-processor -- df -h /opt/airflow/dag_generated_configs
kubectl -n bigdata exec deploy/airflow-dag-processor -- ls -la /opt/airflow/dag_generated_configs
```

## 常见操作

升级配置：

```bash
helm upgrade airflow deploy/helm/airflow \
  -n bigdata \
  -f deploy/helm/baidu-k8s.yaml
```

查看渲染后的 Kubernetes 清单：

```bash
helm template airflow deploy/helm/airflow \
  -n bigdata \
  -f deploy/helm/baidu-k8s.yaml > /tmp/airflow-rendered.yaml
```

回滚到上一版：

```bash
helm -n bigdata history airflow
helm -n bigdata rollback airflow <REVISION>
```

卸载：

```bash
helm -n bigdata uninstall airflow
```

注意：卸载 Helm release 不一定会删除已有 PV 数据。需要清理数据时，再按实际情况删除 PVC。

## 排错

### Pod 一直 Pending

检查 PVC、节点资源和事件：

```bash
kubectl -n bigdata get pvc
kubectl -n bigdata describe pod <pod-name>
```

重点确认 `cfs-shared-sc` 存在，PVC 已 `Bound`，节点 CPU 和内存资源充足。

### 数据库迁移失败

查看迁移 Job 日志：

```bash
kubectl -n bigdata logs job/airflow-run-airflow-migrations
```

常见原因包括数据库地址不可达、账号密码错误、数据库不存在、PostgreSQL 权限不足。

### API Server 无法访问

检查 Service 是否拿到 EIP：

```bash
kubectl -n bigdata get svc airflow-api-server
kubectl -n bigdata describe svc airflow-api-server
```

如果没有绑定 `120.48.176.248`，检查百度云 CCE/CCE LoadBalancer 注解、EIP 是否可用，以及集群是否有创建公网负载均衡的权限。

### DAG 拉取失败

查看 Dag Processor 日志：

```bash
kubectl -n bigdata logs deploy/airflow-dag-processor
```

重点检查：

- `airflow-ssh-secret` 是否存在。
- Secret 中的 key 是否名为 `gitSshKey`。
- GitHub deploy key 是否有仓库读取权限。
- 容器内是否能访问 GitHub SSH 地址。

### 任务 Pod 创建失败

当前使用 `KubernetesExecutor`，需要 Scheduler ServiceAccount 有创建 Pod 的权限。检查 RBAC 和 Scheduler 日志：

```bash
kubectl -n bigdata logs deploy/airflow-scheduler
kubectl -n bigdata auth can-i create pods --as system:serviceaccount:bigdata:airflow-scheduler
```

`baidu-k8s.yaml` 中 `rbac.create: true` 且 `allowPodLaunching: true`，正常情况下 Helm Chart 会创建所需 RBAC。
