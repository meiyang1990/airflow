# 基于 Airflow 源码构建 Docker 镜像

本文档用于从当前 Airflow 源码目录全量构建 Docker 镜像，并推送到百度云 CCR。

## 前提

- 已安装并启动 Docker，支持 `docker buildx`。
- 已登录百度云 CCR 镜像仓库。
- 在 Airflow 源码根目录执行命令。
- 构建部署镜像必须使用全量源码构建，不使用热修补镜像、前端 `dist` 覆盖或局部文件覆盖。
- 每次构建部署镜像都必须重新打包前端代码，不能复用旧的 `airflow-core/src/airflow/ui/dist`。即使只改了 Python 代码，也要重新生成前端静态资源，避免镜像内源码已更新但 Web UI 仍加载旧 bundle。
- Airflow 的容器安装脚本如果发现已有 `ui/dist`，会倾向于认为资产已经编译过而跳过前端构建。为了满足"重新打包"，构建前必须先确认这些 `dist` 是否是 git 已跟踪文件；`dist` 属于构建产物目录（未被跟踪），构建前要移走或清掉旧 `dist`，让 Docker 构建阶段重新跑 `pnpm run build`。
- 线上服务器是Linux架构，需要构建amd64架构的镜像

## 构建并推送镜像

```bash
AIRFLOW_IMAGE_TAG="3.2.1-source-$(date +%Y%m%d%H%M%S)" \
PUSH_IMAGE=true \
deploy/helm/build-airflow-source-image.sh
```


默认镜像仓库：

```text
ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow
```

脚本执行成功后会输出完整镜像地址，例如：

```text
Airflow image is ready: ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow:3.2.1-source-20260917184440
```

同时会写入镜像变量文件：

```bash
cat /tmp/airflow-source-image-tags.env
```

构建完成后，应确认镜像内前端静态资源是本次构建生成的，而不是旧的 `dist`：

```bash
source /tmp/airflow-source-image-tags.env
docker run --rm "$AIRFLOW_IMAGE" \
  stat -c '%y %n' /opt/airflow/airflow-core/src/airflow/ui/dist/assets/index-*.js
```

## 默认加速源

构建脚本默认使用阿里云 pip 源：

```text
https://mirrors.aliyun.com/pypi/simple
```

同时默认使用阿里云 Debian apt 源。可通过环境变量覆盖：

```bash
PYPI_INDEX_URL="https://mirrors.aliyun.com/pypi/simple" \
PYPI_TRUSTED_HOST="mirrors.aliyun.com" \
UV_INDEX_URL="https://mirrors.aliyun.com/pypi/simple" \
USE_CHINA_APT_MIRROR=true \
deploy/helm/build-airflow-source-image.sh
```

说明：阿里云 PyPI 镜像部分包缺少 `upload-time` 元数据，脚本默认在容器内临时放宽 `uv exclude-newer` 限制；依赖版本仍由 `uv.lock --frozen` 固定。

## 只构建到本地

如只想本地构建测试，不推送镜像：

```bash
AIRFLOW_IMAGE_TAG="3.2.1-source-local-$(date +%Y%m%d%H%M%S)" \
PUSH_IMAGE=false \
deploy/helm/build-airflow-source-image.sh
```

## 发布到 K8s

构建推送成功后，修改 `deploy/helm/baidu-k8s.yaml` 中的镜像 tag：

```yaml
defaultAirflowTag: "新的镜像 tag"

images:
  airflow:
    tag: "新的镜像 tag"
```

然后发布：

```bash
helm upgrade airflow chart -n bigdata -f deploy/helm/baidu-k8s.yaml --skip-schema-validation --timeout 10m
```

验证 rollout：

```bash
kubectl -n bigdata rollout status deploy/airflow-api-server --timeout=5m
kubectl -n bigdata rollout status deploy/airflow-scheduler --timeout=5m
kubectl -n bigdata rollout status deploy/airflow-dag-processor --timeout=5m
kubectl -n bigdata rollout status deploy/airflow-triggerer --timeout=5m
```

查看线上镜像：

```bash
kubectl -n bigdata get deploy airflow-api-server airflow-scheduler airflow-dag-processor airflow-triggerer \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{range .spec.template.spec.containers[*]}{.name}={.image}{" "}{end}{"\n"}{end}'
```
