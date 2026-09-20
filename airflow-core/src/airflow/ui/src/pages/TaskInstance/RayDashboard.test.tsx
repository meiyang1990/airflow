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
const defaultActorRecords = [
  {
    actor_id: "actor-1",
    actor_ip: "10.0.0.1",
    class_name: "Trainer",
    job_id: "job-id",
    node_id: "node-1",
    state: "ALIVE",
  },
];
let currentActorRecords = defaultActorRecords;

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
    currentActorRecords = defaultActorRecords;
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
                  records: currentActorRecords,
                },
                section: "actors",
                source_status: "ok",
              },
              {
                collected_at: "2026-09-18T09:00:00Z",
                id: "cluster-snapshot-id",
                payload: {
                  records: [
                    {
                      CPU: 42,
                      id: "cluster_resources",
                      memory: 124_554_051_584,
                      "node:192.168.64.3": 1,
                      "node:192.168.65.44": 1,
                      "node:192.168.66.7": 1,
                      object_store_memory: 37_251_599_153,
                      [String("node:__internal_head__")]: 1,
                    },
                    {
                      CPU: 40,
                      id: "available_resources",
                      memory: 120_000_000_000,
                      "node:192.168.64.3": 1,
                      "node:192.168.65.44": 1,
                      "node:192.168.66.7": 1,
                      object_store_memory: 37_000_000_000,
                    },
                  ],
                },
                section: "cluster",
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

    expect(await screen.findByText("Cluster Utilization")).toBeInTheDocument();
    expect(screen.getByText("Recent jobs")).toBeInTheDocument();
    expect(screen.getByText("Cluster status and autoscaler")).toBeInTheDocument();
    expect(screen.getByText("Resource Status")).toBeInTheDocument();
    expect(screen.getByText("CPU (physical)")).toBeInTheDocument();
    expect(screen.getByText("Active Nodes")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("4 nodes").length).toBeGreaterThan(0));
    expect(screen.getByText(/2 \/ 42/u)).toBeInTheDocument();
    expect(screen.getByText(/116 GB/u)).toBeInTheDocument();
    expect(screen.getAllByText("84 %").length).toBeGreaterThan(0);

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

    expect(await screen.findByText("node-1")).toBeInTheDocument();
    expect(screen.getByText("actor-1")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getAllByText("job-id").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ALIVE").length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "node_id" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "actor_id" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "actor_ip" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "state" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "job_id" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "class_name" })).not.toBeInTheDocument();
    expect(screen.queryByText("Trainer")).not.toBeInTheDocument();
    expect(screen.getByText("Actor CPU leaderboard")).toBeInTheDocument();
    expect(screen.getByText("trainer-1")).toBeInTheDocument();
    expect(screen.getByText("91 %")).toBeInTheDocument();
    expect(screen.getByText("Actor memory leaderboard")).toBeInTheDocument();
    expect(screen.getByText("loader-2")).toBeInTheDocument();
    expect(screen.getByText("2 GB")).toBeInTheDocument();
  });

  it("paginates actor records on the client with 50 rows per page", async () => {
    currentActorRecords = Array.from({ length: 51 }, (_, index) => ({
      actor_id: `actor-${index + 1}`,
      actor_ip: `10.0.0.${index + 1}`,
      class_name: "Trainer",
      job_id: "job-id",
      node_id: `node-${index + 1}`,
      state: "ALIVE",
    }));

    render(
      <Wrapper>
        <RayDashboard />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Actors/u }));

    expect(await screen.findByText("actor-50")).toBeInTheDocument();
    expect(screen.queryByText("actor-51")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1-50 of 51 actors")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("actor-table-next"));

    expect(await screen.findByText("actor-51")).toBeInTheDocument();
    expect(screen.queryByText("actor-1")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 51-51 of 51 actors")).toBeInTheDocument();
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

  it("renders cluster node resources in a dedicated nodes table", async () => {
    render(
      <Wrapper>
        <RayDashboard />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Cluster/u }));

    expect(await screen.findByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Nodes")).toBeInTheDocument();
    expect(screen.getByText("cluster_resources")).toBeInTheDocument();
    expect(screen.getByText("object_store_memory")).toBeInTheDocument();
    expect(screen.queryByText("node:192.168.64.3")).not.toBeInTheDocument();
    expect(screen.queryByText("node:__internal_head__")).not.toBeInTheDocument();
    expect(screen.getByText("192.168.64.3")).toBeInTheDocument();
    expect(screen.getByText("192.168.65.44")).toBeInTheDocument();
    expect(screen.getByText("192.168.66.7")).toBeInTheDocument();
    expect(screen.getByText("__internal_head__")).toBeInTheDocument();
  });
});
