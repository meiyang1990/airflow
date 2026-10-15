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
import { describe, expect, it, vi } from "vitest";

import { persistConfigurationBeforeTrigger } from "./triggerConfiguration";

describe("persistConfigurationBeforeTrigger", () => {
  it("persists the configuration before triggering", async () => {
    const saveConfig = vi.fn().mockResolvedValue(undefined);
    const onPersisted = vi.fn();

    await persistConfigurationBeforeTrigger({
      conf: '{"environment":"staging"}',
      dagId: "example",
      onPersisted,
      saveConfig,
    });

    expect(saveConfig).toHaveBeenCalledWith({
      dagId: "example",
      requestBody: { conf: { environment: "staging" } },
    });
    expect(onPersisted).toHaveBeenCalledOnce();
    expect(saveConfig.mock.invocationCallOrder[0]!).toBeLessThan(onPersisted.mock.invocationCallOrder[0]!);
  });

  it("does not trigger when configuration persistence fails", async () => {
    const saveConfig = vi.fn().mockRejectedValue(new Error("save failed"));
    const onPersisted = vi.fn();

    await persistConfigurationBeforeTrigger({
      conf: '{"environment":"staging"}',
      dagId: "example",
      onPersisted,
      saveConfig,
    });

    expect(onPersisted).not.toHaveBeenCalled();
  });
});
