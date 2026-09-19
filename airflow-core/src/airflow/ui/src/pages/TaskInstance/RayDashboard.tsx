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
import { Box, Button, Code, Flex, Heading, Link, SimpleGrid, Spinner, Table, Text } from "@chakra-ui/react";
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
import { FiExternalLink, FiRefreshCw } from "react-icons/fi";
import { useParams, useSearchParams } from "react-router-dom";

import { useTaskInstanceServiceGetMappedTaskInstance } from "openapi/queries";
import { OpenAPI } from "openapi/requests/core/OpenAPI";
import { SearchParamsKeys } from "src/constants/searchParams";
import {
  getRayDashboardAvailability,
  type RayDashboardAvailability,
  rayDashboardAvailabilityQueryKey,
} from "src/hooks/useRayDashboardTabs";

/* eslint-disable i18next/no-literal-string, max-lines */
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

type ActorRankingRow = {
  actor_id?: string | null;
  actor_key: string;
  actor_name?: string | null;
  class_name?: string | null;
  labels?: Record<string, unknown> | null;
  metric_name: string;
  metric_unit?: string | null;
  sampled_at: string;
  state?: string | null;
  value: number;
};

type ActorRankings = {
  cpu: Array<ActorRankingRow>;
  memory: Array<ActorRankingRow>;
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
  "records",
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
const TASK_STATE_KEYS = ["state", "status", "task_status", "scheduling_state"];
const ACTOR_STATE_KEYS = ["state", "status", "actor_state"];
const CPU_METRIC_PATTERN = /(?:^|_)(?:cpu|cpus)(?:_|$)|cpu_utilization/u;
const MEMORY_METRIC_PATTERN = /(?:memory|mem)(?:_|$)/u;
const OBJECT_STORE_METRIC_PATTERN = /object_store|object_spill/u;
const TASK_METRIC_PATTERN = /(?:^|_)tasks?(?:_|$)/u;
const THROUGHPUT_METRIC_PATTERN = /throughput|completed_per|tasks_per/u;
const MAX_METRIC_ROWS_PER_NAME = 100;
const MAX_ACTOR_RANKING_ROWS = 20;
const RAY_COLORS = {
  amber: "#f59e0b",
  bg: "light-dark(#edf1f5, #111827)",
  blue: "#3286f4",
  border: "light-dark(#dfe5ec, #374151)",
  green: "#4caf50",
  muted: "light-dark(#657384, #a9b2c3)",
  panel: "light-dark(#ffffff, #1f2937)",
  panelSoft: "light-dark(#f6f8fa, #243044)",
  red: "#ef4444",
  shell: "light-dark(#ffffff, #172033)",
  text: "light-dark(#1f2937, #f3f4f6)",
};
const CHART_COLORS = {
  border: "#d7dce5",
  muted: "#6b7280",
};
const UTC_PLUS_8_TIME_ZONE = "Asia/Shanghai";
const TIME_LIKE_FIELD_PATTERN =
  /(?:^|_)(?:time|timestamp|date|created|updated|started|ended|sampled|collected)(?:_|$)/u;

const PANEL_BORDER = { borderColor: RAY_COLORS.border, borderStyle: "solid", borderWidth: 1 };
const MANUAL_REFRESH_QUERY_OPTIONS = {
  refetchInterval: false,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
} as const;

const SECTION_LABELS: Record<RaySection, string> = {
  actors: "Actors",
  cluster: "Cluster",
  events: "Events",
  jobs: "Jobs",
  logs: "Logs",
  metrics: "Metrics",
  objects: "Objects",
  overview: "Overview",
  placement_groups: "Placement Groups",
  ray_data: "Ray Data",
  serve: "Serve",
  tasks: "Tasks",
};

const PRIMARY_NAV_SECTIONS: Array<RaySection> = [
  "overview",
  "jobs",
  "serve",
  "cluster",
  "actors",
  "tasks",
  "metrics",
  "logs",
];

const RayLogo = () => (
  <Box h="28px" position="relative" w="28px">
    {[
      { left: "2px", top: "10px" },
      { left: "12px", top: "2px" },
      { left: "20px", top: "14px" },
      { left: "10px", top: "20px" },
    ].map((position) => (
      <Box
        bg={RAY_COLORS.blue}
        borderRadius="50%"
        h="7px"
        key={`${position.left}-${position.top}`}
        left={position.left}
        position="absolute"
        top={position.top}
        w="7px"
        zIndex={1}
      />
    ))}
    <Box
      bg={RAY_COLORS.blue}
      h="2px"
      left="8px"
      position="absolute"
      top="9px"
      transform="rotate(-38deg)"
      w="9px"
    />
    <Box
      bg={RAY_COLORS.blue}
      h="2px"
      left="17px"
      position="absolute"
      top="12px"
      transform="rotate(56deg)"
      w="9px"
    />
    <Box
      bg={RAY_COLORS.blue}
      h="2px"
      left="13px"
      position="absolute"
      top="20px"
      transform="rotate(-27deg)"
      w="10px"
    />
  </Box>
);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const renderJson = (value: unknown) => JSON.stringify(value, undefined, 2);

const formatUtcPlus8 = (datetime: string): string => {
  const date = new Date(datetime);

  if (isNaN(date.getTime())) {
    return datetime;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: UTC_PLUS_8_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const partsByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${partsByType.year}-${partsByType.month}-${partsByType.day} ${partsByType.hour}:${partsByType.minute}:${partsByType.second} UTC+8`;
};

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

const formatTableValue = (key: string, value: unknown): string =>
  typeof value === "string" && TIME_LIKE_FIELD_PATTERN.test(key) ? formatUtcPlus8(value) : formatValue(value);

const formatJsonValueForDisplay = (value: unknown, key = ""): unknown => {
  if (typeof value === "string") {
    return TIME_LIKE_FIELD_PATTERN.test(key) ? formatUtcPlus8(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatJsonValueForDisplay(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        formatJsonValueForDisplay(entryValue, entryKey),
      ]),
    );
  }

  return value;
};

const getSectionLabel = (section: string) =>
  section in SECTION_LABELS ? SECTION_LABELS[section as RaySection] : section;

const normalizeStatus = (value?: string | null) =>
  value === undefined || value === null || value === "" ? "-" : value.replaceAll("_", " ").toUpperCase();

const normalizeState = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value.toLowerCase() : undefined;

const getStateFromRow = (row: JsonRecord, keys: Array<string>) =>
  keys.map((key) => normalizeState(row[key])).find((value) => value !== undefined);

const countRowsByState = (rows: Array<JsonRecord>, keys: Array<string>, patterns: Array<RegExp>) =>
  rows.filter((row) => {
    const state = getStateFromRow(row, keys);

    return state !== undefined && patterns.some((pattern) => pattern.test(state));
  }).length;

const getValueByPath = (row: JsonRecord, key: string) =>
  key.split(".").reduce<unknown>((value, pathPart) => (isRecord(value) ? value[pathPart] : undefined), row);

const getNumericField = (row: JsonRecord, keys: Array<string>) =>
  keys.map((key) => getValueByPath(row, key)).find((value): value is number => typeof value === "number");

const sumNumericFields = (rows: Array<JsonRecord>, keys: Array<string>) =>
  rows.reduce((total, row) => total + (getNumericField(row, keys) ?? 0), 0);

const getMetricSamplesByPattern = (samples: Array<MetricSample>, pattern: RegExp) =>
  samples.filter((sample) => pattern.test(sample.metric_name.toLowerCase()));

const getLatestMetricSample = (samples: Array<MetricSample>, pattern: RegExp) =>
  getMetricSamplesByPattern(samples, pattern).sort((left, right) =>
    right.sampled_at.localeCompare(left.sampled_at),
  )[0];

const getPeakMetricSample = (samples: Array<MetricSample>, pattern: RegExp) =>
  getMetricSamplesByPattern(samples, pattern).sort((left, right) => right.value - left.value)[0];

const formatMetricValue = (value: number, unit?: string | null) =>
  `${formatValue(value)}${unit === undefined || unit === null ? "" : ` ${unit}`}`;

const formatMetricSample = (sample: MetricSample | undefined) =>
  sample === undefined
    ? "-"
    : formatMetricValue(sample.value, sample.metric_unit);

const getMetricTrend = (samples: Array<MetricSample>, metricName: string) => {
  const metricSamples = samples
    .filter((sample) => sample.metric_name === metricName)
    .sort((left, right) => left.sampled_at.localeCompare(right.sampled_at));
  const first = metricSamples.at(0);
  const last = metricSamples.at(-1);

  if (first === undefined || last === undefined || first.value === last.value) {
    return "flat";
  }

  return last.value > first.value ? "up" : "down";
};

const getMetricSource = (sample: MetricSample) => {
  const { labels } = sample;

  if (labels === undefined || labels === null) {
    return "-";
  }

  const source = labels.instance ?? labels.node ?? labels.NodeID ?? labels.Component ?? labels.source;

  return formatValue(source);
};

const sortMetricSamplesNewestFirst = (samples: Array<MetricSample>) =>
  [...samples].sort((left, right) => right.sampled_at.localeCompare(left.sampled_at));

const sampleMetricRowsByTime = (samples: Array<MetricSample>, maxRows = MAX_METRIC_ROWS_PER_NAME) => {
  const sortedSamples = sortMetricSamplesNewestFirst(samples);

  if (sortedSamples.length <= maxRows) {
    return sortedSamples;
  }

  const lastIndex = sortedSamples.length - 1;

  return Array.from({ length: maxRows }, (_, index) => {
    const sourceIndex = Math.round((index * lastIndex) / (maxRows - 1));

    return sortedSamples[sourceIndex];
  }).filter((sample): sample is MetricSample => sample !== undefined);
};

const getMetricSampleGroups = (samples: Array<MetricSample>) =>
  Object.entries(
    samples.reduce<Record<string, Array<MetricSample>>>((groups, sample) => {
      const metricSamples = groups[sample.metric_name] ?? [];

      return { ...groups, [sample.metric_name]: [...metricSamples, sample] };
    }, {}),
  ).sort(([leftName, leftSamples], [rightName, rightSamples]) => {
    const leftLatest = sortMetricSamplesNewestFirst(leftSamples)[0]?.sampled_at ?? "";
    const rightLatest = sortMetricSamplesNewestFirst(rightSamples)[0]?.sampled_at ?? "";

    return rightLatest.localeCompare(leftLatest) || leftName.localeCompare(rightName);
  });

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

const getPeakRowsFromSnapshots = (snapshots: Array<Snapshot>, section: RaySection) =>
  snapshots
    .filter((snapshot) => snapshot.section === section)
    .map((snapshot) => getRowsFromPayload(snapshot.payload))
    .sort((left, right) => right.length - left.length)[0] ?? [];

const getJobRows = (dashboard: RayDashboardAvailability["dashboard"], payload: unknown) => {
  const rows = getRowsFromPayload(payload);

  if (rows.length > 0) {
    return rows;
  }

  return [
    {
      dashboard_url: dashboard.dashboard_url,
      entrypoint: dashboard.collector_metadata?.entrypoint,
      job_id: dashboard.ray_job_id,
      namespace: dashboard.ray_namespace,
      status: dashboard.status,
      submission_id: dashboard.ray_submission_id,
      updated_at: dashboard.updated_at,
    },
  ];
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

const SummaryCard = ({
  label,
  meta,
  value,
}: {
  readonly label: string;
  readonly meta?: ReactNode;
  readonly value: ReactNode;
}) => (
  <Box {...PANEL_BORDER} bg={RAY_COLORS.panel} minH="72px" p={2.5}>
    <Text color={RAY_COLORS.muted} fontSize="11px" fontWeight="700" mb={1.5} textTransform="uppercase">
      {label}
    </Text>
    <Text color={RAY_COLORS.text} fontSize="18px" fontWeight="750" lineClamp={2} lineHeight="1.2">
      {value}
    </Text>
    {meta === undefined ? undefined : (
      <Text color={RAY_COLORS.muted} fontSize="11px" mt={1}>
        {meta}
      </Text>
    )}
  </Box>
);

const SectionFrame = ({
  children,
  meta,
  title,
}: {
  readonly children: ReactNode;
  readonly meta?: ReactNode;
  readonly title: string;
}) => (
  <Box {...PANEL_BORDER} bg={RAY_COLORS.panel} p={3}>
    <Flex alignItems="baseline" justifyContent="space-between" mb={2.5} wrap="wrap">
      <Text color={RAY_COLORS.text} fontSize="14px" fontWeight="750">
        {title}
      </Text>
      {meta === undefined ? undefined : (
        <Text color={RAY_COLORS.muted} fontSize="11px">
          {meta}
        </Text>
      )}
    </Flex>
    {children}
  </Box>
);

const StateBreakdown = ({ states }: { readonly states: Record<string, number> }) => (
  <Flex direction="column" gap={2.5}>
    {Object.entries(states).map(([state, count]) => {
      const maxCount = Math.max(...Object.values(states));
      const width = maxCount === 0 ? 0 : Math.max((count / maxCount) * 100, 8);
      const normalizedState = state.toLowerCase();
      const color =
        normalizedState.includes("finish") ||
        normalizedState.includes("success") ||
        normalizedState.includes("alive")
          ? RAY_COLORS.green
          : normalizedState.includes("pending") || normalizedState.includes("retry")
            ? RAY_COLORS.amber
            : normalizedState.includes("fail") ||
                normalizedState.includes("error") ||
                normalizedState.includes("dead")
              ? RAY_COLORS.red
              : RAY_COLORS.blue;

      return (
        <Box
          alignItems="center"
          display="grid"
          gap={2}
          gridTemplateColumns="82px minmax(0, 1fr) 40px"
          key={state}
        >
          <Text color={RAY_COLORS.muted} fontSize="12px" lineHeight="1">
            {state}
          </Text>
          <Box bg={RAY_COLORS.panelSoft} h="8px" overflow="hidden">
            <Box bg={color} h="100%" w={`${width}%`} />
          </Box>
          <Text color={RAY_COLORS.muted} fontSize="12px" lineHeight="1" textAlign="right">
            {count}
          </Text>
        </Box>
      );
    })}
  </Flex>
);

const getStatusColor = (status?: string | null): "amber" | "green" | "muted" | "red" => {
  const normalizedStatus = status?.toLowerCase() ?? "";

  if (
    normalizedStatus.includes("ok") ||
    normalizedStatus.includes("healthy") ||
    normalizedStatus.includes("run")
  ) {
    return "green";
  }

  if (
    normalizedStatus.includes("warn") ||
    normalizedStatus.includes("pending") ||
    normalizedStatus.includes("retry")
  ) {
    return "amber";
  }

  if (
    normalizedStatus.includes("fail") ||
    normalizedStatus.includes("error") ||
    normalizedStatus.includes("dead")
  ) {
    return "red";
  }

  return "muted";
};

const StatusText = ({ value }: { readonly value?: string | null }) => {
  const colorByStatus = {
    amber: RAY_COLORS.amber,
    green: RAY_COLORS.green,
    muted: RAY_COLORS.muted,
    red: RAY_COLORS.red,
  };
  const statusColor = getStatusColor(value);

  return (
    <Text as="span" color={colorByStatus[statusColor]} fontWeight="750">
      {normalizeStatus(value)}
    </Text>
  );
};

const RayBadge = ({
  children,
  kind = "muted",
}: {
  readonly children: ReactNode;
  readonly kind?: "blue" | "green" | "muted";
}) => {
  const palette = {
    blue: {
      bg: "light-dark(#e8f0ff, #13284f)",
      border: "light-dark(#bcd2ff, #315fa8)",
      color: "light-dark(#174ea6, #bfdbfe)",
    },
    green: {
      bg: "light-dark(#e9f8ef, #143322)",
      border: "light-dark(#a8dfbc, #1f6f3e)",
      color: "light-dark(#116329, #86efac)",
    },
    muted: {
      bg: RAY_COLORS.panelSoft,
      border: RAY_COLORS.border,
      color: RAY_COLORS.muted,
    },
  }[kind];

  return (
    <Box
      bg={palette.bg}
      borderColor={palette.border}
      borderStyle="solid"
      borderWidth={1}
      color={palette.color}
      fontSize="11px"
      fontWeight="700"
      lineHeight="1"
      px={1.5}
      py={1.5}
      whiteSpace="nowrap"
    >
      {children}
    </Box>
  );
};

const RayTable = ({ children }: { readonly children: ReactNode }) => (
  <Box overflowX="auto">
    <Table.Root
      css={{
        "& td": {
          borderBottomColor: RAY_COLORS.border,
          color: RAY_COLORS.text,
          fontSize: "12px",
          padding: "9px 8px",
          whiteSpace: "nowrap",
        },
        "& th": {
          borderBottomColor: RAY_COLORS.border,
          color: RAY_COLORS.muted,
          fontSize: "12px",
          fontWeight: "750",
          padding: "9px 8px",
          whiteSpace: "nowrap",
        },
      }}
      size="sm"
    >
      {children}
    </Table.Root>
  </Box>
);

const KeyValueList = ({ rows }: { readonly rows: Array<[string, ReactNode]> }) => (
  <Flex direction="column" gap={0}>
    {rows.map(([label, value]) => (
      <Box
        borderBottomColor={RAY_COLORS.border}
        borderBottomStyle="solid"
        borderBottomWidth={1}
        display="grid"
        gap={2}
        gridTemplateColumns="120px minmax(0, 1fr)"
        key={label}
        py={2}
      >
        <Text color={RAY_COLORS.muted} fontSize="12px" fontWeight="700">
          {label}
        </Text>
        <Text color={RAY_COLORS.text} fontSize="12px" minW={0} overflowWrap="anywhere">
          {value}
        </Text>
      </Box>
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
    return <Text color={RAY_COLORS.muted}>{emptyText}</Text>;
  }

  return (
    <RayTable>
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
                {formatTableValue(column, row[column])}
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </RayTable>
  );
};

const MetricSampleTable = ({
  metricName,
  samples,
}: {
  readonly metricName: string;
  readonly samples: Array<MetricSample>;
}) => {
  const sampledRows = sampleMetricRowsByTime(samples);
  const trend = getMetricTrend(samples, metricName);

  return (
    <Box {...PANEL_BORDER} bg={RAY_COLORS.panelSoft} p={2.5}>
      <Flex alignItems="baseline" justifyContent="space-between" mb={2.5} wrap="wrap">
        <Text color={RAY_COLORS.text} fontSize="13px" fontWeight="750" overflowWrap="anywhere">
          {metricName}
        </Text>
        <Text color={RAY_COLORS.muted} fontSize="11px">
          {sampledRows.length === samples.length
            ? `${formatValue(samples.length)} samples`
            : `${formatValue(sampledRows.length)} sampled / ${formatValue(samples.length)} samples`}
        </Text>
      </Flex>
      <RayTable>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Value</Table.ColumnHeader>
            <Table.ColumnHeader>Sampled At</Table.ColumnHeader>
            <Table.ColumnHeader>Labels</Table.ColumnHeader>
            <Table.ColumnHeader>Source</Table.ColumnHeader>
            <Table.ColumnHeader>Trend</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sampledRows.map((sample) => (
            <Table.Row key={sample.id}>
              <Table.Cell>{formatMetricSample(sample)}</Table.Cell>
              <Table.Cell>{formatUtcPlus8(sample.sampled_at)}</Table.Cell>
              <Table.Cell maxW="320px" overflow="hidden" textOverflow="ellipsis">
                {formatValue(formatJsonValueForDisplay(sample.labels))}
              </Table.Cell>
              <Table.Cell>{getMetricSource(sample)}</Table.Cell>
              <Table.Cell>
                <StatusText value={trend} />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </RayTable>
    </Box>
  );
};

const MetricSampleTables = ({ samples }: { readonly samples: Array<MetricSample> }) => {
  const groups = getMetricSampleGroups(samples);

  return (
    <Flex direction="column" gap={3}>
      {groups.map(([metricName, metricSamples]) => (
        <MetricSampleTable key={metricName} metricName={metricName} samples={metricSamples} />
      ))}
    </Flex>
  );
};

const getActorRankingName = (row: ActorRankingRow) =>
  row.actor_name ?? row.actor_id ?? row.actor_key;

const ActorResourceRankingTable = ({
  emptyText,
  rows,
  title,
}: {
  readonly emptyText: string;
  readonly rows: Array<ActorRankingRow>;
  readonly title: string;
}) => (
  <Box {...PANEL_BORDER} bg={RAY_COLORS.panelSoft} p={2.5}>
    <Flex alignItems="baseline" justifyContent="space-between" mb={2.5} wrap="wrap">
      <Text color={RAY_COLORS.text} fontSize="13px" fontWeight="750">
        {title}
      </Text>
      <Text color={RAY_COLORS.muted} fontSize="11px">
        Top {MAX_ACTOR_RANKING_ROWS}
      </Text>
    </Flex>
    {rows.length === 0 ? (
      <Text color={RAY_COLORS.muted}>{emptyText}</Text>
    ) : (
      <RayTable>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Actor</Table.ColumnHeader>
            <Table.ColumnHeader>Value</Table.ColumnHeader>
            <Table.ColumnHeader>Metric</Table.ColumnHeader>
            <Table.ColumnHeader>Sampled At</Table.ColumnHeader>
            <Table.ColumnHeader>State</Table.ColumnHeader>
            <Table.ColumnHeader>Labels</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.slice(0, MAX_ACTOR_RANKING_ROWS).map((row) => (
            <Table.Row key={`${row.actor_key}-${row.metric_name}-${row.sampled_at}`}>
              <Table.Cell>{getActorRankingName(row)}</Table.Cell>
              <Table.Cell>{formatMetricValue(row.value, row.metric_unit)}</Table.Cell>
              <Table.Cell>{row.metric_name}</Table.Cell>
              <Table.Cell>{formatUtcPlus8(row.sampled_at)}</Table.Cell>
              <Table.Cell>
                <StatusText value={row.state} />
              </Table.Cell>
              <Table.Cell maxW="320px" overflow="hidden" textOverflow="ellipsis">
                {formatValue(formatJsonValueForDisplay(row.labels))}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </RayTable>
    )}
  </Box>
);

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
          Number.NaN,
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
        labels: {
          boxHeight: 3,
          boxWidth: 18,
          color: CHART_COLORS.muted,
          font: {
            size: 12,
          },
        },
        position: "bottom",
      },
      tooltip: {
        callbacks: {
          title: (items) => formatUtcPlus8(String(labels[items[0]?.dataIndex ?? 0] ?? "")),
        },
        intersect: false,
        mode: "index",
      },
    },
    responsive: true,
    scales: {
      x: {
        grid: {
          color: CHART_COLORS.border,
        },
        ticks: {
          callback: (value) => formatUtcPlus8(String(labels[Number(value)] ?? value)),
          color: CHART_COLORS.muted,
          maxRotation: 0,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: CHART_COLORS.border,
        },
        ticks: {
          color: CHART_COLORS.muted,
        },
      },
    },
  };

  return (
    <Box {...PANEL_BORDER} h="226px" p={2} w="100%">
      <Line data={data} options={options} />
    </Box>
  );
};

export const RayDashboard = () => {
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

  const {
    data: availability,
    isFetching: isFetchingAvailability,
    isLoading: isLoadingAvailability,
    refetch: refetchAvailability,
  } = useQuery({
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
    ...MANUAL_REFRESH_QUERY_OPTIONS,
  });

  const {
    data: snapshots,
    isFetching: isFetchingSnapshots,
    refetch: refetchSnapshots,
  } = useQuery({
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
    ...MANUAL_REFRESH_QUERY_OPTIONS,
  });

  const {
    data: metricSamples,
    isFetching: isFetchingMetricSamples,
    refetch: refetchMetricSamples,
  } = useQuery({
    enabled: availability !== undefined && tryNumber !== undefined,
    queryFn: () =>
      axios
        .get<{ samples: Array<MetricSample>; total_entries: number }>(
          `${OpenAPI.BASE}/api/v2/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(
            runId,
          )}/taskInstances/${encodeURIComponent(taskId)}/${parsedMapIndex}/rayDashboard/metrics`,
          {
            params: { limit: 5000, try_number: tryNumber },
          },
        )
        .then((response) => response.data),
    queryKey: ["ray-dashboard-metrics", dagId, runId, taskId, parsedMapIndex, tryNumber],
    ...MANUAL_REFRESH_QUERY_OPTIONS,
  });

  const {
    data: actorRankings,
    isFetching: isFetchingActorRankings,
    refetch: refetchActorRankings,
  } = useQuery({
    enabled: availability !== undefined && tryNumber !== undefined,
    queryFn: () =>
      axios
        .get<ActorRankings>(
          `${OpenAPI.BASE}/api/v2/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(
            runId,
          )}/taskInstances/${encodeURIComponent(taskId)}/${parsedMapIndex}/rayDashboard/actorRankings`,
          {
            params: { try_number: tryNumber },
          },
        )
        .then((response) => response.data),
    queryKey: ["ray-dashboard-actor-rankings", dagId, runId, taskId, parsedMapIndex, tryNumber],
    ...MANUAL_REFRESH_QUERY_OPTIONS,
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
        <Text>正在加载 Ray Dashboard 数据</Text>
      </Flex>
    );
  }

  if (availability?.dashboard === undefined) {
    return (
      <Box p={2}>
        <Heading size="md">暂无 Ray Dashboard 数据</Heading>
        <Text>当前 Task attempt 还没有发布 Ray Dashboard 数据。</Text>
      </Box>
    );
  }

  const { dashboard, sections } = availability;
  const availableSections = SECTION_ORDER.filter((section) => sections.includes(section));
  const activeSection = selectedSection;
  const activeSnapshot = snapshotBySection[activeSection];
  const activeRows = getRowsFromPayload(activeSnapshot?.payload);
  const activeStates = countStates(activeRows);
  const samples = metricSamples?.samples ?? [];
  const metricNames = [...new Set(samples.map((sample) => sample.metric_name))];
  const allSnapshots = snapshots?.snapshots ?? [];
  const taskRows = getRowsFromPayload(snapshotBySection.tasks?.payload);
  const peakTaskRows = getPeakRowsFromSnapshots(allSnapshots, "tasks");
  const actorRows = getRowsFromPayload(snapshotBySection.actors?.payload);
  const jobRows = getJobRows(dashboard, snapshotBySection.jobs?.payload);
  const logRows = getRowsFromPayload(snapshotBySection.logs?.payload);
  const overviewStates = countStates(taskRows.length > 0 ? taskRows : activeRows);
  const overviewTaskRows = peakTaskRows.length > 0 ? peakTaskRows : taskRows;
  const finishedTasks = countRowsByState(overviewTaskRows, TASK_STATE_KEYS, [/finish/u, /success/u, /done/u]);
  const runningTasks = countRowsByState(overviewTaskRows, TASK_STATE_KEYS, [/run/u]);
  const pendingTasks = countRowsByState(taskRows, TASK_STATE_KEYS, [/pending/u, /waiting/u, /sched/u]);
  const failedTasks = countRowsByState(taskRows, TASK_STATE_KEYS, [/fail/u, /error/u]);
  const aliveActors = countRowsByState(actorRows, ACTOR_STATE_KEYS, [/alive/u, /run/u]);
  const restartingActors = countRowsByState(actorRows, ACTOR_STATE_KEYS, [/restart/u, /pending/u]);
  const actorCpu = sumNumericFields(actorRows, ["required_resources.CPU", "num_cpus", "cpus", "cpu"]);
  const cpuSample = getPeakMetricSample(samples, CPU_METRIC_PATTERN);
  const memorySample = getPeakMetricSample(
    samples.filter((sample) => !OBJECT_STORE_METRIC_PATTERN.test(sample.metric_name.toLowerCase())),
    MEMORY_METRIC_PATTERN,
  );
  const objectStoreSample = getLatestMetricSample(samples, OBJECT_STORE_METRIC_PATTERN);
  const taskMetricSample = getLatestMetricSample(samples, TASK_METRIC_PATTERN);
  const throughputSample = getLatestMetricSample(samples, THROUGHPUT_METRIC_PATTERN);
  const navSections = [
    ...PRIMARY_NAV_SECTIONS,
    ...SECTION_ORDER.filter((section) => !PRIMARY_NAV_SECTIONS.includes(section)),
  ];
  const statusColor = getStatusColor(dashboard.status);
  const collectorStatusColor = getStatusColor(dashboard.collector_status);
  const isRefreshing =
    isFetchingAvailability || isFetchingSnapshots || isFetchingMetricSamples || isFetchingActorRankings;
  const hasDedicatedSection = ["actors", "jobs", "metrics", "overview", "tasks"].includes(activeSection);
  const refreshDashboard = async () => {
    await refetchAvailability();
    await Promise.all([refetchSnapshots(), refetchMetricSamples(), refetchActorRankings()]);
  };

  return (
    <Box
      {...PANEL_BORDER}
      bg={RAY_COLORS.bg}
      color={RAY_COLORS.text}
      display="grid"
      gridTemplateColumns={{ base: "1fr", lg: "44px minmax(0, 1fr)" }}
      minH="720px"
    >
      <Flex
        alignItems="center"
        bg={RAY_COLORS.shell}
        borderBottomColor={RAY_COLORS.border}
        borderBottomStyle="solid"
        borderBottomWidth={{ base: 1, lg: 0 }}
        borderRightColor={RAY_COLORS.border}
        borderRightStyle="solid"
        borderRightWidth={{ base: 0, lg: 1 }}
        direction={{ base: "row", lg: "column" }}
        gap={4}
        px={{ base: 3, lg: 0 }}
        py={3}
      >
        <RayLogo />
        <Box bg={RAY_COLORS.blue} h={{ base: "2px", lg: "28px" }} w={{ base: "28px", lg: "2px" }} />
        <Box
          borderColor={RAY_COLORS.border}
          borderRadius="50%"
          borderStyle="solid"
          borderWidth={1}
          h="18px"
          w="18px"
        />
      </Flex>

      <Box minW={0}>
        <Flex
          alignItems={{ base: "flex-start", lg: "center" }}
          bg={RAY_COLORS.shell}
          borderBottomColor={RAY_COLORS.border}
          borderBottomStyle="solid"
          borderBottomWidth={1}
          direction={{ base: "column", lg: "row" }}
          gap={2}
          justifyContent="space-between"
          px={4}
          py={2.5}
        >
          <Flex alignItems="baseline" gap={2.5} minW={0}>
            <Text color={RAY_COLORS.text} fontSize="17px" fontWeight="750" whiteSpace="nowrap">
              Ray Dashboard
            </Text>
            <Text color={RAY_COLORS.muted} fontSize="12px" lineClamp={1} minW={0}>
              {formatValue(dashboard.ray_cluster_name ?? dashboard.ray_cluster_id)} /{" "}
              {formatValue(dashboard.ray_namespace)}
            </Text>
          </Flex>
          <Flex alignItems="center" gap={1.5} wrap="wrap">
            <Button
              aria-label="Refresh Ray Dashboard"
              colorPalette="brand"
              h="28px"
              loading={isRefreshing}
              onClick={() => void refreshDashboard()}
              size="xs"
              variant="outline"
            >
              <FiRefreshCw />
              Refresh
            </Button>
            <RayBadge kind={statusColor === "green" ? "green" : "muted"}>
              {normalizeStatus(dashboard.status)}
            </RayBadge>
            <RayBadge kind={collectorStatusColor === "green" ? "blue" : "muted"}>
              COLLECTOR {normalizeStatus(dashboard.collector_status)}
            </RayBadge>
            <RayBadge>TRY {dashboard.try_number}</RayBadge>
            {dashboard.dashboard_url === undefined || dashboard.dashboard_url === null ? undefined : (
              <Button asChild colorPalette="brand" h="28px" size="xs" variant="outline">
                <Link href={dashboard.dashboard_url} rel="noreferrer" target="_blank">
                  <FiExternalLink />
                  Open
                </Link>
              </Button>
            )}
          </Flex>
        </Flex>

        <Flex
          bg={RAY_COLORS.shell}
          borderBottomColor={RAY_COLORS.border}
          borderBottomStyle="solid"
          borderBottomWidth={1}
          gap={0}
          overflowX="auto"
          px={4}
        >
          {navSections.map((section) => {
            const isActive = activeSection === section;
            const sourceStatus = snapshotBySection[section]?.source_status;
            const sectionStatusColor = getStatusColor(sourceStatus);

            return (
              <Button
                bg="transparent"
                borderBottomColor={isActive ? RAY_COLORS.blue : "transparent"}
                borderBottomStyle="solid"
                borderBottomWidth={2}
                borderRadius={0}
                color={isActive ? RAY_COLORS.blue : RAY_COLORS.text}
                flexShrink={0}
                fontSize="13px"
                fontWeight={isActive ? "700" : "600"}
                h="38px"
                key={section}
                onClick={() => setSelectedSection(section)}
                px={3.5}
                variant="ghost"
              >
                {getSectionLabel(section)}
                <Box
                  bg={
                    sourceStatus === undefined
                      ? RAY_COLORS.border
                      : sectionStatusColor === "amber"
                        ? RAY_COLORS.amber
                        : sectionStatusColor === "red"
                          ? RAY_COLORS.red
                          : RAY_COLORS.green
                  }
                  borderRadius="50%"
                  h="6px"
                  w="6px"
                />
              </Button>
            );
          })}
        </Flex>

        <Box as="main" p={3}>
          <Flex alignItems="center" justifyContent="space-between" mb={3} wrap="wrap">
            <Text color={RAY_COLORS.muted} fontSize="12px">
              Job {formatValue(dashboard.ray_job_id)} / Task {taskId} / updated{" "}
              {formatUtcPlus8(dashboard.updated_at)}
            </Text>
          </Flex>

          <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} gap={2.5} mb={3}>
            <SummaryCard
              label="Ray job"
              meta={formatValue(dashboard.ray_namespace)}
              value={formatValue(dashboard.ray_submission_id ?? dashboard.ray_job_id)}
            />
            <SummaryCard
              label="CPU used"
              meta="peak during task run"
              value={formatMetricSample(cpuSample)}
            />
            <SummaryCard
              label="Memory"
              meta="peak during task run"
              value={formatMetricSample(memorySample)}
            />
            <SummaryCard
              label="Tasks"
              meta={`${finishedTasks} finished / ${runningTasks} running`}
              value={formatValue(overviewTaskRows.length)}
            />
            <SummaryCard
              label="Actors"
              meta={`${aliveActors} alive / ${restartingActors} restarting`}
              value={formatValue(actorRows.length)}
            />
          </SimpleGrid>

          {activeSection === "overview" ? (
            <Box
              display="grid"
              gap={3}
              gridTemplateColumns={{ base: "1fr", xl: "minmax(0, 1.4fr) minmax(300px, 0.8fr)" }}
            >
              <SectionFrame meta="task-owned samples" title="Cluster Utilization">
                {samples.length === 0 ? (
                  <Text color={RAY_COLORS.muted}>暂无 Metrics samples。</Text>
                ) : (
                  <MetricChart samples={samples} />
                )}

                <Flex alignItems="baseline" justifyContent="space-between" mb={2.5} mt={4.5} wrap="wrap">
                  <Text color={RAY_COLORS.text} fontSize="14px" fontWeight="750">
                    Tasks
                  </Text>
                  <Text color={RAY_COLORS.muted} fontSize="11px">
                    Latest task snapshot
                  </Text>
                </Flex>
                <GenericSectionTable emptyText="暂无 Task records。" rows={taskRows} />
              </SectionFrame>

              <Flex direction="column" gap={3}>
                <SectionFrame meta="task-only" title="State breakdown">
                  {Object.keys(overviewStates).length === 0 ? (
                    <Text color={RAY_COLORS.muted}>暂无状态分布。</Text>
                  ) : (
                    <StateBreakdown states={overviewStates} />
                  )}
                </SectionFrame>

                <SectionFrame meta="owned by this job" title="Actors">
                  <GenericSectionTable emptyText="暂无 Actor records。" rows={actorRows} />
                </SectionFrame>

                <SectionFrame meta="sampled from Ray log sources" title="Logs">
                  {logRows.length === 0 ? (
                    <Box
                      bg="light-dark(#111827, #0b1020)"
                      color="#d1d5db"
                      fontFamily="mono"
                      fontSize="12px"
                      lineHeight="1.6"
                      p={2.5}
                    >
                      暂无 Ray log samples
                    </Box>
                  ) : (
                    <GenericSectionTable emptyText="暂无 Ray log samples。" rows={logRows} />
                  )}
                </SectionFrame>
              </Flex>
            </Box>
          ) : undefined}

          {activeSection === "jobs" ? (
            <Box
              display="grid"
              gap={3}
              gridTemplateColumns={{ base: "1fr", xl: "minmax(0, 1.38fr) minmax(300px, 0.82fr)" }}
            >
              <SectionFrame meta="Ray Jobs API snapshot" title="Jobs">
                <SimpleGrid columns={{ base: 1, md: 3 }} gap={2.5} mb={4}>
                  <SummaryCard
                    label="Submission ID"
                    meta="Ray Jobs API"
                    value={formatValue(dashboard.ray_submission_id)}
                  />
                  <SummaryCard
                    label="Status"
                    meta="entrypoint state"
                    value={<StatusText value={dashboard.status} />}
                  />
                  <SummaryCard
                    label="Runtime env"
                    meta="collector metadata"
                    value={formatValue(dashboard.collector_metadata?.runtime_env ?? "-")}
                  />
                </SimpleGrid>
                <GenericSectionTable emptyText="暂无 Job records。" rows={jobRows} />
              </SectionFrame>

              <Flex direction="column" gap={3}>
                <SectionFrame meta="from ray status" title="Ray Status">
                  <KeyValueList
                    rows={[
                      ["Cluster", formatValue(dashboard.ray_cluster_name ?? dashboard.ray_cluster_id)],
                      ["Namespace", formatValue(dashboard.ray_namespace)],
                      ["Job ID", formatValue(dashboard.ray_job_id)],
                      ["Updated", formatUtcPlus8(dashboard.updated_at)],
                    ]}
                  />
                </SectionFrame>
                <SectionFrame meta="published snapshots" title="Availability">
                  <StateBreakdown
                    states={{
                      metrics: samples.length,
                      sections: availableSections.length,
                      snapshots: latestSnapshots.length,
                    }}
                  />
                </SectionFrame>
              </Flex>
            </Box>
          ) : undefined}

          {activeSection === "actors" ? (
            <Box
              display="grid"
              gap={3}
              gridTemplateColumns={{ base: "1fr", xl: "minmax(0, 1.38fr) minmax(300px, 0.82fr)" }}
            >
              <SectionFrame meta="State API actor table" title="Actors">
                <SimpleGrid columns={{ base: 1, md: 3 }} gap={2.5} mb={4}>
                  <SummaryCard
                    label="Actors"
                    meta="owned by this job"
                    value={formatValue(actorRows.length)}
                  />
                  <SummaryCard label="Alive" meta="methods schedulable" value={formatValue(aliveActors)} />
                  <SummaryCard
                    label="Actor CPU"
                    meta="reserved logical CPUs"
                    value={actorCpu === 0 ? "-" : formatValue(actorCpu)}
                  />
                </SimpleGrid>
                <GenericSectionTable emptyText="暂无 Actor records。" rows={actorRows} />
                <Box mt={4}>
                  <Flex direction="column" gap={3}>
                    <ActorResourceRankingTable
                      emptyText="暂无 Actor CPU ranking data。"
                      rows={actorRankings?.cpu ?? []}
                      title="Actor CPU leaderboard"
                    />
                    <ActorResourceRankingTable
                      emptyText="暂无 Actor memory ranking data。"
                      rows={actorRankings?.memory ?? []}
                      title="Actor memory leaderboard"
                    />
                  </Flex>
                </Box>
              </SectionFrame>

              <Flex direction="column" gap={3}>
                <SectionFrame meta="current snapshot" title="Actor state breakdown">
                  {Object.keys(countStates(actorRows)).length === 0 ? (
                    <Text color={RAY_COLORS.muted}>暂无 Actor 状态分布。</Text>
                  ) : (
                    <StateBreakdown states={countStates(actorRows)} />
                  )}
                </SectionFrame>
                <SectionFrame meta="selected actor context" title="Actor details">
                  <KeyValueList
                    rows={[
                      ["Namespace", formatValue(dashboard.ray_namespace)],
                      [
                        "Source Status",
                        <StatusText key="status" value={snapshotBySection.actors?.source_status} />,
                      ],
                      [
                        "Collected At",
                        snapshotBySection.actors?.collected_at === undefined
                          ? "-"
                          : formatUtcPlus8(snapshotBySection.actors.collected_at),
                      ],
                      ["Records", formatValue(actorRows.length)],
                    ]}
                  />
                </SectionFrame>
              </Flex>
            </Box>
          ) : undefined}

          {activeSection === "tasks" ? (
            <Box
              display="grid"
              gap={3}
              gridTemplateColumns={{ base: "1fr", xl: "minmax(0, 1.38fr) minmax(300px, 0.82fr)" }}
            >
              <SectionFrame meta="Latest task and actor-method calls" title="Tasks">
                <SimpleGrid columns={{ base: 1, md: 4 }} gap={2.5} mb={4}>
                  <SummaryCard
                    label="Total tasks"
                    meta="State API snapshot"
                    value={formatValue(taskRows.length)}
                  />
                  <SummaryCard
                    label="Finished"
                    meta="completed task rows"
                    value={formatValue(finishedTasks)}
                  />
                  <SummaryCard label="Running" meta="active task rows" value={formatValue(runningTasks)} />
                  <SummaryCard label="Pending" meta="scheduler wait rows" value={formatValue(pendingTasks)} />
                </SimpleGrid>
                <GenericSectionTable emptyText="暂无 Task records。" rows={taskRows} />
              </SectionFrame>

              <Flex direction="column" gap={3}>
                <SectionFrame meta="task-only" title="Task state breakdown">
                  {Object.keys(countStates(taskRows)).length === 0 ? (
                    <Text color={RAY_COLORS.muted}>暂无 Task 状态分布。</Text>
                  ) : (
                    <StateBreakdown states={countStates(taskRows)} />
                  )}
                </SectionFrame>
                <SectionFrame meta="selected failure context" title="Debug context">
                  <KeyValueList
                    rows={[
                      ["Failed", formatValue(failedTasks)],
                      ["Pending", formatValue(pendingTasks)],
                      ["Object store", formatMetricSample(objectStoreSample)],
                      ["Throughput", formatMetricSample(throughputSample ?? taskMetricSample)],
                    ]}
                  />
                </SectionFrame>
              </Flex>
            </Box>
          ) : undefined}

          {activeSection === "metrics" ? (
            <Box
              display="grid"
              gap={3}
              gridTemplateColumns={{ base: "1fr", xl: "minmax(0, 1.38fr) minmax(300px, 0.82fr)" }}
            >
              <SectionFrame meta="Dashboard agent / Prometheus series" title="System metrics">
                <SimpleGrid columns={{ base: 1, md: 4 }} gap={2.5} mb={4}>
                  <SummaryCard
                    label="CPU utilization"
                    meta={cpuSample?.metric_name}
                    value={formatMetricSample(cpuSample)}
                  />
                  <SummaryCard
                    label="Memory used"
                    meta={memorySample?.metric_name}
                    value={formatMetricSample(memorySample)}
                  />
                  <SummaryCard
                    label="Object store"
                    meta={objectStoreSample?.metric_name}
                    value={formatMetricSample(objectStoreSample)}
                  />
                  <SummaryCard
                    label="Task throughput"
                    meta={throughputSample?.metric_name ?? taskMetricSample?.metric_name}
                    value={formatMetricSample(throughputSample ?? taskMetricSample)}
                  />
                </SimpleGrid>
                {samples.length === 0 ? (
                  <Text color={RAY_COLORS.muted}>暂无 Metrics samples。</Text>
                ) : (
                  <>
                    <MetricChart samples={samples} />
                    <Box mt={4}>
                      <MetricSampleTables samples={samples} />
                    </Box>
                  </>
                )}
              </SectionFrame>

              <Flex direction="column" gap={3}>
                <SectionFrame meta="operator signals" title="Metric signals">
                  <KeyValueList
                    rows={[
                      ["Metric names", formatValue(metricNames.length)],
                      ["Samples", formatValue(samples.length)],
                      ["CPU", formatMetricSample(cpuSample)],
                      ["Object store", formatMetricSample(objectStoreSample)],
                    ]}
                  />
                </SectionFrame>
                <SectionFrame meta="labels from samples" title="Labels">
                  <Text color={RAY_COLORS.muted} fontSize="12px" lineHeight="1.55">
                    Ray metric labels such as SessionName, instance, JobId, actor, task, and component are
                    preserved in the samples table for task-scoped filtering.
                  </Text>
                </SectionFrame>
              </Flex>
            </Box>
          ) : undefined}

          {hasDedicatedSection ? undefined : (
            <SectionFrame meta="Latest published snapshot" title={getSectionLabel(activeSection)}>
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={2.5} mb={4}>
                <SummaryCard label="Records" value={formatValue(activeRows.length)} />
                <SummaryCard
                  label="Source Status"
                  value={<StatusText value={activeSnapshot?.source_status} />}
                />
                <SummaryCard
                  label="Collected At"
                  value={
                    activeSnapshot?.collected_at === undefined
                      ? "-"
                      : formatUtcPlus8(activeSnapshot.collected_at)
                  }
                />
              </SimpleGrid>
              {Object.keys(activeStates).length === 0 ? undefined : (
                <Box mb={4}>
                  <Text color={RAY_COLORS.text} fontSize="15px" fontWeight="750" mb={2.5}>
                    State breakdown
                  </Text>
                  <StateBreakdown states={activeStates} />
                </Box>
              )}
              <GenericSectionTable
                emptyText={`暂无 ${getSectionLabel(activeSection)} records。`}
                rows={activeRows}
              />
              {activeRows.length === 0 && activeSnapshot?.payload !== undefined ? (
                <Code display="block" maxH="280px" mt={4} overflow="auto" p={3} whiteSpace="pre-wrap">
                  {renderJson(formatJsonValueForDisplay(activeSnapshot.payload))}
                </Code>
              ) : undefined}
            </SectionFrame>
          )}
        </Box>
      </Box>
    </Box>
  );
};
