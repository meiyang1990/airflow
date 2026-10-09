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
import { Box, Spinner, Text, VStack } from "@chakra-ui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { JSX } from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { ErrorAlert } from "src/components/ErrorAlert";

type Props = {
  readonly error?: unknown;
  readonly height?: string;
  readonly isLoading?: boolean;
  readonly logError?: unknown;
  readonly parsedLogs: Array<JSX.Element | "">;
  readonly warning?: string;
  readonly wrap?: boolean;
};

export const TaskLogContent = ({
  error,
  height = "calc(100vh - 230px)",
  isLoading,
  logError,
  parsedLogs,
  warning,
  wrap = false,
}: Props) => {
  const { t: translate } = useTranslation("common");
  const displayError = error ?? logError;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: parsedLogs.length,
    estimateSize: () => 21,
    getScrollElement: () => scrollRef.current,
    overscan: 20,
  });

  if (isLoading === true) {
    return (
      <VStack align="center" p={4}>
        <Spinner size="sm" />
      </VStack>
    );
  }

  if (displayError !== undefined && displayError !== null) {
    return (
      <Box p={2}>
        <ErrorAlert error={displayError} />
      </Box>
    );
  }

  if (warning !== undefined) {
    return (
      <Box p={2}>
        <Text color="fg.warning">{warning}</Text>
      </Box>
    );
  }

  if (parsedLogs.length === 0) {
    return (
      <Box p={2}>
        <Text color="fg.muted">{translate("noItemsFound", { modelName: "logs" })}</Text>
      </Box>
    );
  }

  return (
    <Box
      fontFamily="mono"
      fontSize="sm"
      height={height}
      lineHeight="1.5"
      maxW="100%"
      overflow="auto"
      ref={scrollRef}
    >
      <Box height={`${virtualizer.getTotalSize()}px`} position="relative" width="100%">
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <Box
            data-index={virtualRow.index}
            key={virtualRow.key}
            left={0}
            overflowWrap={wrap ? "anywhere" : "normal"}
            position="absolute"
            ref={virtualizer.measureElement}
            top={0}
            transform={`translateY(${virtualRow.start}px)`}
            whiteSpace={wrap ? "pre-wrap" : "pre"}
            width="100%"
            wordBreak={wrap ? "break-word" : "normal"}
          >
            {parsedLogs[virtualRow.index]}
          </Box>
        ))}
      </Box>
    </Box>
  );
};
