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
import { Badge, Box, Code, Flex, Heading, Link, Spinner, Table, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";

import { useTaskInstanceServiceGetMappedTaskInstance } from "openapi/queries";
import { OpenAPI } from "openapi/requests/core/OpenAPI";
import Time from "src/components/Time";
import { SearchParamsKeys } from "src/constants/searchParams";
import { getRayDashboardAvailability, rayDashboardAvailabilityQueryKey } from "src/hooks/useRayDashboardTabs";

type Snapshot = {
  collected_at: string;
  id: string;
  payload?: unknown;
  section: string;
  source_error?: string | null;
  source_status?: string | null;
};

type MetricSample = {
  id: string;
  labels?: Record<string, unknown> | null;
  metric_name: string;
  metric_unit?: string | null;
  sampled_at: string;
  value: number;
};

const renderJson = (value: unknown) => JSON.stringify(value, undefined, 2);

export const RayDashboard = () => {
  const { t: translate } = useTranslation(["dag", "common"]);
  const { dagId = "", mapIndex = "-1", runId = "", taskId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const parsedMapIndex = parseInt(mapIndex, 10);
  const tryNumberParam = searchParams.get(SearchParamsKeys.TRY_NUMBER);

  const { data: taskInstance } = useTaskInstanceServiceGetMappedTaskInstance(
    {
      dagId,
      dagRunId: runId,
      mapIndex: parsedMapIndex,
      taskId,
    },
    undefined,
    {
      enabled: !isNaN(parsedMapIndex),
    },
  );
  const tryNumber = tryNumberParam === null ? taskInstance?.try_number : parseInt(tryNumberParam, 10);

  const { data: availability, isLoading: isLoadingAvailability } = useQuery({
    enabled: tryNumber !== undefined,
    queryFn: () =>
      getRayDashboardAvailability({
        dagId,
        mapIndex: parsedMapIndex,
        runId,
        taskId,
        tryNumber: tryNumber ?? 1,
      }),
    queryKey: rayDashboardAvailabilityQueryKey({
      dagId,
      mapIndex: parsedMapIndex,
      runId,
      taskId,
      tryNumber,
    }),
  });

  const { data: snapshots } = useQuery({
    enabled: availability !== undefined && tryNumber !== undefined,
    queryFn: () =>
      axios
        .get<{ snapshots: Array<Snapshot>; total_entries: number }>(
          `${OpenAPI.BASE}/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(
            runId,
          )}/taskInstances/${encodeURIComponent(taskId)}/${parsedMapIndex}/rayDashboard/snapshots`,
          {
            params: { limit: 20, try_number: tryNumber },
          },
        )
        .then((response) => response.data),
    queryKey: ["ray-dashboard-snapshots", dagId, runId, taskId, parsedMapIndex, tryNumber],
  });

  const { data: metricSamples } = useQuery({
    enabled: availability !== undefined && tryNumber !== undefined,
    queryFn: () =>
      axios
        .get<{ samples: Array<MetricSample>; total_entries: number }>(
          `${OpenAPI.BASE}/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(
            runId,
          )}/taskInstances/${encodeURIComponent(taskId)}/${parsedMapIndex}/rayDashboard/metrics`,
          {
            params: { limit: 50, try_number: tryNumber },
          },
        )
        .then((response) => response.data),
    queryKey: ["ray-dashboard-metrics", dagId, runId, taskId, parsedMapIndex, tryNumber],
  });

  if (isLoadingAvailability || tryNumber === undefined) {
    return (
      <Flex alignItems="center" gap={2} p={2}>
        <Spinner size="sm" />
        <Text>{translate("rayDashboard.loading")}</Text>
      </Flex>
    );
  }

  if (availability === undefined) {
    return (
      <Box p={2}>
        <Heading size="md">{translate("rayDashboard.emptyTitle")}</Heading>
        <Text>{translate("rayDashboard.emptyDescription")}</Text>
      </Box>
    );
  }

  const { dashboard, sections } = availability;

  return (
    <Box p={2}>
      <Flex alignItems="center" justifyContent="space-between" mb={4}>
        <Heading size="lg">{translate("tabs.rayDashboard")}</Heading>
        {dashboard.dashboard_url === undefined || dashboard.dashboard_url === null ? undefined : (
          <Link color="blue.500" href={dashboard.dashboard_url} rel="noreferrer" target="_blank">
            {translate("rayDashboard.openDashboard")}
          </Link>
        )}
      </Flex>

      <Table.Root mb={4} striped>
        <Table.Body>
          {[
            [translate("rayDashboard.status"), dashboard.status],
            [translate("rayDashboard.collectorStatus"), dashboard.collector_status],
            [translate("rayDashboard.cluster"), dashboard.ray_cluster_name ?? dashboard.ray_cluster_id],
            [translate("rayDashboard.namespace"), dashboard.ray_namespace],
            [translate("rayDashboard.job"), dashboard.ray_job_id],
            [translate("rayDashboard.submission"), dashboard.ray_submission_id],
            [translate("common:tryNumber"), dashboard.try_number],
          ].map(([label, value]) => (
            <Table.Row key={label}>
              <Table.Cell>{label}</Table.Cell>
              <Table.Cell>{value ?? "-"}</Table.Cell>
            </Table.Row>
          ))}
          <Table.Row>
            <Table.Cell>{translate("rayDashboard.updatedAt")}</Table.Cell>
            <Table.Cell>
              <Time datetime={dashboard.updated_at} />
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>

      <Heading mb={2} size="md">
        {translate("rayDashboard.sections")}
      </Heading>
      <Flex gap={2} mb={4} wrap="wrap">
        {sections.map((section) => (
          <Badge key={section}>{section}</Badge>
        ))}
        {sections.length === 0 ? <Text>{translate("rayDashboard.noSections")}</Text> : undefined}
      </Flex>

      <Heading mb={2} size="md">
        {translate("rayDashboard.latestSnapshots")}
      </Heading>
      <Table.Root mb={4} striped>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{translate("rayDashboard.section")}</Table.ColumnHeader>
            <Table.ColumnHeader>{translate("rayDashboard.sourceStatus")}</Table.ColumnHeader>
            <Table.ColumnHeader>{translate("rayDashboard.collectedAt")}</Table.ColumnHeader>
            <Table.ColumnHeader>{translate("rayDashboard.payload")}</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {(snapshots?.snapshots ?? []).map((snapshot) => (
            <Table.Row key={snapshot.id}>
              <Table.Cell>{snapshot.section}</Table.Cell>
              <Table.Cell>{snapshot.source_status ?? "-"}</Table.Cell>
              <Table.Cell>
                <Time datetime={snapshot.collected_at} />
              </Table.Cell>
              <Table.Cell>
                <Code display="block" maxH="160px" overflow="auto" p={2} whiteSpace="pre-wrap">
                  {renderJson(snapshot.payload)}
                </Code>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      <Heading mb={2} size="md">
        {translate("rayDashboard.metricSamples")}
      </Heading>
      <Table.Root striped>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{translate("rayDashboard.metric")}</Table.ColumnHeader>
            <Table.ColumnHeader>{translate("rayDashboard.value")}</Table.ColumnHeader>
            <Table.ColumnHeader>{translate("rayDashboard.sampledAt")}</Table.ColumnHeader>
            <Table.ColumnHeader>{translate("rayDashboard.labels")}</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {(metricSamples?.samples ?? []).map((sample) => (
            <Table.Row key={sample.id}>
              <Table.Cell>{sample.metric_name}</Table.Cell>
              <Table.Cell>
                {sample.value}
                {sample.metric_unit === undefined || sample.metric_unit === null
                  ? undefined
                  : ` ${sample.metric_unit}`}
              </Table.Cell>
              <Table.Cell>
                <Time datetime={sample.sampled_at} />
              </Table.Cell>
              <Table.Cell>
                <Code display="block" maxH="120px" overflow="auto" p={2} whiteSpace="pre-wrap">
                  {renderJson(sample.labels)}
                </Code>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};
