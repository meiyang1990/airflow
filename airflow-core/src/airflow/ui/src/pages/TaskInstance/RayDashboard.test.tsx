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

const getTimelineSelects = () => {
  const [nodeTypeSelect, metricSelect, podIpSelect] = screen.getAllByRole<HTMLSelectElement>("combobox");

  if (nodeTypeSelect === undefined || metricSelect === undefined || podIpSelect === undefined) {
    throw new Error("Expected Pod metric timeline selects to be rendered");
  }

  return { metricSelect, nodeTypeSelect, podIpSelect };
};

const getSelectOptionValues = (select: HTMLSelectElement) =>
  [...select.options].map((option) => option.value);

const hasChartText = (text: string) =>
  screen.getAllByTestId("mock-chart").some((chart) => chart.textContent.includes(text));

const hasActorAliveTimelineRequest = () =>
  (vi.mocked(axios.get).mock.calls as Array<[string, { params?: Record<string, unknown> }?]>).some(
    ([url, config]) =>
      url.includes("/rayDashboard/actorAliveTimeline") &&
      config?.params?.bucket_seconds === 10 &&
      config.params.try_number === 1,
  );

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
vi.mock("react-chartjs-2", () => ({
  Line: ({ data }: { readonly data: unknown }) => <div data-testid="mock-chart">{JSON.stringify(data)}</div>,
}));
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
    vi.mocked(axios.get).mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
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

      if (url.endsWith("/rayDashboard/actorAliveTimeline")) {
        return Promise.resolve({
          data: {
            bucket_seconds: 10,
            points: [
              {
                sampled_at: "2026-09-18T09:00:00Z",
                value: 25,
              },
              {
                sampled_at: "2026-09-18T09:00:10Z",
                value: 3,
              },
            ],
          },
        });
      }

      if (
        url.endsWith("/rayDashboard/metrics") &&
        config?.params?.metric_name === "ray_actors" &&
        config.params.actor_name === "AlgoOperatorActor"
      ) {
        return Promise.resolve({
          data: {
            samples: [
              {
                actor_name: "AlgoOperatorActor",
                id: "actor-sample-1",
                labels: { ActorName: "AlgoOperatorActor", State: config.params.state },
                metric_name: "ray_actors",
                pod_ip: "10.0.0.1",
                sampled_at: "2026-09-18T09:00:00Z",
                state: config.params.state,
                value: 3,
              },
              {
                actor_name: "AlgoOperatorActor",
                id: "actor-sample-2",
                labels: { ActorName: "AlgoOperatorActor", State: config.params.state },
                metric_name: "ray_actors",
                pod_ip: "10.0.0.2",
                sampled_at: "2026-09-18T09:01:00Z",
                state: config.params.state,
                value: 5,
              },
            ],
            total_entries: 2,
          },
        });
      }

      return Promise.resolve({
        data: {
          samples: [
            {
              id: "cpu-sample-id",
              labels: { instance: "worker-1", JobId: "job-id", node_type: "worker" },
              metric_name: "ray_node_cpu_utilization",
              metric_unit: "%",
              name: "worker",
              pod_ip: "10.0.0.1",
              sampled_at: "2026-09-18T09:00:00Z",
              value: 84,
            },
            {
              id: "latest-cpu-sample-id",
              labels: { instance: "worker-1", JobId: "job-id", node_type: "worker" },
              metric_name: "ray_node_cpu_utilization",
              metric_unit: "%",
              name: "worker",
              pod_ip: "10.0.0.1",
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
              labels: { instance: "worker-1", JobId: "job-id", RayNodeType: "worker" },
              metric_name: "ray_node_mem_used",
              metric_unit: "GiB",
              pod_ip: "10.0.0.1",
              sampled_at: "2026-09-18T09:00:00Z",
              value: 27.8,
            },
            {
              id: "latest-memory-sample-id",
              labels: { instance: "worker-1", JobId: "job-id", RayNodeType: "worker" },
              metric_name: "ray_node_mem_used",
              metric_unit: "GiB",
              pod_ip: "10.0.0.1",
              sampled_at: "2026-09-18T09:01:00Z",
              value: 0,
            },
            {
              id: "disk-sample-id",
              labels: { instance: "worker-1", JobId: "job-id", node_type: "worker" },
              metric_name: "ray_node_disk_usage",
              metric_unit: "bytes",
              pod_ip: "10.0.0.1",
              sampled_at: "2026-09-18T09:00:00Z",
              value: 1_234_567_890,
            },
            {
              id: "active-worker-sample-id",
              labels: { name: "worker" },
              metric_name: "ray_cluster_active_nodes",
              name: "worker",
              sampled_at: "2026-09-18T09:01:00Z",
              value: 4,
            },
            {
              id: "pending-worker-sample-id",
              labels: { name: "worker" },
              metric_name: "ray_cluster_pending_nodes",
              name: "worker",
              sampled_at: "2026-09-18T09:01:00Z",
              value: 2,
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

    await waitFor(() => expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(5));

    vi.mocked(axios.get).mockClear();
    fireEvent.click(refreshButton);

    await waitFor(() => expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(5));
    expect(vi.mocked(axios.get).mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/rayDashboard"),
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

    expect(await screen.findByText("Node Count")).toBeInTheDocument();
    expect(screen.getByText("Recent jobs")).toBeInTheDocument();
    expect(screen.getByText("Cluster status and autoscaler")).toBeInTheDocument();
    expect(screen.getByText("Resource Status")).toBeInTheDocument();
    expect(screen.getByText("active-worker")).toBeInTheDocument();
    expect(screen.getByText("pending-worker")).toBeInTheDocument();
    expect(screen.getByText("Pod metric timeline")).toBeInTheDocument();
    expect(screen.getByText("cpu使用率")).toBeInTheDocument();
    await waitFor(() =>
      expect(getSelectOptionValues(getTimelineSelects().nodeTypeSelect)).toEqual(["head", "worker"]),
    );
    fireEvent.change(getTimelineSelects().nodeTypeSelect, {
      target: { value: "worker" },
    });
    await waitFor(() =>
      expect(getSelectOptionValues(getTimelineSelects().podIpSelect)).toEqual(["all", "10.0.0.1"]),
    );
    fireEvent.change(getTimelineSelects().metricSelect, {
      target: { value: "memory" },
    });
    await waitFor(() =>
      expect(getSelectOptionValues(getTimelineSelects().nodeTypeSelect)).toEqual(["head", "worker"]),
    );
    expect(await screen.findByText("GB")).toBeInTheDocument();
    fireEvent.change(getTimelineSelects().metricSelect, {
      target: { value: "disk" },
    });
    expect(await screen.findByText("GB")).toBeInTheDocument();
    await waitFor(() => expect(hasChartText('"data":[1.15]')).toBe(true));
    expect(screen.queryByText("View all nodes")).not.toBeInTheDocument();
    expect(screen.queryByText("17:55")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("4 nodes").length).toBeGreaterThan(0));
    expect(screen.getByText(/2 \/ 42/u)).toBeInTheDocument();
    expect(screen.getByText(/116 GB/u)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /Tasks/u }));

    expect(await screen.findByText("Total tasks")).toBeInTheDocument();
    expect(screen.getByText("TrainShard.map_batches")).toBeInTheDocument();
    expect(screen.getByText("ValidateBatch")).toBeInTheDocument();
    expect(screen.getAllByText("FAILED").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Metrics/u }));

    expect(await screen.findByText("CPU utilization")).toBeInTheDocument();
    expect(screen.getAllByText("Actors").length).toBeGreaterThan(0);
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("3 alive")).toBeInTheDocument();
    expect(screen.queryByText(/restarting/u)).not.toBeInTheDocument();
    expect(screen.getAllByText("ray_node_cpu_utilization").length).toBeGreaterThan(0);
    expect(screen.getAllByText("84 %").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ray_object_store_memory").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ray_node_mem_used").length).toBeGreaterThan(0);
  });

  it("renders alive actor timeline and queries aggregated actor buckets", async () => {
    render(
      <Wrapper>
        <RayDashboard />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Actors/u }));

    expect(screen.queryByText("Ray job")).not.toBeInTheDocument();
    expect(screen.queryByText("CPU TOTAL")).not.toBeInTheDocument();
    expect(screen.queryByText("MEMORY TOTAL")).not.toBeInTheDocument();

    expect(await screen.findByText("Alive actors over time")).toBeInTheDocument();
    expect(await screen.findByText("2 buckets / 10s")).toBeInTheDocument();
    expect(screen.getByText("actors")).toBeInTheDocument();
    expect(screen.getByText("time")).toBeInTheDocument();
    expect(screen.getByTestId("mock-chart")).toBeInTheDocument();
    await waitFor(() => expect(hasChartText('"data":[25,3]')).toBe(true));

    await waitFor(() => expect(hasActorAliveTimelineRequest()).toBe(true));
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
