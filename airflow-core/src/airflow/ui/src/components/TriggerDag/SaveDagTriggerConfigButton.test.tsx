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
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  UseDagTriggerConfigServiceGetDagTriggerConfigKeyFn,
  useDagTriggerConfigServicePutDagTriggerConfig,
} from "openapi/queries";
import { Wrapper } from "src/utils/Wrapper";

import { SaveDagTriggerConfigButton } from "./SaveDagTriggerConfigButton";

vi.mock("openapi/queries");

const mutate = vi.fn();

describe("SaveDagTriggerConfigButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(UseDagTriggerConfigServiceGetDagTriggerConfigKeyFn).mockReturnValue(["trigger-config"]);
    vi.mocked(useDagTriggerConfigServicePutDagTriggerConfig).mockReturnValue({
      isPending: false,
      mutate,
    } as unknown as ReturnType<typeof useDagTriggerConfigServicePutDagTriggerConfig>);
  });

  it("persists a valid JSON object", () => {
    render(
      <Wrapper>
        <SaveDagTriggerConfigButton conf='{"environment":"staging"}' dagId="example" disabled={false} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId("save-dag-config"));

    expect(mutate).toHaveBeenCalledWith({
      dagId: "example",
      requestBody: { conf: { environment: "staging" } },
    });
  });

  it("disables saving invalid JSON without issuing a mutation", () => {
    render(
      <Wrapper>
        <SaveDagTriggerConfigButton conf="{" dagId="example" disabled={false} />
      </Wrapper>,
    );

    expect(screen.getByTestId("save-dag-config")).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });
});
