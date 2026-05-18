#!/bin/bash
# Airflow Helm Chart 涉及的所有镜像
# 使用 docker pull 命令拉取到本地

set -e

echo "=== 拉取 Airflow 相关镜像 ==="

# Airflow 主镜像（用于 webserver, scheduler, triggerer, dag-processor, api-server, worker, flower, migrations）
docker pull apache/airflow:3.2.0
docker tag apache/airflow:3.2.0 ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow:3.2.0
docker push ccr-2owfeef4-pub.cnc.bj.baidubce.com/airflow/airflow:3.2.0

# StatsD 指标导出器
docker pull quay.io/prometheus/statsd-exporter:v0.29.0

# PgBouncer 连接池
docker pull apache/airflow:airflow-pgbouncer-2025.03.05-1.23.1

# PgBouncer 指标导出器
docker pull apache/airflow:airflow-pgbouncer-exporter-2025.03.05-0.18.0

# Git Sync（DAG 同步）
docker pull registry.k8s.io/git-sync/git-sync:v4.4.2

# Redis（已禁用，按需拉取）
docker pull redis:7.2-bookworm

# PostgreSQL（已禁用，按需拉取）
docker pull bitnamilegacy/postgresql:16.1.0-debian-11-r15

echo ""
echo "=== 所有镜像拉取完成 ==="
