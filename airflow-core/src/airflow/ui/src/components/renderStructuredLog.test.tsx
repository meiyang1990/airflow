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
import { describe, expect, it } from "vitest";

import { renderStructuredLog } from "./renderStructuredLog";

const translate = ((key: string) => key) as TFunction;

describe("renderStructuredLog", () => {
  it("hides source metadata by default when logs use source and loc fields", () => {
    const rendered = renderStructuredLog({
      index: 0,
      logLink: "",
      logMessage: {
        event: "[config] runtime_env:",
        level: "info",
        loc: "algo_operator_configurable_dag.py:928",
        source: "dags.pipeline.algo_operator_configurable_dag",
        timestamp: "2026-09-18T10:57:14Z",
      },
      renderingMode: "text",
      translate,
    });

    expect(rendered).toBe("[2026-09-18T10:57:14Z] INFO - [config] runtime_env:");
  });

  it("keeps source metadata hidden when source display is requested", () => {
    const rendered = renderStructuredLog({
      index: 0,
      logLink: "",
      logMessage: {
        event: "[config] runtime_env:",
        level: "info",
        loc: "algo_operator_configurable_dag.py:928",
        source: "dags.pipeline.algo_operator_configurable_dag",
        timestamp: "2026-09-18T10:57:14Z",
      },
      renderingMode: "text",
      showSource: true,
      translate,
    });

    expect(rendered).toBe("[2026-09-18T10:57:14Z] INFO - [config] runtime_env:");
  });
});
