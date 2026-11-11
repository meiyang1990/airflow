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

## Why

当前 DAG UI 删除只清理元数据，airflow_dags 中的源文件仍会生成 DAG，后续解析发现数据库记录不存在便重新创建，导致删除后再次出现。需要提供持久删除语义，使用户明确删除的 DAG 在解析、源更新及服务重启后仍保持删除状态。

## What Changes

- 为 DAG 增加独立、持久的删除标记，在元数据清理后保留，阻止解析结果重新注册该 DAG。
- **BREAKING**：UI、API 和 CLI 的 DAG 删除统一为永久删除，不提供元数据清理后允许同名 DAG 重建的删除模式。
- 在服务端解析结果入库边界统一过滤已删除 DAG，并处理删除与解析并发，覆盖 DAG 元数据、序列化内容及关联调度信息。
- 删除不可恢复，不提供恢复接口、撤销入口或解除删除标记的管理命令；同一最终 DAG ID 永久禁止重新注册。
- 更新删除确认说明、错误反馈及回归测试，以 airflow_dags 模板 DAG 和部署 GitDagBundle 配置作为复现依据。

## Capabilities

### New Capabilities

- `persistent-dag-deletion`: DAG 持久删除、解析防重建、并发一致性、不可恢复约束与 UI 操作语义。

### Modified Capabilities

无。

## Impact

- Airflow core：删除服务、DAG API、ORM 与新增 Alembic 表、解析结果持久化路径、权限与审计。
- UI：DAG 删除请求、确认文案、缓存刷新；OpenAPI 和客户端通过项目生成流程更新。
- airflow_dags 作为来源与回归样例，不要求逐个改写模板，也不让 DAG/Worker 直接访问元数据库。
- GitDagBundle main/dev/test 以及本地文件来源均适用；不自动提交 Git、不删除共享源文件、不改 Ray Dashboard/Progress 认证。
- 本次交付为提案；实现阶段需验证新增表迁移及并发控制，部署镜像必须由完整源码构建。
