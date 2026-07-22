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

# Airflow 阿里云 ACK 部署文档

本文档用于将 `deploy/helm/airflow` Helm Chart 部署到阿里云 ACK 集群，并统一使用阿里云 NAS 极速型 `ReadWriteMany` StorageClass。

## 部署目标

- Kubernetes 集群：阿里云 ACK，当前 kube context 为 `aliyun-common-service`
- Helm release：`airflow`
- 命名空间：`airflow`
- Chart 路径：`deploy/helm/airflow`
- Values 文件：`deploy/helm/aliyun-k8s-values.yaml`
- 共享存储类：`alicloud-nas-extreme-rwx`
- Airflow Executor：`KubernetesExecutor`
- Airflow API Server Service 类型：`LoadBalancer`
- 数据库：外部 PostgreSQL，`postgresql.enabled: false`

## 当前状态

部署前请注意：之前已经触发过一次 Helm 安装，随后被中断。本地 Helm 等待进程已停止，但 ACK 集群里已有一批资源，当前 release 状态可能是 `pending-install`。

检查命令：

```bash
helm status airflow -n airflow
kubectl get pods,pvc,svc -n airflow
```

如果仍显示 `pending-install`，建议在正式部署前清理该半成品 release：

```bash
helm uninstall airflow -n airflow
```

由于 NAS StorageClass 使用 `reclaimPolicy: Retain`，删除 PVC 后底层 PV/NAS 数据不会自动清掉。需要保留或清理数据时，请先确认实际 PV 和 NAS 子目录。

## 前置条件

1. ACK 集群 kubeconfig 已连接，并确认 context 正确：

   ```bash
   kubectl config current-context
   kubectl get nodes -o wide
   ```

2. NAS 极速型 StorageClass 已创建并可动态供应 RWX PV：

   ```bash
   kubectl get sc alicloud-nas-extreme-rwx -o yaml
   ```

   关键配置应类似：

   ```yaml
   provisioner: nasplugin.csi.alibabacloud.com
   parameters:
     volumeAs: subpath
     server: 011rv6vpjoxsx3d1gc1-sbiq.cn-beijing.extreme.nas.aliyuncs.com:/k8s
   reclaimPolicy: Retain
   allowVolumeExpansion: true
   ```

3. 测试 PVC 已成功 Bound，证明 StorageClass 可用：

   ```bash
   kubectl get pvc nas-extreme-rwx-test
   ```

4. 外部 PostgreSQL 可从 ACK 节点访问，并且数据库、用户、权限已准备好。

5. 镜像仓库可从 ACK 节点拉取：

   ```text
   ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow-openmetadata:3.2.1-om-1.12.6
   ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/statsd-exporter:v0.29.0
   ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/git-sync:v4.4.2
   ```

6. `airflow-ssh-secret` 已存在或会在部署前创建。当前 values 中多个组件会挂载该 Secret，用于访问 DAG Git 仓库：

   ```bash
   kubectl get secret airflow-ssh-secret -n airflow
   ```

## 已调整的存储配置

`deploy/helm/aliyun-k8s-values.yaml` 中以下 PVC 配置已统一改为：

```yaml
storageClassName: alicloud-nas-extreme-rwx
```

覆盖范围：

- `workers.persistence`
- `workers.celery.persistence`
- `triggerer.persistence`
- `redis.persistence`
- `dags.persistence`
- `logs.persistence`

其中 `dags.persistence.accessMode` 保持：

```yaml
accessMode: ReadWriteMany
```

额外 PVC 文件 `deploy/helm/airflow-openmetadata-configs-pvc.yaml` 已改为：

```yaml
metadata:
  name: airflow-openmetadata-configs
  namespace: airflow
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: alicloud-nas-extreme-rwx
```

## 部署前检查

执行 Helm lint：

```bash
helm lint deploy/helm/airflow -f deploy/helm/aliyun-k8s-values.yaml
```

渲染模板：

```bash
helm template airflow deploy/helm/airflow \
  -n airflow \
  -f deploy/helm/aliyun-k8s-values.yaml \
  >/tmp/airflow-aliyun-rendered.yaml
```

检查关键资源：

```bash
rg -n "storageClassName|airflow-openmetadata-configs|LoadBalancer" /tmp/airflow-aliyun-rendered.yaml
```

## 正式部署步骤

1. 创建命名空间：

   ```bash
   kubectl create namespace airflow --dry-run=client -o yaml | kubectl apply -f -
   ```

2. 确认或创建 Git SSH Secret：

   ```bash
   kubectl get secret airflow-ssh-secret -n airflow
   ```

3. 创建 OpenMetadata 共享配置 PVC：

   ```bash
   kubectl apply -f deploy/helm/airflow-openmetadata-configs-pvc.yaml
   ```

4. 部署 Airflow：

   ```bash
   helm upgrade --install airflow deploy/helm/airflow \
     -n airflow \
     --create-namespace \
     -f deploy/helm/aliyun-k8s-values.yaml \
     --wait \
     --timeout 15m
   ```

## 部署后验证

查看 release：

```bash
helm status airflow -n airflow
```

查看 Pod、PVC、Service：

```bash
kubectl get pods,pvc,svc -n airflow -o wide
```

所有核心 Pod 应进入 Running：

- `airflow-api-server`
- `airflow-scheduler`
- `airflow-dag-processor`
- `airflow-triggerer`
- `airflow-statsd`

PVC 应为 Bound，并使用 `alicloud-nas-extreme-rwx`：

```bash
kubectl get pvc -n airflow
```

如果 API Server Service 为 LoadBalancer，查看公网地址：

```bash
kubectl get svc airflow-api-server -n airflow
```

也可以用端口转发本地访问：

```bash
kubectl port-forward svc/airflow-api-server 8080:8080 -n airflow
```

## 常见问题排查

查看事件：

```bash
kubectl get events -n airflow --sort-by=.lastTimestamp
```

查看 Pod 详情：

```bash
kubectl describe pod -n airflow <pod-name>
```

查看 init container 日志：

```bash
kubectl logs -n airflow <pod-name> -c wait-for-airflow-migrations
```

如果 Pod 卡在 `Init:0/1`，优先检查：

- 外部 PostgreSQL 是否可访问
- 数据库迁移是否成功
- `airflow-ssh-secret` 是否存在
- NAS PVC 是否 Bound
- 镜像是否可拉取

## 回滚和清理

回滚到上一版：

```bash
helm rollback airflow <revision> -n airflow
```

卸载 release：

```bash
helm uninstall airflow -n airflow
```

如果需要清理 PVC：

```bash
kubectl delete pvc airflow-dags airflow-logs airflow-openmetadata-configs -n airflow
```

注意：`alicloud-nas-extreme-rwx` 的 `reclaimPolicy` 为 `Retain`，删除 PVC 不等于删除 NAS 上的真实数据。
