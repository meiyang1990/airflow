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
import { Badge, Box, Button, Flex, Heading, HStack, Spinner, Table, Text, VStack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCpu } from "react-icons/fi";
import { useParams, useSearchParams } from "react-router-dom";

import { useTaskInstanceServiceGetMappedTaskInstance } from "openapi/queries";
import { OpenAPI } from "openapi/requests/core/OpenAPI";
import { TaskTrySelect } from "src/components/TaskTrySelect";
import { Alert } from "src/components/ui";
import { SearchParamsKeys } from "src/constants/searchParams";
import { isStatePending, useAutoRefresh } from "src/utils";

type AIDiagnosisItem = {
  category: string;
  confidence: string;
  evidence: string;
  finding: string;
  suggestion: string;
};

type AIDiagnosisResponse = {
  cached: boolean;
  created_at: string;
  dag_id: string;
  items: Array<AIDiagnosisItem>;
  log_line_count: number;
  map_index: number;
  model?: string | null;
  provider?: string | null;
  request_id?: string | null;
  run_id: string;
  state?: string | null;
  summary: string;
  task_id: string;
  try_number: number;
  updated_at: string;
};

const diagnosisQueryKey = ({
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
}) => ["task-instance-ai-diagnosis", dagId, runId, taskId, mapIndex, tryNumber];

const getAIDiagnosis = async ({
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
    .get<AIDiagnosisResponse>(
      `${OpenAPI.BASE}/api/v2/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(
        runId,
      )}/taskInstances/${encodeURIComponent(taskId)}/${mapIndex}/aiDiagnosis`,
      { params: { try_number: tryNumber } },
    )
    .then((response) => response.data);

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;

    return typeof detail === "string" ? detail : error.message;
  }

  return error instanceof Error ? error.message : "Unknown error";
};

export const AIDiagnosis = () => {
  const { t: translate } = useTranslation(["dag", "common"]);
  const { dagId = "", mapIndex = "-1", runId = "", taskId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hasRequestedDiagnosis, setHasRequestedDiagnosis] = useState(false);
  const parsedMapIndex = parseInt(mapIndex, 10);
  const refetchInterval = useAutoRefresh({ dagId });

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
      refetchInterval: (taskInstanceQuery) =>
        isStatePending(taskInstanceQuery.state.data?.state) ? refetchInterval : false,
    },
  );

  const tryNumberParam = searchParams.get(SearchParamsKeys.TRY_NUMBER);
  const tryNumber = tryNumberParam === null ? taskInstance?.try_number : parseInt(tryNumberParam, 10);
  const isFailed = taskInstance?.state === "failed";
  const canDiagnose = isFailed && tryNumber !== undefined && !isNaN(parsedMapIndex);

  const onSelectTryNumber = (newTryNumber: number) => {
    if (newTryNumber === taskInstance?.try_number) {
      searchParams.delete(SearchParamsKeys.TRY_NUMBER);
    } else {
      searchParams.set(SearchParamsKeys.TRY_NUMBER, newTryNumber.toString());
    }
    setSearchParams(searchParams);
    setHasRequestedDiagnosis(false);
  };

  const aiDiagnosisQuery = useQuery({
    enabled: false,
    queryFn: () =>
      getAIDiagnosis({
        dagId,
        mapIndex: parsedMapIndex,
        runId,
        taskId,
        tryNumber: tryNumber ?? 1,
      }),
    queryKey: diagnosisQueryKey({ dagId, mapIndex: parsedMapIndex, runId, taskId, tryNumber }),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const rows = useMemo(() => aiDiagnosisQuery.data?.items ?? [], [aiDiagnosisQuery.data]);

  return (
    <Box bg="bg" p={3}>
      <Flex alignItems="flex-start" gap={3} justifyContent="space-between" mb={4}>
        <VStack align="flex-start" gap={2}>
          <Heading size="md">{translate("aiDiagnosis.title")}</Heading>
          {taskInstance === undefined ? (
            <Text color="fg.muted">
              {translate("common:noItemsFound", { modelName: translate("common:taskInstance_one") })}
            </Text>
          ) : (
            <TaskTrySelect
              onSelectTryNumber={onSelectTryNumber}
              selectedTryNumber={tryNumber}
              taskInstance={taskInstance}
            />
          )}
        </VStack>
        <HStack gap={2}>
          {aiDiagnosisQuery.data?.cached === true ? (
            <Badge colorPalette="blue">{translate("aiDiagnosis.cached")}</Badge>
          ) : undefined}
          <Button
            colorPalette="brand"
            disabled={!canDiagnose || aiDiagnosisQuery.isFetching}
            onClick={() => {
              setHasRequestedDiagnosis(true);
              void aiDiagnosisQuery.refetch();
            }}
            size="sm"
          >
            {aiDiagnosisQuery.isFetching ? <Spinner size="xs" /> : <FiCpu />}
            {translate("aiDiagnosis.run")}
          </Button>
        </HStack>
      </Flex>

      {!isFailed && taskInstance !== undefined ? (
        <Alert status="info">{translate("aiDiagnosis.failedOnly")}</Alert>
      ) : undefined}

      {aiDiagnosisQuery.isError ? (
        <Alert status="error">
          {translate("aiDiagnosis.error", { message: getErrorMessage(aiDiagnosisQuery.error) })}
        </Alert>
      ) : undefined}

      {aiDiagnosisQuery.isFetching ? (
        <HStack color="fg.muted" gap={2} p={3}>
          <Spinner size="sm" />
          <Text>{translate("aiDiagnosis.loading")}</Text>
        </HStack>
      ) : undefined}

      {aiDiagnosisQuery.data === undefined && !hasRequestedDiagnosis && isFailed ? (
        <Text color="fg.muted">{translate("aiDiagnosis.emptyDescription")}</Text>
      ) : undefined}

      {aiDiagnosisQuery.data === undefined ? undefined : (
        <VStack align="stretch" gap={4}>
          <Box borderColor="border" borderWidth={1} p={3}>
            <HStack justify="space-between" mb={2}>
              <Heading size="sm">{translate("aiDiagnosis.summary")}</Heading>
              <Text color="fg.muted" fontSize="sm">
                {translate("aiDiagnosis.logLines", { count: aiDiagnosisQuery.data.log_line_count })}
              </Text>
            </HStack>
            <Text>{aiDiagnosisQuery.data.summary}</Text>
            {(aiDiagnosisQuery.data.model ?? "") === "" ? undefined : (
              <Text color="fg.muted" fontSize="sm" mt={2}>
                {(aiDiagnosisQuery.data.provider ?? "") === "" ? "" : `${aiDiagnosisQuery.data.provider} / `}
                {aiDiagnosisQuery.data.model}
              </Text>
            )}
          </Box>

          <Box borderColor="border" borderWidth={1} overflowX="auto">
            <Table.Root size="sm" striped>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>{translate("aiDiagnosis.columns.category")}</Table.ColumnHeader>
                  <Table.ColumnHeader>{translate("aiDiagnosis.columns.finding")}</Table.ColumnHeader>
                  <Table.ColumnHeader>{translate("aiDiagnosis.columns.evidence")}</Table.ColumnHeader>
                  <Table.ColumnHeader>{translate("aiDiagnosis.columns.suggestion")}</Table.ColumnHeader>
                  <Table.ColumnHeader>{translate("aiDiagnosis.columns.confidence")}</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={5}>
                      <Text color="fg.muted">{translate("aiDiagnosis.noItems")}</Text>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  rows.map((item) => (
                    <Table.Row key={`${item.category}-${item.finding}-${item.evidence}`}>
                      <Table.Cell minW="100px">
                        <Badge colorPalette="gray">{item.category}</Badge>
                      </Table.Cell>
                      <Table.Cell minW="220px">{item.finding}</Table.Cell>
                      <Table.Cell fontFamily="mono" minW="280px" whiteSpace="pre-wrap">
                        {item.evidence}
                      </Table.Cell>
                      <Table.Cell minW="260px">{item.suggestion}</Table.Cell>
                      <Table.Cell minW="90px">
                        <Badge colorPalette="blue">{item.confidence}</Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
        </VStack>
      )}
    </Box>
  );
};
