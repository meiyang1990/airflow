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

const translate = (key: string, options?: { count?: number }) =>
  key === "aiDiagnosis.logLines" ? `${options?.count ?? 0} log lines` : key;

vi.mock("axios");
vi.mock("openapi/queries");
vi.mock("react-i18next", () => ({
  // eslint-disable-next-line id-length
  useTranslation: () => ({ t: translate }),
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
    vi.mocked(axios.get).mockResolvedValue({
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
        run_id: "test-run",
        state: "failed",
        summary: "The task failed while connecting to the database.",
        task_id: "test-task",
        try_number: 2,
        updated_at: "2026-09-23T08:00:00Z",
      },
    });

    render(<AIDiagnosis />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /aiDiagnosis.run/u }));

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
    expect(screen.getByText("423 log lines")).toBeInTheDocument();
  });

  it("does not request a diagnosis for non-failed task instances", () => {
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

    expect(screen.getByRole("button", { name: /aiDiagnosis.run/u })).toBeDisabled();
    expect(screen.getByText("aiDiagnosis.failedOnly")).toBeInTheDocument();
    expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
  });
});
