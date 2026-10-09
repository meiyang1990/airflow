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
import { chakra, Box } from "@chakra-ui/react";
import type { UseQueryOptions } from "@tanstack/react-query";
import dayjs from "dayjs";
import type { TFunction } from "i18next";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

import { useTaskInstanceServiceGetLog } from "openapi/queries";
import type { TaskInstanceResponse, TaskInstancesLogResponse } from "openapi/requests/types.gen";
import { isStatePending, useAutoRefresh } from "src/utils";
import { getTaskInstanceLink } from "src/utils/links";
import { parseStreamingLogContent } from "src/utils/logs";

import { StructuredLogLine } from "./StructuredLogLine";

type Props = {
  accept?: "*/*" | "application/json" | "application/x-ndjson";
  dagId: string;
  expanded?: boolean;
  limit?: number;
  logLevelFilters?: Array<string>;
  showSource?: boolean;
  showTimestamp?: boolean;
  sourceFilters?: Array<string>;
  taskInstance?: TaskInstanceResponse;
  tryNumber?: number;
};

type ParseLogsProps = {
  data: Array<TaskInstancesLogResponse["content"][number]>;
  expanded?: boolean;
  logLevelFilters?: Array<string>;
  showSource?: boolean;
  showTimestamp?: boolean;
  sourceFilters?: Array<string>;
  taskInstance?: TaskInstanceResponse;
  translate: TFunction;
  tryNumber: number;
};

const getSource = (datum: Exclude<TaskInstancesLogResponse["content"][number], string>) => {
  const source = datum.logger ?? datum.source;

  return typeof source === "string" ? source : undefined;
};

const isVisibleLogEntry = (
  datum: TaskInstancesLogResponse["content"][number],
  logLevelFilters?: Array<string>,
  sourceFilters?: Array<string>,
) => {
  if (typeof datum === "string") {
    return true;
  }
  const source = getSource(datum);

  if (
    logLevelFilters !== undefined &&
    logLevelFilters.length > 0 &&
    (typeof datum.level !== "string" || !logLevelFilters.includes(datum.level))
  ) {
    return false;
  }

  return !(
    sourceFilters !== undefined &&
    sourceFilters.length > 0 &&
    (source === undefined || !sourceFilters.includes(source))
  );
};

export const parseLogs = ({
  data,
  expanded,
  logLevelFilters,
  showSource,
  showTimestamp,
  sourceFilters,
  taskInstance,
  translate,
  tryNumber,
}: ParseLogsProps) => {
  let warning;
  const sources: Array<string> = [];

  const open = expanded ?? Boolean(globalThis.location.hash);
  const logLink = taskInstance ? `${getTaskInstanceLink(taskInstance)}?try_number=${tryNumber}` : "";

  try {
    let lineNumber = 0;
    const lineNumbers = data.map((datum) => {
      const text = typeof datum === "string" ? datum : datum.event;

      if (text.includes("::group::") || text.includes("::endgroup::")) {
        return undefined;
      }
      const current = lineNumber;

      lineNumber += 1;

      return current;
    });

    const preparedLines = data
      .map((datum, index) => {
        const event = typeof datum === "string" ? datum : datum.event;

        if (typeof datum !== "string") {
          const source = getSource(datum);

          if (source !== undefined && !sources.includes(source)) {
            sources.push(source);
          }
        }

        if (event.includes("::group::") || event.includes("::endgroup::")) {
          return { event, line: <span>{event}</span> };
        }

        if (!isVisibleLogEntry(datum, logLevelFilters, sourceFilters)) {
          return undefined;
        }

        return {
          event,
          line: (
            <StructuredLogLine
              datum={datum}
              index={lineNumbers[index] ?? index}
              key={lineNumbers[index] ?? index}
              logLevelFilters={logLevelFilters}
              logLink={logLink}
              showSource={showSource}
              showTimestamp={showTimestamp}
              sourceFilters={sourceFilters}
              translate={translate}
            />
          ),
        };
      })
      .filter((line) => line !== undefined);

    type Group = { level: number; lines: Array<JSX.Element | "">; name: string };
    const groupStack: Array<Group> = [];
    const parsedLines: Array<JSX.Element | ""> = [];

    preparedLines.forEach(({ event, line }) => {
      if (event.includes("::group::")) {
        const groupName = event.split("::group::")[1] as string;

        groupStack.push({ level: groupStack.length, lines: [], name: groupName });

        return;
      }

      if (event.includes("::endgroup::")) {
        const finishedGroup = groupStack.pop();

        if (finishedGroup) {
          const groupElement = (
            <Box key={finishedGroup.name} mb={2} pl={finishedGroup.level * 2}>
              <chakra.details open={open} w="100%">
                <chakra.summary data-testid={`summary-${finishedGroup.name}`}>
                  <chakra.span color="fg.info" cursor="pointer">
                    {finishedGroup.name}
                  </chakra.span>
                </chakra.summary>
                {finishedGroup.lines}
              </chakra.details>
            </Box>
          );
          const lastGroup = groupStack[groupStack.length - 1];

          if (lastGroup) {
            lastGroup.lines.push(groupElement);
          } else {
            parsedLines.push(groupElement);
          }
        }

        return;
      }

      const currentGroup = groupStack[groupStack.length - 1];

      if (currentGroup) {
        currentGroup.lines.push(line);
      } else {
        parsedLines.push(line);
      }
    });

    while (groupStack.length > 0) {
      const unfinished = groupStack.pop();

      if (unfinished) {
        parsedLines.push(
          <Box key={unfinished.name} mb={2} pl={unfinished.level * 2}>
            {unfinished.lines}
          </Box>,
        );
      }
    }

    return {
      parsedLogs: parsedLines,
      sources,
      warning,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An error occurred.";

    // eslint-disable-next-line no-console
    console.warn(`Error parsing logs: ${errorMessage}`);
    warning = "Unable to show logs. There was an error parsing logs.";

    return { data, warning };
  }
};

// Log truncation is performed in the frontend because the backend
// does not support yet pagination / limits on logs reading endpoint
const truncateData = (data: TaskInstancesLogResponse | undefined, limit?: number) => {
  if (!data?.content || limit === undefined || limit <= 0) {
    return data;
  }

  const streamingContent = parseStreamingLogContent(data);
  const truncatedContent =
    streamingContent.length > limit ? streamingContent.slice(-limit) : streamingContent;

  return {
    ...data,
    content: truncatedContent,
  };
};

export const useLogs = (
  {
    accept = "application/x-ndjson",
    dagId,
    expanded,
    limit,
    logLevelFilters,
    showSource,
    showTimestamp,
    sourceFilters,
    taskInstance,
    tryNumber = 1,
  }: Props,
  options?: Omit<UseQueryOptions<TaskInstancesLogResponse>, "queryFn" | "queryKey">,
) => {
  const { t: translate } = useTranslation("common");
  const refetchInterval = useAutoRefresh({ dagId });

  const { data, ...rest } = useTaskInstanceServiceGetLog(
    {
      accept,
      dagId,
      dagRunId: taskInstance?.dag_run_id ?? "",
      mapIndex: taskInstance?.map_index ?? -1,
      taskId: taskInstance?.task_id ?? "",
      tryNumber,
    },
    undefined,
    {
      enabled: Boolean(taskInstance),
      refetchInterval: (query) =>
        isStatePending(taskInstance?.state) ||
        dayjs(query.state.dataUpdatedAt).isBefore(taskInstance?.end_date)
          ? refetchInterval
          : false,
      ...options,
    },
  );

  const parsedData = parseLogs({
    data: parseStreamingLogContent(truncateData(data, limit)),
    expanded,
    logLevelFilters,
    showSource,
    showTimestamp,
    sourceFilters,
    taskInstance,
    translate,
    tryNumber,
  });

  return { parsedData, ...rest, fetchedData: data };
};
