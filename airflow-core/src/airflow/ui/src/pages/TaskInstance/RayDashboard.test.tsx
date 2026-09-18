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

import { RayDashboard } from "./RayDashboard";

vi.mock("axios");
vi.mock("openapi/queries");
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");

  return {
    ...actual,
    useParams: vi.fn(),
    useSearchParams: vi.fn(),
  };
});

describe("RayDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({
      dagId: "test-dag",
      mapIndex: "-1",
      runId: "test-run",
      taskId: "test-task",
    });
    vi.mocked(useSearchParams).mockReturnValue([
      new URLSearchParams({ try_number: "1" }),
      vi.fn(),
    ] as unknown as ReturnType<typeof useSearchParams>);
    vi.mocked(queries.useTaskInstanceServiceGetMappedTaskInstance).mockReturnValue({
      data: { try_number: 1 },
    } as unknown as ReturnType<typeof queries.useTaskInstanceServiceGetMappedTaskInstance>);
    vi.mocked(axios.get).mockImplementation((url: string) => {
      if (url.endsWith("/rayDashboard")) {
        return Promise.resolve({
          data: {
            dashboard: {
              collector_status: "ok",
              created_at: "2026-09-18T09:00:00Z",
              dag_id: "test-dag",
              id: "dashboard-id",
              map_index: -1,
              ray_cluster_name: "cluster",
              ray_job_id: "job-id",
              ray_namespace: "default",
              run_id: "test-run",
              status: "running",
              task_id: "test-task",
              try_number: 1,
              updated_at: "2026-09-18T09:00:00Z",
            },
            metrics: [],
            sections: ["overview"],
          },
        });
      }

      if (url.endsWith("/rayDashboard/snapshots")) {
        return Promise.resolve({
          data: {
            snapshots: [
              {
                collected_at: "2026-09-18T09:00:00Z",
                id: "snapshot-id",
                payload: {},
                section: "overview",
                source_status: "ok",
              },
            ],
            total_entries: 1,
          },
        });
      }

      return Promise.resolve({ data: { samples: [], total_entries: 0 } });
    });
  });

  it("keeps primary Ray sections visible when only overview data is published", async () => {
    render(
      <Wrapper>
        <RayDashboard />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /Overview/u })).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /Jobs/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Actors/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tasks/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Metrics/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Logs/u })).toBeInTheDocument();
  });

  it("refetches Ray Dashboard data when refresh is clicked", async () => {
    render(
      <Wrapper>
        <RayDashboard />
      </Wrapper>,
    );

    const refreshButton = await screen.findByRole("button", { name: /Refresh Ray Dashboard/u });

    await waitFor(() => expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(3));

    vi.mocked(axios.get).mockClear();
    fireEvent.click(refreshButton);

    await waitFor(() => expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(3));
    expect(vi.mocked(axios.get).mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/rayDashboard"),
        expect.stringContaining("/rayDashboard/snapshots"),
        expect.stringContaining("/rayDashboard/metrics"),
      ]),
    );
  });
});
