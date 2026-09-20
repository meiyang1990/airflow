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
import { Box, createListCollection, Flex, IconButton, Switch, Text } from "@chakra-ui/react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiDownload, FiMaximize2, FiMinimize2, FiSettings } from "react-icons/fi";
import { useParams, useSearchParams } from "react-router-dom";

import { useTaskInstanceServiceGetMappedTaskInstance } from "openapi/queries";
import { TaskTrySelect } from "src/components/TaskTrySelect";
import { ClipboardIconButton, ClipboardRoot, Popover, Select, Tooltip } from "src/components/ui";
import { SearchParamsKeys } from "src/constants/searchParams";
import { useLogs } from "src/queries/useLogs";
import { isStatePending, useAutoRefresh } from "src/utils";
import { LogLevel, logLevelOptions, parseStreamingLogContent } from "src/utils/logs";

import { TaskLogContent } from "./TaskLogContent";

const ALL_LOG_LEVELS = "all";
const ALL_LOG_SOURCES = "all";

const stringifyLogDatum = (datum: ReturnType<typeof parseStreamingLogContent>[number]) => {
  if (typeof datum === "string") {
    return datum;
  }

  if ("event" in datum && typeof datum.event === "string") {
    return datum.event;
  }

  return JSON.stringify(datum);
};

export const Logs = () => {
  const { t: translate } = useTranslation(["dag", "common", "components"]);
  const { dagId = "", mapIndex = "-1", runId = "", taskId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedLogLevels, setSelectedLogLevels] = useState([LogLevel.INFO]);
  const [selectedSources, setSelectedSources] = useState([ALL_LOG_SOURCES]);
  const [showSource, setShowSource] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const parsedMapIndex = parseInt(mapIndex, 10);
  const refetchInterval = useAutoRefresh({ dagId });

  const { data: taskInstance, error: taskInstanceError } = useTaskInstanceServiceGetMappedTaskInstance(
    {
      dagId,
      dagRunId: runId,
      mapIndex: parsedMapIndex,
      taskId,
    },
    undefined,
    {
      enabled: !isNaN(parsedMapIndex),
      refetchInterval: (query) => (isStatePending(query.state.data?.state) ? refetchInterval : false),
    },
  );

  const tryNumberParam = searchParams.get(SearchParamsKeys.TRY_NUMBER);
  const tryNumber = tryNumberParam === null ? taskInstance?.try_number : parseInt(tryNumberParam, 10);

  const onSelectTryNumber = (newTryNumber: number) => {
    if (newTryNumber === taskInstance?.try_number) {
      searchParams.delete(SearchParamsKeys.TRY_NUMBER);
    } else {
      searchParams.set(SearchParamsKeys.TRY_NUMBER, newTryNumber.toString());
    }
    setSearchParams(searchParams);
  };

  const {
    error,
    fetchedData,
    isLoading,
    parsedData: data,
  } = useLogs({
    dagId,
    logLevelFilters: selectedLogLevels.includes(ALL_LOG_LEVELS) ? undefined : selectedLogLevels,
    showSource,
    showTimestamp,
    sourceFilters: selectedSources.includes(ALL_LOG_SOURCES) ? undefined : selectedSources,
    taskInstance,
    tryNumber: tryNumber ?? 1,
  });

  const sourceOptions = useMemo(
    () =>
      createListCollection({
        items: [
          { label: translate("dag:logs.allSources"), value: ALL_LOG_SOURCES },
          ...(data.sources ?? []).map((source) => ({ label: source, value: source })),
        ],
      }),
    [data.sources, translate],
  );

  const rawLogText = useMemo(
    () => parseStreamingLogContent(fetchedData).map(stringifyLogDatum).join("\n"),
    [fetchedData],
  );

  const downloadLogs = () => {
    if (rawLogText.length === 0) {
      return;
    }

    const blob = new Blob([rawLogText], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = `${dagId}-${taskId}-try-${tryNumber ?? 1}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setIsFullscreen(false);

      return;
    }

    await logsContainerRef.current?.requestFullscreen();
    setIsFullscreen(true);
  };

  return (
    <Box bg="bg" p={2} ref={logsContainerRef}>
      <Flex alignItems="center" gap={4} justifyContent="space-between" mb={3}>
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
      </Flex>
      <Flex alignItems="center" borderBottomWidth={1} gap={3} justifyContent="space-between" pb={2}>
        <Select.Root
          collection={logLevelOptions}
          onValueChange={(details) => setSelectedLogLevels(details.value)}
          value={selectedLogLevels}
          width="240px"
        >
          <Select.Trigger>
            <Select.ValueText>
              {(items: Array<{ label?: string }>) => translate(items[0]?.label ?? "dag:logs.allLevels")}
            </Select.ValueText>
          </Select.Trigger>
          <Select.Content>
            {logLevelOptions.items.map((option) => (
              <Select.Item item={option} key={option.value}>
                {translate(option.label)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Select.Root
          collection={sourceOptions}
          onValueChange={(details) => setSelectedSources(details.value)}
          value={selectedSources}
          width="320px"
        >
          <Select.Trigger>
            <Select.ValueText placeholder={translate("dag:logs.allSources")} />
          </Select.Trigger>
          <Select.Content>
            {sourceOptions.items.map((option) => (
              <Select.Item item={option} key={option.value}>
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Flex gap={1} ml="auto">
          <Popover.Root>
            <Tooltip content={translate("dag:logs.settings")}>
              <Popover.Trigger asChild>
                <IconButton aria-label={translate("dag:logs.settings")} size="sm" variant="ghost">
                  <FiSettings />
                </IconButton>
              </Popover.Trigger>
            </Tooltip>
            <Popover.Content p={4} width="240px">
              <Flex direction="column" gap={3}>
                <Switch.Root checked={wrap} onCheckedChange={(details) => setWrap(details.checked)}>
                  <Switch.HiddenInput />
                  <Switch.Control />
                  <Switch.Label>{translate(wrap ? "common:wrap.unwrap" : "common:wrap.wrap")}</Switch.Label>
                </Switch.Root>
                <Switch.Root
                  checked={showTimestamp}
                  onCheckedChange={(details) => setShowTimestamp(details.checked)}
                >
                  <Switch.HiddenInput />
                  <Switch.Control />
                  <Switch.Label>
                    {translate(showTimestamp ? "common:timestamp.hide" : "common:timestamp.show")}
                  </Switch.Label>
                </Switch.Root>
                <Switch.Root
                  checked={showSource}
                  onCheckedChange={(details) => setShowSource(details.checked)}
                >
                  <Switch.HiddenInput />
                  <Switch.Control />
                  <Switch.Label>
                    {translate(showSource ? "common:source.hide" : "common:source.show")}
                  </Switch.Label>
                </Switch.Root>
              </Flex>
            </Popover.Content>
          </Popover.Root>
          <Tooltip content={translate("dag:logs.fullscreen.tooltip", { hotkey: "f" })}>
            <IconButton
              aria-label={translate("dag:logs.fullscreen.button")}
              onClick={() => void toggleFullscreen()}
              size="sm"
              variant="ghost"
            >
              {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
            </IconButton>
          </Tooltip>
          <ClipboardRoot value={rawLogText}>
            <Tooltip content={translate("components:clipboard.copy")}>
              <ClipboardIconButton disabled={rawLogText.length === 0} size="sm" variant="ghost" />
            </Tooltip>
          </ClipboardRoot>
          <Tooltip content={translate("common:download.tooltip", { hotkey: "d" })}>
            <IconButton
              aria-label={translate("common:download.download")}
              disabled={rawLogText.length === 0}
              onClick={downloadLogs}
              size="sm"
              variant="ghost"
            >
              <FiDownload />
            </IconButton>
          </Tooltip>
        </Flex>
      </Flex>
      <TaskLogContent
        error={taskInstanceError ?? error}
        isLoading={isLoading}
        logError={error}
        parsedLogs={data.parsedLogs ?? []}
        warning={data.warning}
        wrap={wrap}
      />
    </Box>
  );
};
