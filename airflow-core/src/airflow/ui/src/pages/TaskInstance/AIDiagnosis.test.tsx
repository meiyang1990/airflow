/*!
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { useParams, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as queries from "openapi/queries";
import { Wrapper } from "src/utils/Wrapper";

import { AIDiagnosis } from "./AIDiagnosis";

vi.mock("axios");
vi.mock("openapi/queries");
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; message?: string }) => {
      const translations: Record<string, string> = {
        "aiDiagnosis.cached": "已缓存",
        "aiDiagnosis.columns.category": "类型",
        "aiDiagnosis.columns.confidence": "置信度",
        "aiDiagnosis.columns.evidence": "日志证据",
        "aiDiagnosis.columns.finding": "诊断结论",
        "aiDiagnosis.columns.suggestion": "修复建议",
        "aiDiagnosis.completedRayOnly": "仅已完成且具有 Ray 数据的任务实例支持 AI 分析。",
        "aiDiagnosis.emptyDescription": "点击 AI 诊断，根据失败日志生成原因分析。",
        "aiDiagnosis.loading": "正在分析任务日志...",
        "aiDiagnosis.logLines": `原始日志 ${options?.count} 行`,
        "aiDiagnosis.resourceAnalysis.advisory": "配置建议仅供参考，不会自动执行。",
        "aiDiagnosis.resourceAnalysis.columns.allocationConcern": "分配问题",
        "aiDiagnosis.resourceAnalysis.columns.dataQuality": "数据质量",
        "aiDiagnosis.resourceAnalysis.columns.evidence": "证据",
        "aiDiagnosis.resourceAnalysis.columns.observation": "使用情况",
        "aiDiagnosis.resourceAnalysis.columns.recommendation": "配置建议",
        "aiDiagnosis.resourceAnalysis.columns.resource": "资源",
        "aiDiagnosis.resourceAnalysis.columns.worker": "Worker",
        "aiDiagnosis.resourceAnalysis.insufficientData": "Ray 资源证据不足，无法给出容量建议。",
        "aiDiagnosis.resourceAnalysis.summary": "Ray 集群资源使用情况分析",
        "aiDiagnosis.resourceAnalysis.unavailable": "此任务尝试没有可用的 Ray Dashboard 数据。",
        "aiDiagnosis.run": "AI诊断",
        "aiDiagnosis.summary": "诊断摘要",
        "aiDiagnosis.title": "AI诊断",
      };

      return translations[key] ?? key;
    },
  }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");

  return {
    ...actual,
    useParams: vi.fn(),
    useSearchParams: vi.fn(),
  };
});

describe("AIDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({
      dagId: "test-dag",
      mapIndex: "-1",
      runId: "test-run",
      taskId: "test-task",
    });
    vi.mocked(useSearchParams).mockReturnValue([
      new URLSearchParams({ try_number: "2" }),
      vi.fn(),
    ] as unknown as ReturnType<typeof useSearchParams>);
    vi.mocked(queries.useTaskInstanceServiceGetMappedTaskInstance).mockReturnValue({
      data: {
        dag_id: "test-dag",
        dag_run_id: "test-run",
        map_index: -1,
        state: "failed",
        task_id: "test-task",
        try_number: 2,
      },
    } as unknown as ReturnType<typeof queries.useTaskInstanceServiceGetMappedTaskInstance>);
    vi.mocked(queries.useTaskInstanceServiceGetMappedTaskInstanceTries).mockReturnValue({
      data: { task_instances: [] },
    } as unknown as ReturnType<typeof queries.useTaskInstanceServiceGetMappedTaskInstanceTries>);
    vi.mocked(queries.useConfigServiceGetConfigs).mockReturnValue({
      data: { auto_refresh_interval: 0 },
    } as unknown as ReturnType<typeof queries.useConfigServiceGetConfigs>);
    vi.mocked(queries.useDagServiceGetDagDetails).mockReturnValue({
      data: { is_paused: false },
    } as unknown as ReturnType<typeof queries.useDagServiceGetDagDetails>);
    vi.mocked(queries.useDagRunServiceGetDagRuns).mockReturnValue({
      data: { dag_runs: [] },
    } as unknown as ReturnType<typeof queries.useDagRunServiceGetDagRuns>);
  });

  it("requests and renders an AI diagnosis for failed task instances", async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({
        data: {
          cached: false,
          created_at: "2026-09-23T08:00:00Z",
          dag_id: "test-dag",
          items: [
            {
              category: "root cause",
              confidence: "high",
              evidence: "Connection timed out",
              finding: "Database timeout",
              suggestion: "Increase timeout or inspect network.",
            },
          ],
          log_line_count: 423,
          map_index: -1,
          model: "diagnosis-model",
          provider: "mcpserver",
          resource_analysis: {
            cached: false,
            items: [
              {
                allocation_concern: "Memory is constrained",
                confidence: "medium",
                data_quality: "complete",
                evidence_ids: ["e-2"],
                observation: "Worker memory is 90% used",
                recommendation: "Increase worker memory allocation.",
                resource: "memory",
                scope: "worker-1",
              },
            ],
            summary: "Worker memory pressure was observed.",
          },
          run_id: "test-run",
          state: "failed",
          summary: "The task failed while connecting to the database.",
          task_id: "test-task",
          try_number: 2,
          updated_at: "2026-09-23T08:00:00Z",
        },
      });

    render(<AIDiagnosis />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /AI诊断/u }));

    await waitFor(() =>
      expect(vi.mocked(axios.get)).toHaveBeenCalledWith(
        "/api/v2/dags/test-dag/dagRuns/test-run/taskInstances/test-task/-1/aiDiagnosis/latest",
      ),
    );
    await waitFor(() =>
      expect(vi.mocked(axios.get)).toHaveBeenCalledWith(
        "/api/v2/dags/test-dag/dagRuns/test-run/taskInstances/test-task/-1/aiDiagnosis",
        { params: { try_number: 2 } },
      ),
    );
    expect(await screen.findByText("The task failed while connecting to the database.")).toBeInTheDocument();
    expect(screen.getByText("Database timeout")).toBeInTheDocument();
    expect(screen.getByText("Connection timed out")).toBeInTheDocument();
    expect(screen.getByText("Increase timeout or inspect network.")).toBeInTheDocument();
    expect(screen.getByText("原始日志 423 行")).toBeInTheDocument();
    expect(screen.getByText("Worker memory pressure was observed.")).toBeInTheDocument();
    expect(screen.getByText("Increase worker memory allocation.")).toBeInTheDocument();
  });

  it("renders existing diagnosis history and hides the diagnosis button", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        cached: true,
        created_at: "2026-09-23T08:00:00Z",
        dag_id: "test-dag",
        items: [
          {
            category: "风险",
            confidence: "中",
            evidence: "May retry repeatedly",
            finding: "可能持续失败",
            suggestion: "确认上游数据。",
          },
          {
            category: "根因",
            confidence: "高",
            evidence: "Missing field",
            finding: "字段缺失",
            suggestion: "补齐字段。",
          },
          {
            category: "证据",
            confidence: "高",
            evidence: "Validation error",
            finding: "校验失败",
            suggestion: "检查输入。",
          },
        ],
        log_line_count: 120,
        map_index: -1,
        model: "diagnosis-model",
        provider: "mcpserver",
        run_id: "test-run",
        state: "failed",
        summary: "已有历史诊断记录。",
        task_id: "test-task",
        try_number: 1,
        updated_at: "2026-09-23T08:00:00Z",
      },
    });

    render(<AIDiagnosis />, { wrapper: Wrapper });

    expect(await screen.findByText("已有历史诊断记录。")).toBeInTheDocument();
    expect(screen.getByText("字段缺失")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "类型诊断结论日志证据修复建议置信度",
      "直接原因校验失败Validation error检查输入。高",
      "核心原因字段缺失Missing field补齐字段。高",
      "风险点可能持续失败May retry repeatedly确认上游数据。中",
    ]);
    expect(screen.queryByRole("button", { name: /AI诊断/u })).not.toBeInTheDocument();
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith(
      "/api/v2/dags/test-dag/dagRuns/test-run/taskInstances/test-task/-1/aiDiagnosis/latest",
    );
  });

  it("requests resource analysis for successful Ray task instances", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        cached: false,
        dag_id: "test-dag",
        items: [],
        map_index: -1,
        resource_analysis: {
          cached: false,
          items: [
            {
              allocation_concern: "CPU is idle",
              confidence: "high",
              data_quality: "complete",
              evidence_ids: ["e-1"],
              observation: "Worker uses 10% CPU",
              recommendation: "Reduce worker CPU allocation.",
              resource: "cpu",
              scope: "worker-1",
            },
          ],
          summary: "Worker CPU is overprovisioned.",
        },
        run_id: "test-run",
        state: "success",
        task_id: "test-task",
        try_number: 2,
      },
    });
    vi.mocked(queries.useTaskInstanceServiceGetMappedTaskInstance).mockReturnValue({
      data: {
        dag_id: "test-dag",
        dag_run_id: "test-run",
        map_index: -1,
        state: "success",
        task_id: "test-task",
        try_number: 2,
      },
    } as unknown as ReturnType<typeof queries.useTaskInstanceServiceGetMappedTaskInstance>);

    render(<AIDiagnosis />, { wrapper: Wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /AI诊断/u }));

    expect(await screen.findByText("Ray 集群资源使用情况分析")).toBeInTheDocument();
    expect(screen.getByText("Worker CPU is overprovisioned.")).toBeInTheDocument();
    expect(screen.getByText("Reduce worker CPU allocation.")).toBeInTheDocument();
    expect(screen.queryByText("失败原因摘要")).not.toBeInTheDocument();
  });

  it("renders independent resource analysis errors without discarding a failed-task diagnosis", async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({
        data: {
          cached: false,
          dag_id: "test-dag",
          items: [
            {
              category: "root cause",
              confidence: "high",
              evidence: "Connection timed out",
              finding: "Database timeout",
              suggestion: "Inspect the connection.",
            },
          ],
          map_index: -1,
          resource_analysis_error: "Ray payload was malformed",
          run_id: "test-run",
          state: "failed",
          summary: "The task failed while connecting to the database.",
          task_id: "test-task",
          try_number: 2,
        },
      });

    render(<AIDiagnosis />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /AI诊断/u }));

    expect(await screen.findByText("Database timeout")).toBeInTheDocument();
    expect(screen.getByText(/Ray payload was malformed/u)).toBeInTheDocument();
  });

  it("renders cached insufficient Ray resource data without a failure diagnosis for successful tasks", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        cached: false,
        dag_id: "test-dag",
        items: [],
        map_index: -1,
        resource_analysis: {
          cached: true,
          items: [],
          summary: "Only one worker sample was retained.",
        },
        run_id: "test-run",
        state: "success",
        task_id: "test-task",
        try_number: 2,
      },
    });
    vi.mocked(queries.useTaskInstanceServiceGetMappedTaskInstance).mockReturnValue({
      data: {
        dag_id: "test-dag",
        dag_run_id: "test-run",
        map_index: -1,
        state: "success",
        task_id: "test-task",
        try_number: 2,
      },
    } as unknown as ReturnType<typeof queries.useTaskInstanceServiceGetMappedTaskInstance>);

    render(<AIDiagnosis />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /AI诊断/u }));

    expect(await screen.findByText("Only one worker sample was retained.")).toBeInTheDocument();
    expect(screen.getByText("已缓存")).toBeInTheDocument();
    expect(screen.getByText("Ray 资源证据不足，无法给出容量建议。")).toBeInTheDocument();
    expect(screen.queryByText("诊断摘要")).not.toBeInTheDocument();
  });
});
