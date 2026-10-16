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
import { describe, expect, it } from "vitest";

import { resolveDialogPrefillConfig, triggerConfigQueryOptions } from "./TriggerDAGModal";

describe("resolveDialogPrefillConfig", () => {
  it("uses saved configuration, including an explicit empty object", () => {
    expect(resolveDialogPrefillConfig(undefined, {})).toEqual({
      conf: {},
      logicalDate: undefined,
      runId: "",
    });
  });

  it("leaves configuration undefined when no shared value exists so Params defaults apply", () => {
    expect(resolveDialogPrefillConfig(undefined, undefined)).toBeUndefined();
  });

  it("keeps an explicitly selected historical configuration ahead of the shared value", () => {
    const historicalConfig = { conf: { source: "historical" }, logicalDate: undefined, runId: "old-run" };

    expect(resolveDialogPrefillConfig(historicalConfig, { source: "shared" })).toBe(historicalConfig);
  });

  it("marks configuration stale so it refetches whenever the dialog opens", () => {
    expect(triggerConfigQueryOptions(true, false)).toEqual({
      enabled: true,
      gcTime: 0,
      refetchOnMount: "always",
      staleTime: 0,
    });
  });
});
