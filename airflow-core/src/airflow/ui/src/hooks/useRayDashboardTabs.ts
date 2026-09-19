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
import { useQuery } from "@tanstack/react-query";
import axios, { type AxiosError } from "axios";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { OpenAPI } from "openapi/requests/core/OpenAPI";
import type { TabItem } from "src/hooks/useRequiredActionTabs";

export const RAY_DASHBOARD_TAB = "ray_dashboard";
export const RAY_DASHBOARD_TAB_LABEL = "Ray Dashboard";

export type RayDashboardAvailability = {
  dashboard: {
    collector_error?: string | null;
    collector_metadata?: Record<string, unknown> | null;
    collector_status?: string | null;
    created_at: string;
    dag_id: string;
    dashboard_url?: string | null;
    id: string;
    map_index: number;
    ray_cluster_id?: string | null;
    ray_cluster_name?: string | null;
    ray_job_id?: string | null;
    ray_namespace?: string | null;
    ray_submission_id?: string | null;
    run_id: string;
    status?: string | null;
    task_id: string;
    try_number: number;
    updated_at: string;
  };
  metrics: Array<string>;
  sections: Array<string>;
};

const isRayDashboardAvailability = (value: unknown): value is RayDashboardAvailability => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { dashboard } = value as { dashboard?: unknown };

  return typeof dashboard === "object" && dashboard !== null;
};

export const rayDashboardAvailabilityQueryKey = ({
  dagId,
  mapIndex,
  runId,
  taskId,
  tryNumber,
}: {
  dagId: string;
  mapIndex: number;
  runId: string;
  taskId: string;
  tryNumber: number | undefined;
}) => ["ray-dashboard-availability", dagId, runId, taskId, mapIndex, tryNumber];

export const getRayDashboardAvailability = async ({
  dagId,
  mapIndex,
  runId,
  taskId,
  tryNumber,
}: {
  dagId: string;
  mapIndex: number;
  runId: string;
  taskId: string;
  tryNumber: number;
}) =>
  axios
    .get<RayDashboardAvailability>(
      `${OpenAPI.BASE}/api/v2/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(
        runId,
      )}/taskInstances/${encodeURIComponent(taskId)}/${mapIndex}/rayDashboard`,
      {
        params: { try_number: tryNumber },
      },
    )
    .then((response) => (isRayDashboardAvailability(response.data) ? response.data : undefined));

const filterRayDashboardTabs = (tabs: Array<TabItem>, hasRayDashboardData: boolean): Array<TabItem> =>
  tabs.filter((tab) => tab.value !== RAY_DASHBOARD_TAB || hasRayDashboardData);

export const useRayDashboardTabs = (
  {
    dagId,
    mapIndex,
    runId,
    taskId,
    tryNumber,
  }: {
    dagId: string;
    mapIndex: number;
    runId: string;
    taskId: string;
    tryNumber?: number;
  },
  tabs: Array<TabItem>,
  options: { enabled?: boolean } = {},
) => {
  const { enabled = true } = options;
  const location = useLocation();
  const navigate = useNavigate();
  const hasRayDashboardTab = tabs.some((tab) => tab.value === RAY_DASHBOARD_TAB);
  const redirectPath =
    Boolean(dagId) && Boolean(runId) && Boolean(taskId)
      ? `/dags/${dagId}/runs/${runId}/tasks/${taskId}${mapIndex >= 0 ? `/mapped/${mapIndex}` : ""}`
      : location.pathname.replace(`/${RAY_DASHBOARD_TAB}`, "");

  const { data, isLoading } = useQuery({
    enabled: enabled && hasRayDashboardTab && tryNumber !== undefined,
    queryFn: () =>
      getRayDashboardAvailability({
        dagId,
        mapIndex,
        runId,
        taskId,
        tryNumber: tryNumber ?? 1,
      }).catch((error: unknown) => {
        if (!axios.isAxiosError(error)) {
          return Promise.reject(error);
        }

        const status = error.response?.status;

        if (status === 404) {
          return undefined;
        }

        if (status !== undefined) {
          (error as { status?: number } & AxiosError).status = status;
        }

        return Promise.reject(error);
      }),
    queryKey: rayDashboardAvailabilityQueryKey({ dagId, mapIndex, runId, taskId, tryNumber }),
    refetchInterval: false,
  });

  const hasRayDashboardData =
    data?.dashboard.dag_id === dagId &&
    data.dashboard.run_id === runId &&
    data.dashboard.task_id === taskId &&
    data.dashboard.map_index === mapIndex &&
    data.dashboard.try_number === tryNumber;

  useEffect(() => {
    if (!hasRayDashboardData && !isLoading && location.pathname.includes(RAY_DASHBOARD_TAB)) {
      void Promise.resolve(navigate(redirectPath));
    }
  }, [hasRayDashboardData, isLoading, location.pathname, navigate, redirectPath]);

  return {
    hasRayDashboardData,
    isLoadingRayDashboard: isLoading,
    rayDashboardAvailability: data,
    tabs: filterRayDashboardTabs(tabs, hasRayDashboardData),
  };
};
