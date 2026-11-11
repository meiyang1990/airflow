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

<!-- SPDX-License-Identifier: Apache-2.0 -->

## Context

代码证据形成完整重建链路：

1. `airflow-core/src/airflow/ui/src/queries/useDeleteDag.ts` 调用公共删除接口；`api_fastapi/core_api/routes/public/dags.py` 委托 `api/common/delete_dag.py`。后者按 `dag_id` 删除数据库模型，不修改 DAG 来源。
2. `../airflow_dags/dags/pipeline/algo_operator_template001_dag.py` 在模块级执行 `AlgoOperatorTemplate001DAG().dag`；其配置由 `dags/dag_configs` 的 YAML 提供。`algo_operator_configurable_dag.py` 读取配置中的 DAG ID，并通过基类添加分支标识。
3. `deploy/helm/baidu-k8s.yaml` 的 `dagBundleConfigList` 配置 `dag_main`、`dag_dev`、`dag_test`，使用 GitDagBundle 跟踪 airflow_dags 分支，`refresh_interval: 60`；另有 LocalDagBundle。git-sync 明确关闭。刷新间隔并不等同于精确复现延迟，解析排队和最小解析间隔也会影响时间。
4. `dag_processing/collection.py` 的 `update_dag_parsing_results_in_db` 持久化解析结果；`DagModelOperation.add_dags` 为缺失记录调用 `_create_orm_dags`，随后写入序列化 DAG。因此源码还在时，下一轮解析会重建已清空的元数据。

上述为本地源码与部署配置核对结果，尚未连接线上环境确认实际运行版本或针对某一 DAG 实测。用户所述对象按 DAG 列表/详情中的"删除 Dag"处理，不扩展到删除单个 DagRun 或 TaskInstance。

## Goals / Non-Goals

**Goals:** UI 删除成功后，指定最终 DAG ID 在重复解析、Git 更新及进程重启后不再注册、显示或被调度；删除不可恢复，UI、API、CLI 使用一致的永久删除语义。

**Non-Goals:** 不清除 Git 历史或远端源代码，不删除同文件的其他 DAG，不停止正在执行的任务，不重构 airflow_dags 模板工厂，不修改 Ray 指标或固定 token 契约。此处"持久删除"指删除运行元数据并禁止自动重建，不代表删除外部日志、对象存储或源文件。

## Decisions

### 1. 使用独立的持久生命周期记录

新增按最终 `dag_id` 唯一的生命周期表，记录删除状态、时间和原 bundle/权限所需归属信息；操作者由现有删除审计日志保留。Airflow DAG ID 在元数据库中全局唯一，因此 bundle 仅作来源记录，不将 bundle 版本纳入标记键；源迁移或提交更新不自动解除删除。不同分支产生的不同 DAG ID 相互独立。

记录不外键级联依赖 DagModel，必须显式从 `delete_dag` 的"所有带 dag_id 模型"通用清理循环排除，也不能被历史数据清理自动移除。该表同时提供稳定的并发锁定对象；删除状态一旦提交即不可逆，禁止任何产品操作将其清除或重置。

替代方案：仅暂停仍会在 UI 出现；前端隐藏不能阻止调度；删除 Pod 本地文件会被 Git 来源恢复，且无法安全处理多 DAG 文件；自动 Git 提交引入仓库写权限及跨分支副作用。选择服务端生命周期控制以覆盖所有来源。

### 2. 所有 DAG 删除统一为不可恢复的永久删除

现有 `DELETE /api/v2/dags/{dag_id}` 及 CLI DAG 删除统一永久阻止重建，不增加可关闭此行为的参数。这是对原先仅清理元数据行为的有意兼容性变更，需在 API 文档和发布说明中明确。删除检查、标记写入和元数据清理在同一事务完成，由外层提交，辅助函数不调用 `session.commit()`。

已持久删除的重复请求幂等返回 204；从未存在且没有标记的 ID 返回 404。运行中任务继续返回 409，失败时不留下删除标记。普通元数据清理不能清除已有标记。审计日志保留。

不提供 restore API、撤销按钮、解除标记的 CLI 或其他恢复操作。管理员也不能通过产品接口恢复该 DAG 或复用其最终 ID。删除后重复请求仍需鉴权；由于 DagModel 已不存在，必须依据保留的归属信息实现并测试鉴权，不能通过"查不到 DAG"绕过授权。

### 3. 在服务端持久化边界保证一致性

统一在解析结果进入数据库前筛除被删除的 DAG，覆盖 `manager.py` 和 `dagbag.py` 调用路径，并审计直接 bulk/serialization 写入入口。过滤必须同时约束 DagModel、SerializedDag、DagVersion、标签、资产调度关联、告警及权限同步；不修改正常文件解析错误的处理，不影响同文件的其他 DAG。

只在事务开始查询一次标记不足以解决竞态。删除、解析注册需使用同一生命周期记录的数据库互斥协议：以唯一键安全创建记录，按 DAG ID 排序锁定，取得锁后重新检查状态，并持有至元数据写入事务结束。首次建行通过各数据库支持的原生 upsert 处理唯一键冲突，再写锁并以锁定读重读状态，不让外层事务失效。SQLite 需要对应的写事务序列化策略；PostgreSQL/MySQL 使用支持的行锁。不能用进程内锁或缓存替代跨进程一致性。

当解析先获得锁，删除等待并清理解析结果；当删除先获得锁，解析等待后跳过写入。调度/触发与删除的现有锁定流程需纳入测试，确保成功删除后不遗留可运行的新 DagRun；无法满足安全删除条件时返回冲突，不能报告成功。删除获取 DagModel 锁使用 NOWAIT，避免与已持有 DagModel 锁的调度器发生反向等待；SQLite 则由写事务串行化。

创建 DagRun 复用调度器已有的 DagModel 行锁，并在锁定读中确认 DAG 仍然注册，不再获取生命周期锁；SQLite 通过对 DagModel 的无变化写入提供同等串行化。这样解析可以按生命周期记录→DagModel 的顺序写入，而调度器不会持有 DagModel 等待解析器的生命周期锁。独立会话回归覆盖调度器先锁定、解析器随后持有生命周期锁并等待的顺序，确认正常创建运行且解析事务没有死锁回滚。

生命周期行按排序后的 ID 批量 upsert，再通过排序的锁定读取得状态；SQLite 由 upsert 开启写事务。取得的记录仅在同一个 SQLAlchemy SessionTransaction 内复用，使外层解析、bulk 写入和逐 DAG 序列化不再重复发出生命周期 SQL。根事务或 savepoint 发生切换时重新加锁和读取，不跨提交、回滚复用删除状态。

FAB 权限管理器会在内部提交或回滚，因此通过独立 Session 加入解析事务的同一连接，使用 `join_transaction_mode="create_savepoint"`。权限管理器的内部提交只释放自己的 savepoint，不能提交外层解析事务或释放生命周期锁；外层回滚仍会撤销权限写入。权限同步失败关闭子 Session 时，也只能回滚其自身 savepoint。

### 4. UI 与兼容性

中英文确认框说明"删除运行数据并阻止自动重新出现；源代码保留；永久删除且不可恢复，同一 DAG ID 不可再次注册"。服务端成功后才显示成功提示并刷新列表和详情；失败保留错误反馈。OpenAPI schema 和生成客户端按项目流程生成，禁止手工修改生成文件。部署时先完成服务端和所有解析写入方升级，再启用 UI 持久删除。

## Risks / Trade-offs

- 新表被通用清理误删 → 显式排除并添加清理回归测试。
- 锁竞争与首次建行竞态 → 批量读取、固定加锁顺序、独立数据库会话并发测试，验证三种支持的数据库。
- 旧版本解析器不认识标记 → 协调升级所有写入方，混合版本阶段不开放持久删除。
- 原权限依赖已删除 DagModel → 保存最小授权上下文，覆盖不同 auth manager 的无权限删除与重复删除测试。
- 同名新 DAG 被继续阻止 → 文档明确按最终 DAG ID 持久生效，同一 ID 不可复用，不提供解除标记途径。
- 回滚旧代码可能重新注册 → 回滚前暂停解析器，保留新表和标记，只有确认旧版本也不会注册这些 ID 后才能重新启动解析，否则禁止该回滚路径；不静默丢弃标记。

## Migration Plan

1. 添加非破坏性新表迁移及升级验证，不推断或追溯此前删除意图。存在永久删除标记时，降级不得丢弃标记或使其失效；不满足此条件的降级必须拒绝。
2. 在 Breeze 中完成生命周期、删除 API、解析及数据库并发测试；执行 UI 检查与项目静态检查。
3. 以 airflow_dags 模板结构构建隔离样例，完成删除、重复解析、bundle 更新、重启及不可恢复验收。
4. 实施部署时从完整源码构建镜像，协调升级 API 与解析写入方，再开放 UI 行为。部署和生产删除不属于本次提案操作。

## Open Questions

- 实施时核对线上实际版本和一个受影响 DAG 的最终 ID、bundle；本地证据足以解释重建，但不能替代线上验收。
- 实施前确认各数据库的首次建行和锁定方案，以可重复并发测试作为合入门槛；若需扩大为跨包架构重构，应先说明范围。
