# Apache Airflow 源码结构指南（二次开发导航）

> 本文档面向对 Airflow 进行二次开发的工程师，梳理仓库整体目录结构、各模块职责、关键入口点，
> 以及修改不同功能时应该动哪些目录。基线版本：Airflow 3.x（uv workspace monorepo）。

## 1. 仓库概览

Airflow 是一个 **uv workspace monorepo**，由多个可独立发布的 Python 发行版（distribution）组成，
共享同一个 uv 虚拟环境与依赖锁文件（`uv.lock`）。顶层目录分为四类：

| 类别 | 目录 |
| --- | --- |
| 可发布 Python 包 | `airflow-core`、`task-sdk`、`providers/*`、`airflow-ctl`、`shared/*`、`go-sdk` |
| 测试工程 | `airflow-core/tests`、`providers/*/tests`、`task-sdk-integration-tests`、`airflow-e2e-tests`、`helm-tests`、`docker-tests`、`kubernetes-tests`、`airflow-ctl-tests` |
| 部署物 | `chart/`（Helm chart）、`deploy/helm`、`clients/python`、`docker-stack-docs` |
| 工具与文档 | `dev/`、`scripts/`、`devel-common`、`contributing-docs/`、`docs/`、`generated/`、`openspec/` |

### 顶层目录速查

```
airflow/                        # 仓库根
├── airflow-core/               # 核心 Python 包：调度、API 服务、模型、CLI、UI
├── task-sdk/                   # 轻量 SDK：DAG 编写与任务执行运行时（airflow.sdk）
├── providers/                  # 84+ 个 Provider 包（amazon、google、standard、common 等）
├── shared/                     # 跨发行版共享的小型库（配置、日志、序列化等）
├── airflow-ctl/                # 管理 CLI 工具（airflowctl）
├── go-sdk/                     # Go 语言 SDK（edge worker、DAG 编写）
├── chart/                      # 官方 Helm chart
├── clients/python/             # OpenAPI 生成的 Python 客户端
└── (其余为工具链/文档/测试工程，见下文)
```

## 2. 核心包：`airflow-core/`

包名 `apache-airflow-core`，源码在 `airflow-core/src/airflow/`。这是调度器、API Server、
元数据模型所在的核心。按功能域组织：

```
airflow-core/src/airflow/
├── models/                 # SQLAlchemy 元数据模型（数据库表定义）
│   ├── dag.py              #   DagModel
│   ├── dagrun.py           #   DagRun（DAG 运行）
│   ├── taskinstance.py     #   TaskInstance（任务实例）
│   ├── asset.py            #   Asset（原 Dataset，数据资产/事件）
│   ├── backfill.py / hitl.py / team.py  # 回填、人机协同、团队隔离
│   ├── serialized_dag.py   #   序列化 DAG 存储
│   ├── connection.py / variable.py / pool.py / xcom.py  # 连接、变量、池、XCom
│   └── trigger.py          #   Trigger（异步触发器）
├── jobs/                   # 核心后台作业
│   ├── scheduler_job_runner.py   # ★ 调度器主循环（创建 DagRun/TI）
│   ├── dag_processor_job_runner.py  # DAG 文件解析进程管理
│   ├── triggerer_job_runner.py   # Triggerer：异步任务求值
│   └── base_job_runner.py / job.py
├── dag_processing/         # DAG 文件解析域
│   ├── processor.py        #   单个 DAG 文件解析进程逻辑
│   ├── manager.py          #   解析进程管理
│   ├── dagbag.py           #   DagBag
│   ├── bundles/            #   DAG 源抽象（本地/Git 等，见 providers 中的 dag processor provider）
│   └── importers/          #   文件导入器
├── api_fastapi/            # ★ API Server（FastAPI）
│   ├── core_api/           #   公共 REST API v2 + UI 专用端点
│   │   ├── routes/public/  #     /api/v2 公共端点（dags、dag_run、pools、variables…）
│   │   ├── routes/ui/      #     UI 专用端点（grid、gantt、calendar、dashboard…）
│   │   ├── services/       #     业务逻辑层（public/ui 各一套）
│   │   ├── datamodels/     #     Pydantic 请求/响应模型
│   │   └── openapi/        #     OpenAPI schema
│   ├── execution_api/      #   任务执行通信 API（worker ↔ API Server，JWT 鉴权）
│   │   ├── routes/ / datamodels/ / versions/  # 版本化端点与数据模型
│   │   └── security.py     #     JWT token 校验
│   ├── app.py / main.py    #   应用装配与启动
│   └── auth/               #   认证后端
├── executors/              # 执行器抽象
│   ├── base_executor.py    #   BaseExecutor 契约
│   ├── local_executor.py   #   本地执行器
│   ├── executor_loader.py  #   执行器加载
│   └── workloads/          #   执行负载定义
├── serialization/          # DAG 序列化（scheduler 只读序列化 DAG，不跑用户代码）
│   ├── serialized_objects.py     # 序列化/反序列化核心
│   ├── encoders.py / decoders.py
│   └── schema.json
├── cli/                    # `airflow` 命令行
│   ├── cli_config.py       #   ★ 所有子命令/参数定义（CLIRules）
│   ├── cli_parser.py       #   参数解析
│   ├── commands/           #   各子命令实现
│   └── hot_reload.py
├── ui/                     # React/TypeScript 前端（Vite + openapi-gen）
│   ├── src/pages/          #   页面（Dashboard、DagsList、Grid、Gantt、Run…）
│   ├── src/components/     #   组件库
│   ├── openapi-gen/        #   由 OpenAPI 生成的 TS client
│   └── tests/              #   Playwright/单元测试
├── migrations/             # Alembic 数据库迁移（versions/ 内为具体迁移脚本）
├── configuration.py        # airflow.cfg 加载与 conf 对象
┑── config_templates/       # 默认配置模板
├── security/               # 权限、Kerberos 等
├── secrets/                # Secrets 后端抽象
├── logging/                # 日志配置
├── triggers/               # 触发器注册/回调
├── timetables/             # 时间表兼容层
├── sensors/ operators/ hooks/   # 兼容 re-export（真正实现在 task-sdk/providers）
├── listeners/              # 任务/DAG 生命周期监听器插件
├── notifications/          # 通知器
├── lineage/                # 数据血缘
├── stats.py                # metrics（StatsD）
├── plugins_manager.py      # 插件管理
├── providers_manager.py    # Provider 注册表
└── policies.py             # DAG/任务级策略回调
```

### airflow-core 关键入口

- 调度循环：`jobs/scheduler_job_runner.py`
- API 服务启动：`api_fastapi/main.py` → `app.py`
- CLI 命令注册：`cli/cli_config.py`
- 数据库表结构：`models/` + `migrations/versions/`
- UI 前端：`ui/`（pnpm/Vite，详见 `ui/CONTRIBUTING.md`）

## 3. 任务 SDK：`task-sdk/`

包名 `apache-airflow-task-sdk`，源码 `task-sdk/src/airflow/sdk/`。用户编写 DAG、worker
执行任务都用它。**不含数据库访问**——通过 Execution API 与 API Server 通信。

```
task-sdk/src/airflow/sdk/
├── definitions/            # ★ DAG 编写 API（用户直接使用）
│   ├── dag.py              #   @dag 装饰器 / Dag 类
│   ├── decorators/         #   @task 装饰器族
│   ├── asset/              #   Asset（数据资产）、AssetWatcher
│   ├── taskgroup.py        #   TaskGroup
│   ├── param.py            #   Params
│   ├── xcom_arg.py         #   XComArg（任务间依赖推导）
│   ├── mappedoperator.py   #   动态任务映射（.expand()/.partial()）
│   ├── timetables/         #   时间表
│   └── template.py         #   模板渲染
└── execution_time/         # ★ 任务执行运行时（worker 侧）
    ├── task_runner.py      #   TaskRunner：单任务执行状态机
    ├── supervisor.py       #   进程监督（fork、IO、心跳）
    ├── execute_workload.py #   执行负载入口
    ├── comms.py            #   与 API Server 的通信（Execution API 客户端）
    ├── context.py          #   模板上下文（{{ }} 渲染的变量来源）
    ├── xcom.py / secrets/  #   XCom 读写、Secrets 获取
    ├── callback_runner.py  #   回调执行
    └── hitl.py             #   人机协同（Human-in-the-loop）
├── api/                    # Execution API 客户端（client.py + datamodels）
├── bases/                  # 插件基类：Operator、Sensor、Hook、Notifier、SecretsBackend、Timetable
├── serde/                  # 序列化框架
├── types.py                # 核心类型定义（Workload、TaskInstance 状态等）
├── log.py / logging        # 日志
└── observability/          # 可观测性
```

### task-sdk 关键入口

- 新增/修改 DAG 编写 API：`definitions/`
- 任务执行行为（重试、超时、渲染、XCom）：`execution_time/`
- Operator/Hook 等基类：`bases/`

## 4. Providers：`providers/`

84+ 个独立包，目录名即 provider id（`providers/<id>/pyproject.toml`）。通用模式：

```
providers/<name>/
├── pyproject.toml          # 包定义与依赖
├── src/airflow/providers/<name>/
│   ├── get_provider_info.py  # ★ provider 元信息（hooks/operators/触发器注册表）
│   ├── hooks/ operators/ sensors/ triggers/ transfers/
│   └── example_dags/
└── tests/
```

重点 provider：

- `providers/standard/`：内置基础 Operator/Sensor/Hook/Trigger（BashOperator、PythonOperator 等移至此）
- `providers/common/`：跨 provider 共享（common.sql、common.io、common.messaging、common.ai、common.compat）
- `providers/cncf/kubernetes/`：K8s 执行相关
- `providers/celery/`：Celery 执行器
- `providers/fab/`：FAB auth manager（默认权限体系）
- `providers/amazon/`、`providers/google/`：大型云 provider
- `providers/edge3/`：Edge 执行器（3.x 新增）

## 5. 共享库：`shared/`

多版本共存的小型发行版，源码被符号链接进 `airflow-core`、`task-sdk` 等（保证不同发行版可用不同版本）：

- `shared/configuration/` — 配置读取
- `shared/logging/` — 日志工具
- `shared/serialization/` — 序列化工具
- `shared/secrets_backend/`、`shared/secrets_masker/` — Secrets
- `shared/dagnode/`、`shared/timezones/`、`shared/module_loading/`、`shared/observability/`
- `shared/plugins_manager/`、`shared/providers_discovery/`、`shared/template_rendering/`

## 6. 其他顶级目录

| 目录 | 说明 |
| --- | --- |
| `airflow-ctl/` | 管理 CLI `airflowctl`（源码 `airflow-ctl/src/airflowctl/`：api/、ctl/、utils/） |
| `go-sdk/` | Go SDK：edge worker（`go-sdk/edge`）、Go DAG 编写（`go-sdk/sdk`、`bundle`、`cmd`） |
| `chart/` | 官方 Helm chart（templates/、values.yaml、charts/ 子 chart） |
| `clients/python/` | OpenAPI 生成的 Python REST 客户端（`airflow-core/src/airflow/api_fastapi/core_api/openapi` 生成） |
| `devel-common/` | 开发期共享测试工具（`src/tests_common/pytest_plugin.py` 全仓测试 fixture） |
| `dev/` | 开发/构建/发布脚本（breeze 环境、镜像构建、release 工具）；临时脚本放这里 |
| `scripts/` | CI/prek 脚本（含 `scripts/ci/prek/`），自身是 `apache-airflow-scripts` 包 |
| `contributing-docs/` | 贡献者文档（快速上手、PR 指南、静态检查、provider 生命周期） |
| `docs/` | 用户文档（Sphinx，`docs/apache-airflow/`） |
| `generated/` | 生成产物（依赖树、provider 元数据等，勿手改） |
| `openspec/` | 本项目 OpenSpec 工作流（specs/changes），本文档所在 |
| `constraints/` | 约束依赖列表（发布用） |
| `performance/` | 性能测试 |
| `docker-stack-docs/`、`docker-tests/`、`docker-context-files/` | Docker 相关 |
| `providers-summary-docs/` | Provider 文档汇总 |
| `registry/` | 提供者注册相关工具 |
| `deploy/helm/` | 部署用 helm 相关 |

## 7. 架构边界与数据流（二次开发必读）

```
用户 DAG（task-sdk definitions）
        │ 解析（独立进程）
        ▼
DAG File Processor（dag_processing）──序列化──▶ 元数据 DB（models + serialization）
        │                                        ▲
        ▼                                        │ 读写
Scheduler（jobs/scheduler_job_runner）───────────┘
        │ 下发任务                                 │
        ▼                                         │
Worker（task-sdk execution_time）──Execution API──▶ API Server（api_fastapi/execution_api）
        │                                         ▲
        ▼                                         │ 服务 UI / REST
Triggerer（jobs/triggerer_job_runner）            │
                                                  ▼
                                     React UI（ui/）+ core_api public/ui 路由
```

关键约束（详见 `airflow-core/docs/security/security_model.rst`）：

1. **Scheduler 永不执行用户代码**——只读序列化 DAG（`serialization/`）。
2. **Worker 永不直接访问元数据 DB**——全部通过 Execution API（JWT token 按 TaskInstance 限定作用域）。
3. DAG File Processor 与 Triggerer 有软件防护引导走 Execution API，但不防恶意绕过（设计如此，非漏洞）。
4. 新增功能必须遵守上述边界：改调度逻辑 → `jobs/`；改任务执行 → `task-sdk/execution_time/`；改 API → `api_fastapi/`。

## 8. 二次开发速查表

| 要改什么 | 去哪里改 | 测试位置 |
| --- | --- | --- |
| 调度算法/调度循环 | `airflow-core/src/airflow/jobs/scheduler_job_runner.py` | `airflow-core/tests/` |
| 新增 REST API 端点 | `airflow-core/src/airflow/api_fastapi/core_api/routes/{public,ui}/` + `services/` + `datamodels/` | `airflow-core/tests/unit/api_fastapi/` |
| 任务执行行为（重试/超时/XCom） | `task-sdk/src/airflow/sdk/execution_time/` | `task-sdk/tests/` |
| DAG 编写 API（新装饰器/参数） | `task-sdk/src/airflow/sdk/definitions/` | `task-sdk/tests/` |
| 新 Operator/Hook | 新建 provider 或 `providers/standard/` | 对应 provider 的 `tests/` |
| 数据库表结构 | `airflow-core/src/airflow/models/` + 新增 Alembic migration | `airflow-core/tests/` |
| UI 页面/组件 | `airflow-core/src/airflow/ui/src/` | `ui/tests/` |
| CLI 子命令 | `airflow-core/src/airflow/cli/cli_config.py` + `commands/` | `airflow-core/tests/cli/` |
| 认证/权限 | `providers/fab/`（auth manager）或 `api_fastapi/auth/` | 对应测试 |
| 执行器 | `airflow-core/src/airflow/executors/` + 具体 provider（celery、kubernetes） | 对应测试 |
| Helm chart | `chart/` | `helm-tests/` |
| 配置项 | `airflow-core/src/airflow/config_templates/` + `configuration.py` | — |

## 9. 开发工作流备忘

- 本地测试单测：`uv run --project <PROJECT> pytest <path> -xvs`（PROJECT 如 `airflow-core`、`task-sdk`、`providers/amazon`）
- 系统依赖缺失时改用：`breeze run pytest <tests> -xvs`
- 并行跑套件：`breeze testing core-tests --run-in-parallel`
- 类型检查：非 provider 用 `uv run --project <PROJECT> --with "apache-airflow-devel-common[mypy]" mypy <path>`；provider 用 `breeze run mypy <path>`
- Lint/格式化：`prek run ruff --from-ref main`、`prek run ruff-format --from-ref main`
- 静态检查全集：`prek run --from-ref main --stage pre-commit`（fast）/ `--stage manual`（slow）
- 变更哪些文件需要跑哪些测试：`breeze selective-checks --commit-ref <commit>`
- 用户可见变更需添加 newsfragment：`airflow-core/newsfragments/{PR号}.{类型}.rst`
- 临时脚本放 `dev/`（Breeze 内挂载为 `/opt/airflow/dev/`）
