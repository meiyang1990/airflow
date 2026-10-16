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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Wrapper } from "src/utils/Wrapper";

import TriggerDAGForm from "./TriggerDAGForm";

const mutate = vi.fn();
const mutateAsync = vi.fn();

vi.mock("openapi/queries", () => ({
  useDagTriggerConfigServicePutDagTriggerConfig: () => ({
    isPending: false,
    mutate,
    mutateAsync,
  }),
}));

vi.mock("src/queries/useDagParams", () => ({
  useDagParams: (() => {
    const paramsDict = {};

    return () => ({ paramsDict });
  })(),
}));

vi.mock("src/queries/useTogglePause", () => ({
  useTogglePause: () => ({ mutate: vi.fn() }),
}));

vi.mock("./TriggerDAGAdvancedOptions", () => ({
  default: () => undefined,
}));

vi.mock("./TriggerDAGScheduleFields", () => ({
  TriggerDAGScheduleFields: () => undefined,
}));

vi.mock("../ConfigForm", async () => {
  const { createElement } = await import("react");
  const { useParamStore } = await import("src/queries/useParamStore");

  return {
    default: () => {
      const { setConf } = useParamStore();

      return createElement(
        "button",
        {
          "data-testid": "update-json-conf",
          onClick: () => setConf('{"json_conf":{"dag":{"tags":["staged_pipeline"]}}}'),
        },
        "Update JSON configuration",
      );
    },
  };
});

describe("TriggerDAGForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue(undefined);
  });

  it("uses flexible-form edits for saving and triggering when a configuration is prefilled", async () => {
    const onSubmitTrigger = vi.fn();

    render(
      <TriggerDAGForm
        dagDisplayName="Example DAG"
        dagId="example"
        hasSchedule={false}
        isPartitioned={false}
        isPaused={false}
        onClose={vi.fn()}
        onSubmitTrigger={onSubmitTrigger}
        open
        prefillConfig={{
          conf: { json_conf: { dag: { tags: ["algo_operators", "staged_pipeline"] } } },
          logicalDate: undefined,
          runId: "",
        }}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByTestId("update-json-conf"));

    fireEvent.click(screen.getByTestId("save-dag-config"));
    expect(mutate).toHaveBeenCalledWith({
      dagId: "example",
      requestBody: { conf: { json_conf: { dag: { tags: ["staged_pipeline"] } } } },
    });

    fireEvent.click(screen.getByTestId("trigger-dag-submit"));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        dagId: "example",
        requestBody: { conf: { json_conf: { dag: { tags: ["staged_pipeline"] } } } },
      }),
    );
    await waitFor(() =>
      expect(onSubmitTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ conf: '{"json_conf":{"dag":{"tags":["staged_pipeline"]}}}' }),
      ),
    );
  });
});
