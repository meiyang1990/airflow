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
| Airflow 镜像 | `ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow-openmetadata:3.2.1-om-1.12.6` |
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
   - `ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow-openmetadata`
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
