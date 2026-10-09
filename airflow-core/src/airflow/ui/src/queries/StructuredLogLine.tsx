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
import type { TFunction } from "i18next";

import type { StructuredLogMessage } from "openapi/requests/types.gen";
import { renderStructuredLog } from "src/components/renderStructuredLog";

type Props = {
  datum: string | StructuredLogMessage;
  index: number;
  logLevelFilters?: Array<string>;
  logLink: string;
  showSource?: boolean;
  showTimestamp?: boolean;
  sourceFilters?: Array<string>;
  translate: TFunction;
};

/** Defer expensive ANSI, link, and structured-field rendering until a virtual row is mounted. */
export const StructuredLogLine = (props: Props) =>
  renderStructuredLog({
    index: props.index,
    logLevelFilters: props.logLevelFilters,
    logLink: props.logLink,
    logMessage: props.datum,
    renderingMode: "jsx",
    showSource: props.showSource,
    showTimestamp: props.showTimestamp,
    sourceFilters: props.sourceFilters,
    translate: props.translate,
  });
