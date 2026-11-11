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
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DagService } from "openapi/requests/services.gen";
import { toaster } from "src/components/ui";
import { BaseWrapper } from "src/utils/Wrapper";

import { DeleteDagButton } from "./DeleteDagButton";

vi.mock("openapi/requests/services.gen", () => ({ DagService: { deleteDag: vi.fn() } }));

// Exercise the actual mutation and confirmation flow, including server failures.
describe("DeleteDagButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(toaster, "create").mockImplementation(() => "toast");
  });

  const openDialog = () => {
    render(
      <BaseWrapper>
        <MemoryRouter>
          <DeleteDagButton dagDisplayName="Permanent DAG" dagId="permanent_dag" />
        </MemoryRouter>
      </BaseWrapper>,
    );
    fireEvent.click(screen.getByRole("button"));
  };

  it("asks for confirmation before permanently deleting a DAG", async () => {
    vi.mocked(DagService.deleteDag).mockResolvedValue(undefined);
    openDialog();
    expect(await screen.findByTestId("delete-confirm-button")).toBeVisible();
    expect(DagService.deleteDag).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("delete-confirm-button"));
    await waitFor(() => expect(DagService.deleteDag).toHaveBeenCalledWith({ dagId: "permanent_dag" }));
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(expect.objectContaining({ type: "success" })),
    );
  });

  it("does not delete when the user cancels", async () => {
    openDialog();
    fireEvent.click(await screen.findByTestId("delete-cancel-button"));
    expect(DagService.deleteDag).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and reports a running-DAG conflict", async () => {
    vi.mocked(DagService.deleteDag).mockRejectedValue({
      body: { detail: "DAG runs are still active" },
      status: 409,
    });
    openDialog();
    fireEvent.click(await screen.findByTestId("delete-confirm-button"));
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })),
    );
    expect(screen.getByTestId("delete-confirm-button")).toBeVisible();
    expect(toaster.create).not.toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });
});
