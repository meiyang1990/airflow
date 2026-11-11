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

# 永久删除实施与验证记录

## 实现范围

- `dag_lifecycle` 保存永久删除时间、来源 bundle 和鉴权所需团队归属，独立于 DagModel，不参与 DAG 元数据和保留期清理。
- UI、公共 DELETE API 和本地 CLI 共用永久删除服务，不提供恢复操作或关闭永久删除的参数。
- 解析结果、直接 bulk 写入、序列化直写均检查生命周期状态；旧序列化对象创建 DagRun 时，在行锁保护下确认 DAG 仍然注册。
- 同一 DAG ID 使用事务级数据库锁；调度/触发复用 DagModel 行锁，不反向获取生命周期锁。删除遇到调度器持有的 DagModel 行锁时返回冲突，避免反向锁顺序死锁。
- 新迁移 `2e879bc6a120` 基于 `1c31f3f5d9ae`，存在永久删除标记时拒绝丢弃该表的降级。

## 测试环境和命令

本机使用 Colima Docker 引擎，Airflow 测试全部通过 Breeze 执行，未在宿主机直接运行 Python、pytest 或 Airflow。复用已有 Python 3.12 CI 镜像并挂载当前完整工作区；未构建或发布部署镜像，未改变 airflow_dags 的 Python 运行时。

```sh
DOCKER_CONTEXT=colima breeze run --python 3.12 --skip-image-upgrade-check --backend sqlite \
  pytest airflow-core/tests/unit/models/test_dag_lifecycle.py \
  airflow-core/tests/unit/api_fastapi/core_api/routes/public/test_dags.py::TestDeleteDAG -xq
```

相同核心回归分别使用 `--backend postgres` 和 `--backend mysql`。另运行原有解析集合、序列化、CLI 删除、调度创建 DagRun 及迁移/ORM 一致性测试。

Git 验收使用隔离的本地 Git 仓库和真实 GitDagBundle：模块级创建 `main_permanent_deletion` 与 `dev_permanent_deletion`，删除前者，完成两轮刷新和解析，再提交源文件更新、创建新 bundle/DagBag 实例并解析。前者保持不存在，后者持续存在。测试不运行 RayJob、不修改真实 airflow_dags 仓库。

## 回归结果

最终锁顺序修正后的定向集合包含生命周期、公共删除 API、三个 CLI 删除测试及调度器创建运行测试。PostgreSQL 和 MySQL 各 37 项通过，包含确定性并发与解析/调度死锁回归。

同一最终集合在 SQLite 上 35 项通过、2 项跳过；跳过项依赖 PostgreSQL/MySQL 的行锁，已在这两种数据库通过，SQLite 的写事务串行化并发测试正常通过。

此前 SQLite 扩展回归覆盖完整解析集合、序列化、删除与鉴权、CLI 和调度：148 项通过、3 项跳过（1 项行锁专用测试和 2 项需要 FAB Auth Manager 的既有测试）。前端删除按钮测试 3 项通过。修改的 17 个 Python 文件 Ruff 检查和格式检查通过；最后一次锁顺序修改的定向 mypy 再次通过。

## 静态检查与生成流程

- Python 修改均立即运行 Ruff format/check；改动核心文件的定向 mypy 检查通过。
- 前端删除确认、取消、服务器冲突反馈测试通过。
- OpenAPI 和迁移参考文档通过 Breeze 内的项目生成脚本生成；前端客户端通过项目 `pnpm run codegen` 生成。迁移参考文档同时补齐原先未生成的既有自定义迁移链。
- 已运行变更文件的 prek pre-commit 和 manual 阶段。全仓检查存在以下非本次修改导致的问题，不能称为全仓全绿：
  - 全量 mypy：Execution API token 的 UUID 类型、Ray Dashboard payload/响应类型等，合计 6 个错误，位于未修改的 3 个文件。
  - 全量 UI TypeScript：`AIDiagnosis.tsx:340` 的 i18n `count` 接收了 nullable 值。
  - Boring Cyborg 配置：既有 `.github/workflows/registry-*` 匹配项没有对应文件。
  - SQLite 全库迁移/ORM 一致性：既有 `task_instance_ai_diagnosis.id` 的 BIGINT/BigInteger 类型差异；差异不涉及 `dag_lifecycle`。保留原测试的失败结果，另以独立测试验证新增表的一致性。
  - OpenAPI/迁移文档的 prek 包装默认尝试构建 Python 3.10 镜像，受本机 Docker context 构建配置阻塞；已使用可运行的 Breeze Python 3.12 环境执行相同生成脚本完成替代验证。

## Review 修复验证

- FAB 权限同步使用绑定解析连接的独立 Session，并通过 savepoint 加入外层事务。真实 FAB 权限写入的提交不会提交解析事务；外层回滚仍撤销这些写入。权限写入异常触发的 FAB 内部 rollback 也不会回滚外层生命周期锁。
- 生命周期记录改为批量 upsert 和锁定读，并仅在当前 SessionTransaction 内复用。SQL 计数测试覆盖单 DAG 与多个 DAG：每批首次解析只发出 2 条生命周期 SQL，原先单 DAG 为 9 条；同一事务再次处理同批 DAG 不增加生命周期 SQL。提交、回滚及 savepoint 回滚后的状态重读均有回归覆盖。
- 本轮只修改 core 的生命周期锁、FAB 同步调用边界及回归测试，未修改 FAB provider 的公共行为、API 或前端。
- 定向 mypy、Ruff 格式与检查、prek manual 均通过。prek pre-commit 仍受前文记录的既有 6 个 mypy 错误和 Boring Cyborg 配置问题影响。

扩展回归对每个数据库依次执行以下集合（`--backend` 分别为 `mysql`、`sqlite`、`postgres`）：

```sh
DOCKER_CONTEXT=colima breeze run --python 3.12 --skip-image-upgrade-check --backend postgres -- \
  pytest airflow-core/tests/unit/models/test_dag_lifecycle.py \
  airflow-core/tests/unit/dag_processing/test_collection.py \
  airflow-core/tests/unit/models/test_serialized_dag.py \
  airflow-core/tests/unit/api_fastapi/core_api/routes/public/test_dags.py::TestDeleteDAG -xq
```

本轮最终结果：PostgreSQL 142 项通过、2 项跳过；MySQL 142 项通过、2 项跳过；SQLite 140 项通过、4 项跳过。各环境的 2 项共同跳过是既有 FAB 全局环境专用测试，SQLite 另外跳过 2 项行锁专用测试。新增的 3 项真实 FAB 权限同步测试在全部数据库执行并通过，没有依靠跳过规避 FAB 问题。

## 部署与回滚

本次只修改源码和测试，没有执行生产迁移、生产删除、推送或部署。

1. 在发布前保存数据库备份，并记录完整源代码提交与镜像标签。
2. 使用仓库 `deploy/helm/build-airflow-source-image.sh` 从完整源码构建，显式设置 `AIRFLOW_IMAGE_TAG`、既有部署的 `AIRFLOW_PYTHON_VERSION` 和目标平台；本地审查构建时设置 `PUSH_IMAGE=false`。不得使用旧镜像加文件覆盖或仅替换前端 dist。
3. 暂停旧版本解析/调度写入，执行数据库升级到 `2e879bc6a120`，协调升级 API Server、Scheduler、DAG Processor，再开放永久删除操作。
4. 不允许旧版写入进程与永久删除操作混跑。生产验收使用专用可删除 DAG，验证源保留和刷新后不会重新出现。
5. 已存在永久删除标记时，不能降级删除表或回滚到不执行标记检查的处理器。需要回滚应用时，先停止相关写入方并保留表和标记；只有保证这些 DAG ID 仍无法注册的版本才可重新启用。历史 DAG 不提供恢复流程。
