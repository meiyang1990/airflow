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

/* eslint-disable max-lines */

const manyMetricSamples = Array.from({ length: 101 }, (_, index) => ({
  id: `many-sample-${index}`,
  labels: { instance: "worker-1" },
  metric_name: "ray_many_samples",
  sampled_at: new Date(Date.UTC(2026, 8, 18, 9, index, 0)).toISOString(),
  value: index,
}));
const defaultActorRankings = {
  cpu: [
    {
      actor_id: "actor-1",
      actor_key: "actor-1",
      actor_name: "trainer-1",
      class_name: "Trainer",
      labels: { actor_id: "actor-1" },
      metric_name: "ray_actor_cpu_percentage",
      metric_unit: "%",
      sampled_at: "2026-09-18T09:01:00Z",
      state: "ALIVE",
      value: 91,
    },
  ],
  memory: [
    {
      actor_id: "actor-2",
      actor_key: "actor-2",
      actor_name: "loader-2",
      class_name: "Loader",
      labels: { actor_id: "actor-2" },
      metric_name: "ray_actor_memory_used",
      metric_unit: "MiB",
      sampled_at: "2026-09-18T09:02:00Z",
      state: "ALIVE",
      value: 2048,
    },
  ],
};
let currentActorRankings = defaultActorRankings;

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
    currentActorRankings = defaultActorRankings;
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
              collector_metadata: {
                runtime_env: "pip://requirements.txt",
              },
              collector_status: "ok",
              created_at: "2026-09-18T09:00:00Z",
              dag_id: "test-dag",
              id: "dashboard-id",
              map_index: -1,
              ray_cluster_name: "cluster",
              ray_job_id: "job-id",
              ray_namespace: "default",
              ray_submission_id: "raysubmit_84f2",
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
              {
                collected_at: "2026-09-18T09:00:00Z",
                id: "peak-tasks-snapshot-id",
                payload: {
                  tasks: [
                    {
                      name: "TrainShard.map_batches",
                      state: "RUNNING",
                      task_id: "task-1",
                    },
                    {
                      name: "ValidateBatch",
                      state: "FAILED",
                      task_id: "task-2",
                    },
                    {
                      name: "LoadBatch",
                      state: "FINISHED",
                      task_id: "task-3",
                    },
                  ],
                },
                section: "tasks",
                source_status: "ok",
              },
              {
                collected_at: "2026-09-18T09:01:00Z",
                id: "tasks-snapshot-id",
                payload: {
                  tasks: [
                    {
                      name: "TrainShard.map_batches",
                      state: "RUNNING",
                      task_id: "task-1",
                    },
                    {
                      name: "ValidateBatch",
                      state: "FAILED",
                      task_id: "task-2",
                    },
                  ],
                },
                section: "tasks",
                source_status: "ok",
              },
              {
                collected_at: "2026-09-18T09:00:00Z",
                id: "actors-snapshot-id",
                payload: {
                  records: [
                    {
                      actor_id: "actor-1",
                      class_name: "Trainer",
                      state: "ALIVE",
                    },
                  ],
                },
                section: "actors",
                source_status: "ok",
              },
            ],
            total_entries: 1,
          },
        });
      }

      if (url.endsWith("/rayDashboard/actorRankings")) {
        return Promise.resolve({ data: currentActorRankings });
      }

      return Promise.resolve({
        data: {
          samples: [
            {
              id: "cpu-sample-id",
              labels: { instance: "worker-1", JobId: "job-id" },
              metric_name: "ray_node_cpu_utilization",
              metric_unit: "%",
              sampled_at: "2026-09-18T09:00:00Z",
              value: 84,
            },
            {
              id: "latest-cpu-sample-id",
              labels: { instance: "worker-1", JobId: "job-id" },
              metric_name: "ray_node_cpu_utilization",
              metric_unit: "%",
              sampled_at: "2026-09-18T09:01:00Z",
              value: 0,
            },
            {
              id: "object-sample-id",
              labels: { instance: "worker-1", JobId: "job-id" },
              metric_name: "ray_object_store_memory",
              metric_unit: "%",
              sampled_at: "2026-09-18T09:00:00Z",
              value: 68,
            },
            {
              id: "memory-sample-id",
              labels: { instance: "worker-1", JobId: "job-id" },
              metric_name: "ray_node_mem_used",
              metric_unit: "GiB",
              sampled_at: "2026-09-18T09:00:00Z",
              value: 27.8,
            },
            {
              id: "latest-memory-sample-id",
              labels: { instance: "worker-1", JobId: "job-id" },
              metric_name: "ray_node_mem_used",
              metric_unit: "GiB",
              sampled_at: "2026-09-18T09:01:00Z",
              value: 0,
            },
            ...manyMetricSamples,
          ],
          total_entries: 106,
        },
      });
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

    await waitFor(() => expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(4));

    vi.mocked(axios.get).mockClear();
    fireEvent.click(refreshButton);

    await waitFor(() => expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(4));
    expect(vi.mocked(axios.get).mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/rayDashboard"),
        expect.stringContaining("/rayDashboard/actorRankings"),
        expect.stringContaining("/rayDashboard/snapshots"),
        expect.stringContaining("/rayDashboard/metrics"),
      ]),
    );
  });

  it("renders task and metric indicators from Ray dashboard data", async () => {
    render(
      <Wrapper>
        <RayDashboard />
      </Wrapper>,
    );

    expect(await screen.findByText("CPU used")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("84 %").length).toBeGreaterThan(0));
    expect(screen.getAllByText("27.8 GiB").length).toBeGreaterThan(0);
    expect(screen.getAllByText("peak during task run")).toHaveLength(2);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1 finished / 1 running")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Tasks/u }));

    expect(await screen.findByText("Total tasks")).toBeInTheDocument();
    expect(screen.getByText("TrainShard.map_batches")).toBeInTheDocument();
    expect(screen.getByText("ValidateBatch")).toBeInTheDocument();
    expect(screen.getAllByText("FAILED").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Metrics/u }));

    expect(await screen.findByText("CPU utilization")).toBeInTheDocument();
    expect(screen.getAllByText("ray_node_cpu_utilization").length).toBeGreaterThan(0);
    expect(screen.getAllByText("84 %").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ray_object_store_memory").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ray_node_mem_used").length).toBeGreaterThan(0);
    expect(screen.getByText("ray_many_samples")).toBeInTheDocument();
    expect(screen.getByText("100 sampled / 101 samples")).toBeInTheDocument();
  });

  it("renders Ray State API records payloads", async () => {
    render(
      <Wrapper>
        <RayDashboard />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Actors/u }));

    expect(await screen.findByText("Trainer")).toBeInTheDocument();
    expect(screen.getByText("actor-1")).toBeInTheDocument();
    expect(screen.getAllByText("ALIVE").length).toBeGreaterThan(0);
    expect(screen.getByText("Actor CPU leaderboard")).toBeInTheDocument();
    expect(screen.getByText("trainer-1")).toBeInTheDocument();
    expect(screen.getByText("91 %")).toBeInTheDocument();
    expect(screen.getByText("Actor memory leaderboard")).toBeInTheDocument();
    expect(screen.getByText("loader-2")).toBeInTheDocument();
    expect(screen.getByText("2,048 MiB")).toBeInTheDocument();
  });

  it("renders empty actor ranking states", async () => {
    currentActorRankings = { cpu: [], memory: [] };

    render(
      <Wrapper>
        <RayDashboard />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Actors/u }));

    expect(await screen.findByText("暂无 Actor CPU ranking data。")).toBeInTheDocument();
    expect(screen.getByText("暂无 Actor memory ranking data。")).toBeInTheDocument();
    expect(screen.getByText("actor-1")).toBeInTheDocument();
  });
});
