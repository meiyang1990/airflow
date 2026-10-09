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

/* eslint-disable max-lines */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { TaskInstanceService } from "openapi/requests";
import type { TaskInstanceResponse, TaskInstancesLogResponse } from "openapi/requests/types.gen";
import { isStatePending, useAutoRefresh } from "src/utils";

import { parseLogs } from "./useLogs";

export const LOG_PAGE_SIZE = 1000;
export const MAX_RETAINED_LOG_ENTRIES = 5000;

type LogEntry = TaskInstancesLogResponse["content"][number];

type Props = {
  dagId: string;
  enabled?: boolean;
  logLevelFilters?: Array<string>;
  showSource?: boolean;
  showTimestamp?: boolean;
  sourceFilters?: Array<string>;
  taskInstance?: TaskInstanceResponse;
  tryNumber: number;
};

export const usePagedLogs = ({
  dagId,
  enabled: requestedEnabled = true,
  logLevelFilters,
  showSource,
  showTimestamp,
  sourceFilters,
  taskInstance,
  tryNumber,
}: Props) => {
  const { t: translate } = useTranslation("common");
  const refreshInterval = useAutoRefresh({ dagId });
  const [content, setContent] = useState<Array<LogEntry>>([]);
  const [continuationToken, setContinuationToken] = useState<string | null>();
  const [error, setError] = useState<unknown>();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingNewer, setIsLoadingNewer] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>();
  const [previousPageToken, setPreviousPageToken] = useState<string | null>();
  const [wasDiscarded, setWasDiscarded] = useState(false);
  const requestId = useRef(0);
  const dagRunId = taskInstance?.dag_run_id;
  const mapIndex = taskInstance?.map_index;
  const taskId = taskInstance?.task_id;
  const enabled =
    requestedEnabled && dagRunId !== undefined && mapIndex !== undefined && taskId !== undefined;

  const appendContent = useCallback((newContent: Array<LogEntry>) => {
    setContent((current) => {
      const combined = [...current, ...newContent];

      if (combined.length <= MAX_RETAINED_LOG_ENTRIES) {
        return combined;
      }
      setWasDiscarded(true);

      return combined.slice(-MAX_RETAINED_LOG_ENTRIES);
    });
  }, []);

  const requestPage = useCallback(
    (options: { pageToken?: string; tail?: boolean; token?: string }) => {
      if (dagRunId === undefined || mapIndex === undefined || taskId === undefined) {
        return undefined;
      }

      return TaskInstanceService.getLog({
        accept: "application/json",
        dagId,
        dagRunId,
        limit: LOG_PAGE_SIZE,
        mapIndex,
        pageToken: options.pageToken,
        tail: options.tail,
        taskId,
        token: options.token,
        tryNumber,
      });
    },
    [dagId, dagRunId, mapIndex, taskId, tryNumber],
  );

  useEffect(() => {
    requestId.current += 1;
    const currentRequest = requestId.current;

    setContent([]);
    setContinuationToken(undefined);
    setError(undefined);
    setIsLoading(enabled);
    setIsLoadingNewer(false);
    setIsLoadingOlder(false);
    setNextPageToken(undefined);
    setPreviousPageToken(undefined);
    setWasDiscarded(false);

    if (!enabled) {
      return undefined;
    }

    const request = requestPage({ tail: true });

    if (request === undefined) {
      setIsLoading(false);

      return undefined;
    }

    void request
      .then((response) => {
        if (requestId.current !== currentRequest) {
          return;
        }
        setContent(response.content);
        setContinuationToken(response.continuation_token);
        setNextPageToken(response.next_page_token);
        setPreviousPageToken(response.previous_page_token);
      })
      .catch((requestError: unknown) => {
        if (requestId.current === currentRequest) {
          setError(requestError);
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoading(false);
        }
      });

    return () => request.cancel();
  }, [enabled, requestPage]);

  useEffect(() => {
    if (
      refreshInterval === false ||
      continuationToken === undefined ||
      continuationToken === null ||
      !isStatePending(taskInstance?.state)
    ) {
      return undefined;
    }

    const timer = globalThis.setTimeout(() => {
      const currentRequest = requestId.current;
      const request = requestPage({ token: continuationToken });

      void request
        ?.then((response) => {
          if (requestId.current !== currentRequest) {
            return;
          }
          appendContent(response.content);
          setContinuationToken(response.continuation_token);
          setNextPageToken(response.next_page_token);
        })
        .catch((requestError: unknown) => {
          if (requestId.current === currentRequest) {
            setError(requestError);
          }
        });
    }, refreshInterval);

    return () => globalThis.clearTimeout(timer);
  }, [appendContent, continuationToken, refreshInterval, requestPage, taskInstance?.state]);

  const loadOlder = useCallback(() => {
    if (previousPageToken === undefined || previousPageToken === null) {
      return Promise.resolve();
    }
    setIsLoadingOlder(true);
    const currentRequest = requestId.current;
    const request = requestPage({ pageToken: previousPageToken });

    if (request === undefined) {
      setIsLoadingOlder(false);

      return Promise.resolve();
    }

    return request
      .then((response) => {
        if (requestId.current !== currentRequest) {
          return;
        }
        setContent((current) => {
          const combined = [...response.content, ...current];

          if (combined.length > MAX_RETAINED_LOG_ENTRIES) {
            setNextPageToken(response.next_page_token);
            setWasDiscarded(true);

            return combined.slice(0, MAX_RETAINED_LOG_ENTRIES);
          }

          return combined;
        });
        setPreviousPageToken(response.previous_page_token);
      })
      .catch((requestError: unknown) => {
        if (requestId.current === currentRequest) {
          setError(requestError);
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoadingOlder(false);
        }
      });
  }, [previousPageToken, requestPage]);

  const loadNewer = useCallback(() => {
    if (nextPageToken === undefined || nextPageToken === null) {
      return Promise.resolve();
    }
    setIsLoadingNewer(true);
    const currentRequest = requestId.current;
    const request = requestPage({ pageToken: nextPageToken });

    if (request === undefined) {
      setIsLoadingNewer(false);

      return Promise.resolve();
    }

    return request
      .then((response) => {
        if (requestId.current !== currentRequest) {
          return;
        }
        setContent((current) => {
          const combined = [...current, ...response.content];

          if (combined.length > MAX_RETAINED_LOG_ENTRIES) {
            setPreviousPageToken(response.previous_page_token);
            setWasDiscarded(true);

            return combined.slice(-MAX_RETAINED_LOG_ENTRIES);
          }

          return combined;
        });
        setNextPageToken(response.next_page_token);
        setContinuationToken(response.continuation_token);
      })
      .catch((requestError: unknown) => {
        if (requestId.current === currentRequest) {
          setError(requestError);
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoadingNewer(false);
        }
      });
  }, [nextPageToken, requestPage]);

  const parsedData = useMemo(
    () =>
      parseLogs({
        data: content,
        logLevelFilters,
        showSource,
        showTimestamp,
        sourceFilters,
        taskInstance,
        translate,
        tryNumber,
      }),
    [content, logLevelFilters, showSource, showTimestamp, sourceFilters, taskInstance, translate, tryNumber],
  );

  return {
    content,
    error,
    hasMoreNewer: nextPageToken !== undefined && nextPageToken !== null,
    hasMoreOlder: previousPageToken !== undefined && previousPageToken !== null,
    isLoading,
    isLoadingNewer,
    isLoadingOlder,
    loadNewer,
    loadOlder,
    parsedData,
    wasDiscarded,
  };
};
