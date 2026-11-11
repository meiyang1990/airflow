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

## 1. 复现与写入路径确认

- [x] 1.1 使用 airflow_dags 的模块级 DAG 构造和分支 ID 规则建立隔离样例，在 Breeze 复现"解析→删除→再次解析→重建"，不执行真实 RayJob。
- [x] 1.2 审计 manager、dagbag、序列化直写与调度/手动触发路径，确定统一生命周期锁协议和最小权限归属字段。

## 2. 生命周期持久化

- [x] 2.1 新增独立生命周期 ORM 表与非破坏性 Alembic 迁移，覆盖升级、阻止丢失永久标记的降级保护及现有 DAG 兼容性。
- [x] 2.2 实现稳定生命周期记录、首次插入竞争处理、固定顺序锁定和状态重读；验证 SQLite、PostgreSQL、MySQL 事务行为。
- [x] 2.3 从通用 DAG 删除和数据库保留期清理中排除生命周期记录，增加不会误删标记的测试。

## 3. 永久删除 API 与 CLI

- [x] 3.1 统一 UI/API/CLI 永久删除语义，不提供允许重建的参数；实现原子标记/清理、重复删除幂等、404 和运行中 409。
- [x] 3.2 实现删除后仍有效的 DAG 权限校验及操作审计，确认没有恢复接口、撤销操作或解除永久标记的命令。
- [x] 3.3 添加成功、失败回滚、未知 DAG、重复请求、未认证/无权限、同名 ID 不可复用和所有删除入口永久生效测试。

## 4. 解析防重建与并发

- [x] 4.1 将生命周期校验接入所有相关服务端解析结果持久化路径，同时过滤元数据、序列化、版本、资产关联与权限同步，保留其他 DAG 的正常处理。
- [x] 4.2 使用两个独立数据库会话和确定性同步点测试解析先行、删除先行、首次建行竞争及重复删除并发，禁止用 sleep 推测事务顺序。
- [x] 4.3 测试删除与调度/手动触发竞争，确认成功删除不遗留可运行实例，无法安全删除时明确报冲突。
- [x] 4.4 覆盖相同文件多 DAG、分支前缀、源提交/路径/bundle 变更、重启及反复解析，确保最终 ID 删除持续有效且其他 DAG 不受影响。

## 5. UI 与文档

- [x] 5.1 按项目生成流程更新 OpenAPI 与客户端，确保 UI 与 CLI 调用统一永久删除服务。
- [x] 5.2 更新中英文删除确认说明，测试列表/详情删除入口、成功刷新、失败提示及运行中冲突。
- [x] 5.3 补充删除不可恢复、同一 ID 不可复用、Git 来源保留、历史数据删除及 API/CLI 行为变更说明和 newsfragment。

## 6. 验证与交付

- [x] 6.1 每个 Python 文件修改后立即执行 ruff format 和 ruff check --fix；通过 Breeze 运行新增和相关删除、解析、迁移测试，记录环境阻塞。
- [x] 6.2 运行 UI 对应检查，以及适用的 prek 快速/手动检查，核对生成文件一致性与完整差异。
- [x] 6.3 完成隔离 GitDagBundle 验收：保留源文件、删除、跨至少两个完整解析周期、更新提交、重启解析器、验证不存在恢复途径及同一 ID 无法重建；记录 DAG ID、bundle 和结果。
- [x] 6.4 输出完整源码镜像构建和协调升级方案，明确旧解析器混跑限制及保留标记的回滚步骤；生产部署另按用户指令执行。

## 7. Review 修复

- [x] 7.1 隔离 FAB 权限同步内部提交，保持外层生命周期锁，并验证真实 FAB 提交与失败回滚。
- [x] 7.2 在当前事务复用生命周期锁，验证 SQL 数量、事务结束和 savepoint 回滚后重新加锁。
- [x] 7.3 运行三数据库并发回归及相关解析测试，更新验证记录。
