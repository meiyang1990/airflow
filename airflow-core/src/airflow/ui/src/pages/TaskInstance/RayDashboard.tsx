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
import {
  Badge,
  Box,
  Button,
  Code,
  Flex,
  GridItem,
  Heading,
  Link,
  SimpleGrid,
  Spinner,
  Table,
  Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { FiExternalLink } from "react-icons/fi";
import { useParams, useSearchParams } from "react-router-dom";

import { useTaskInstanceServiceGetMappedTaskInstance } from "openapi/queries";
import { OpenAPI } from "openapi/requests/core/OpenAPI";
import Time from "src/components/Time";
import { SearchParamsKeys } from "src/constants/searchParams";
import {
  getRayDashboardAvailability,
  RAY_DASHBOARD_TAB_LABEL,
  rayDashboardAvailabilityQueryKey,
} from "src/hooks/useRayDashboardTabs";

/* eslint-disable max-lines */
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

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

type RaySection =
  | "actors"
  | "cluster"
  | "events"
  | "jobs"
  | "logs"
  | "metrics"
  | "objects"
  | "overview"
  | "placement_groups"
  | "ray_data"
  | "serve"
  | "tasks";

type JsonRecord = Record<string, unknown>;

const SECTION_ORDER: Array<RaySection> = [
  "overview",
  "jobs",
  "cluster",
  "actors",
  "tasks",
  "placement_groups",
  "objects",
  "metrics",
  "logs",
  "events",
  "serve",
  "ray_data",
];

const TABLE_KEYS = [
  "jobs",
  "tasks",
  "actors",
  "nodes",
  "workers",
  "placement_groups",
  "objects",
  "logs",
  "events",
  "applications",
  "deployments",
  "replicas",
  "datasets",
  "operators",
  "data",
  "results",
  "rows",
];

const STATE_KEYS = ["state", "status", "job_status", "actor_state", "task_status"];
const CARD_BORDER = { borderColor: "border", borderRadius: 4, borderStyle: "solid", borderWidth: 1 };

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const renderJson = (value: unknown) => JSON.stringify(value, undefined, 2);

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    return value;
  }

  return renderJson(value);
};

const getSectionLabelKey = (section: string) => {
  switch (section) {
    case "placement_groups":
      return "rayDashboard.sectionLabels.placementGroups";
    case "ray_data":
      return "rayDashboard.sectionLabels.rayData";
    default:
      return `rayDashboard.sectionLabels.${section}`;
  }
};

const getRowsFromPayload = (payload: unknown): Array<JsonRecord> => {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of TABLE_KEYS) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
};

const countStates = (rows: Array<JsonRecord>) =>
  rows.reduce<Record<string, number>>((counts, row) => {
    const state = STATE_KEYS.map((key) => row[key]).find((value) => typeof value === "string");
    const stateKey = typeof state === "string" && state !== "" ? state : "unknown";

    return { ...counts, [stateKey]: (counts[stateKey] ?? 0) + 1 };
  }, {});

const getTableColumns = (rows: Array<JsonRecord>) => {
  const columns = new Set<string>();

  rows.slice(0, 20).forEach((row) => {
    Object.keys(row)
      .filter((key) => !isRecord(row[key]) && !Array.isArray(row[key]))
      .slice(0, 8)
      .forEach((key) => columns.add(key));
  });

  return [...columns].slice(0, 8);
};

const SummaryCard = ({ label, value }: { readonly label: string; readonly value: ReactNode }) => (
  <Box {...CARD_BORDER} bg="bg.panel" minH="88px" p={3}>
    <Text color="fg.muted" fontSize="xs" fontWeight="semibold" mb={1}>
      {label}
    </Text>
    <Text fontSize="xl" fontWeight="semibold" lineClamp={2}>
      {value}
    </Text>
  </Box>
);

const SectionFrame = ({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description?: string;
  readonly title: string;
}) => (
  <Box {...CARD_BORDER} bg="bg.panel" p={4}>
    <Flex alignItems="baseline" gap={3} mb={3} wrap="wrap">
      <Heading size="md">{title}</Heading>
      {description === undefined ? undefined : (
        <Text color="fg.muted" fontSize="sm">
          {description}
        </Text>
      )}
    </Flex>
    {children}
  </Box>
);

const StateBreakdown = ({ states }: { readonly states: Record<string, number> }) => (
  <Flex gap={2} wrap="wrap">
    {Object.entries(states).map(([state, count]) => (
      <Badge key={state} variant="surface">
        {state}: {count}
      </Badge>
    ))}
  </Flex>
);

const GenericSectionTable = ({
  emptyText,
  rows,
}: {
  readonly emptyText: string;
  readonly rows: Array<JsonRecord>;
}) => {
  const columns = getTableColumns(rows);

  if (rows.length === 0 || columns.length === 0) {
    return <Text color="fg.muted">{emptyText}</Text>;
  }

  return (
    <Box overflowX="auto">
      <Table.Root size="sm" striped>
        <Table.Header>
          <Table.Row>
            {columns.map((column) => (
              <Table.ColumnHeader key={column}>{column}</Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.slice(0, 10).map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Table.Row key={index}>
              {columns.map((column) => (
                <Table.Cell
                  key={column}
                  maxW="280px"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  {formatValue(row[column])}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};

const MetricChart = ({ samples }: { readonly samples: Array<MetricSample> }) => {
  const metricNames = [...new Set(samples.map((sample) => sample.metric_name))].slice(0, 4);
  const labels = [...new Set(samples.map((sample) => sample.sampled_at))].sort();
  const colors = ["#2563eb", "#16a34a", "#d97706", "#7c3aed"];
  const data: ChartData<"line"> = {
    datasets: metricNames.map((metricName, index) => ({
      backgroundColor: `${colors[index] ?? colors[0]}22`,
      borderColor: colors[index] ?? colors[0],
      data: labels.map(
        (label) =>
          samples.find((sample) => sample.metric_name === metricName && sample.sampled_at === label)?.value ??
          null,
      ),
      fill: false,
      label: metricName,
      pointRadius: 2,
      tension: 0.25,
    })),
    labels,
  };
  const options: ChartOptions<"line"> = {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
      },
    },
    responsive: true,
    scales: {
      x: {
        ticks: {
          maxRotation: 0,
        },
      },
      y: {
        beginAtZero: true,
      },
    },
  };

  return (
    <Box h="260px" w="100%">
      <Line data={data} options={options} />
    </Box>
  );
};

export const RayDashboard = () => {
  const { t: translate } = useTranslation(["dag", "common"]);
  const { dagId = "", mapIndex = "-1", runId = "", taskId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [selectedSection, setSelectedSection] = useState<RaySection>("overview");
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
      }).catch((error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return undefined;
        }

        return Promise.reject(error);
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
          `${OpenAPI.BASE}/api/v2/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(
            runId,
          )}/taskInstances/${encodeURIComponent(taskId)}/${parsedMapIndex}/rayDashboard/snapshots`,
          {
            params: { limit: 100, try_number: tryNumber },
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
          `${OpenAPI.BASE}/api/v2/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(
            runId,
          )}/taskInstances/${encodeURIComponent(taskId)}/${parsedMapIndex}/rayDashboard/metrics`,
          {
            params: { limit: 200, try_number: tryNumber },
          },
        )
        .then((response) => response.data),
    queryKey: ["ray-dashboard-metrics", dagId, runId, taskId, parsedMapIndex, tryNumber],
  });

  const latestSnapshots = useMemo(
    () =>
      SECTION_ORDER.map((section) =>
        (snapshots?.snapshots ?? [])
          .filter((snapshot) => snapshot.section === section)
          .sort((left, right) => right.collected_at.localeCompare(left.collected_at))
          .at(0),
      ).filter((snapshot): snapshot is Snapshot => snapshot !== undefined),
    [snapshots?.snapshots],
  );
  const snapshotBySection = useMemo(
    () =>
      Object.fromEntries(latestSnapshots.map((snapshot) => [snapshot.section, snapshot])) as Partial<
        Record<RaySection, Snapshot>
      >,
    [latestSnapshots],
  );

  if (isLoadingAvailability || tryNumber === undefined) {
    return (
      <Flex alignItems="center" gap={2} p={2}>
        <Spinner size="sm" />
        <Text>{translate("rayDashboard.loading")}</Text>
      </Flex>
    );
  }

  if (availability?.dashboard === undefined) {
    return (
      <Box p={2}>
        <Heading size="md">{translate("rayDashboard.emptyTitle")}</Heading>
        <Text>{translate("rayDashboard.emptyDescription")}</Text>
      </Box>
    );
  }

  const { dashboard, sections } = availability;
  const availableSections = SECTION_ORDER.filter((section) => sections.includes(section));
  const activeSection = availableSections.includes(selectedSection)
    ? selectedSection
    : (availableSections[0] ?? "overview");
  const activeSnapshot = snapshotBySection[activeSection];
  const activeRows = getRowsFromPayload(activeSnapshot?.payload);
  const activeStates = countStates(activeRows);
  const samples = metricSamples?.samples ?? [];
  const metricNames = [...new Set(samples.map((sample) => sample.metric_name))];

  return (
    <Box p={2}>
      <Flex alignItems="flex-start" gap={4} justifyContent="space-between" mb={4} wrap="wrap">
        <Box>
          <Flex alignItems="center" gap={2} mb={1} wrap="wrap">
            <Heading size="lg">{RAY_DASHBOARD_TAB_LABEL}</Heading>
            <Badge colorPalette={dashboard.status === "running" ? "green" : "gray"} variant="surface">
              {dashboard.status ?? translate("rayDashboard.unknown")}
            </Badge>
            <Badge variant="surface">{dashboard.collector_status ?? translate("rayDashboard.unknown")}</Badge>
          </Flex>
          <Text color="fg.muted" fontSize="sm">
            {translate("rayDashboard.scopeDescription")}
          </Text>
        </Box>
        {dashboard.dashboard_url === undefined || dashboard.dashboard_url === null ? undefined : (
          <Button asChild colorPalette="blue" size="sm" variant="outline">
            <Link href={dashboard.dashboard_url} rel="noreferrer" target="_blank">
              <FiExternalLink />
              {translate("rayDashboard.openDashboard")}
            </Link>
          </Button>
        )}
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} gap={3} mb={4}>
        <SummaryCard label={translate("rayDashboard.job")} value={formatValue(dashboard.ray_job_id)} />
        <SummaryCard
          label={translate("rayDashboard.cluster")}
          value={formatValue(dashboard.ray_cluster_name ?? dashboard.ray_cluster_id)}
        />
        <SummaryCard
          label={translate("rayDashboard.namespace")}
          value={formatValue(dashboard.ray_namespace)}
        />
        <SummaryCard label={translate("rayDashboard.metricSamples")} value={formatValue(samples.length)} />
        <SummaryCard
          label={translate("rayDashboard.updatedAt")}
          value={<Time datetime={dashboard.updated_at} />}
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 12 }} gap={4}>
        <GridItem colSpan={{ base: 1, lg: 3, xl: 2 }}>
          <Box {...CARD_BORDER} bg="bg.panel" p={2}>
            <Text color="fg.muted" fontSize="xs" fontWeight="semibold" mb={2} px={2}>
              {translate("rayDashboard.sections")}
            </Text>
            <Flex direction="column" gap={1}>
              {availableSections.map((section) => (
                <Button
                  alignItems="center"
                  justifyContent="space-between"
                  key={section}
                  onClick={() => setSelectedSection(section)}
                  size="sm"
                  variant={activeSection === section ? "subtle" : "ghost"}
                >
                  <Text overflow="hidden" textOverflow="ellipsis">
                    {translate(getSectionLabelKey(section))}
                  </Text>
                  {snapshotBySection[section]?.source_status === undefined ? undefined : (
                    <Badge size="sm" variant="surface">
                      {snapshotBySection[section].source_status}
                    </Badge>
                  )}
                </Button>
              ))}
              {availableSections.length === 0 ? (
                <Text color="fg.muted" px={2}>
                  {translate("rayDashboard.noSections")}
                </Text>
              ) : undefined}
            </Flex>
          </Box>
        </GridItem>

        <GridItem colSpan={{ base: 1, lg: 9, xl: 10 }}>
          {activeSection === "overview" ? (
            <SectionFrame
              description={translate("rayDashboard.overviewDescription")}
              title={translate("rayDashboard.sectionLabels.overview")}
            >
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={3} mb={4}>
                <SummaryCard
                  label={translate("rayDashboard.publishedSections")}
                  value={formatValue(availableSections.length)}
                />
                <SummaryCard
                  label={translate("rayDashboard.metricsTracked")}
                  value={formatValue(metricNames.length)}
                />
                <SummaryCard
                  label={translate("common:tryNumber")}
                  value={formatValue(dashboard.try_number)}
                />
              </SimpleGrid>
              {latestSnapshots.length === 0 ? (
                <Text color="fg.muted">{translate("rayDashboard.noSections")}</Text>
              ) : (
                <Table.Root size="sm" striped>
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader>{translate("rayDashboard.section")}</Table.ColumnHeader>
                      <Table.ColumnHeader>{translate("rayDashboard.sourceStatus")}</Table.ColumnHeader>
                      <Table.ColumnHeader>{translate("rayDashboard.collectedAt")}</Table.ColumnHeader>
                      <Table.ColumnHeader>{translate("rayDashboard.sourceError")}</Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {latestSnapshots.map((snapshot) => (
                      <Table.Row key={snapshot.id}>
                        <Table.Cell>{translate(getSectionLabelKey(snapshot.section))}</Table.Cell>
                        <Table.Cell>{snapshot.source_status ?? "-"}</Table.Cell>
                        <Table.Cell>
                          <Time datetime={snapshot.collected_at} />
                        </Table.Cell>
                        <Table.Cell>{snapshot.source_error ?? "-"}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              )}
            </SectionFrame>
          ) : undefined}

          {activeSection === "metrics" ? (
            <SectionFrame
              description={translate("rayDashboard.metricsDescription")}
              title={translate("rayDashboard.sectionLabels.metrics")}
            >
              {samples.length === 0 ? (
                <Text color="fg.muted">{translate("rayDashboard.noMetrics")}</Text>
              ) : (
                <>
                  <MetricChart samples={samples} />
                  <Box mt={4} overflowX="auto">
                    <Table.Root size="sm" striped>
                      <Table.Header>
                        <Table.Row>
                          <Table.ColumnHeader>{translate("rayDashboard.metric")}</Table.ColumnHeader>
                          <Table.ColumnHeader>{translate("rayDashboard.value")}</Table.ColumnHeader>
                          <Table.ColumnHeader>{translate("rayDashboard.sampledAt")}</Table.ColumnHeader>
                          <Table.ColumnHeader>{translate("rayDashboard.labels")}</Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {samples.slice(0, 20).map((sample) => (
                          <Table.Row key={sample.id}>
                            <Table.Cell>{sample.metric_name}</Table.Cell>
                            <Table.Cell>
                              {formatValue(sample.value)}
                              {sample.metric_unit === undefined || sample.metric_unit === null
                                ? undefined
                                : ` ${sample.metric_unit}`}
                            </Table.Cell>
                            <Table.Cell>
                              <Time datetime={sample.sampled_at} />
                            </Table.Cell>
                            <Table.Cell
                              maxW="320px"
                              overflow="hidden"
                              textOverflow="ellipsis"
                              whiteSpace="nowrap"
                            >
                              {formatValue(sample.labels)}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Root>
                  </Box>
                </>
              )}
            </SectionFrame>
          ) : undefined}

          {activeSection !== "overview" && activeSection !== "metrics" ? (
            <SectionFrame
              description={translate("rayDashboard.sectionDescription")}
              title={translate(getSectionLabelKey(activeSection))}
            >
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={3} mb={4}>
                <SummaryCard
                  label={translate("rayDashboard.records")}
                  value={formatValue(activeRows.length)}
                />
                <SummaryCard
                  label={translate("rayDashboard.sourceStatus")}
                  value={formatValue(activeSnapshot?.source_status)}
                />
                <SummaryCard
                  label={translate("rayDashboard.collectedAt")}
                  value={
                    activeSnapshot?.collected_at === undefined ? (
                      "-"
                    ) : (
                      <Time datetime={activeSnapshot.collected_at} />
                    )
                  }
                />
              </SimpleGrid>
              {Object.keys(activeStates).length === 0 ? undefined : (
                <Box mb={4}>
                  <Text color="fg.muted" fontSize="sm" fontWeight="semibold" mb={2}>
                    {translate("rayDashboard.stateBreakdown")}
                  </Text>
                  <StateBreakdown states={activeStates} />
                </Box>
              )}
              <GenericSectionTable emptyText={translate("rayDashboard.noRecords")} rows={activeRows} />
              {activeRows.length === 0 && activeSnapshot?.payload !== undefined ? (
                <Code display="block" maxH="280px" mt={4} overflow="auto" p={3} whiteSpace="pre-wrap">
                  {renderJson(activeSnapshot.payload)}
                </Code>
              ) : undefined}
            </SectionFrame>
          ) : undefined}
        </GridItem>
      </SimpleGrid>
    </Box>
  );
};
