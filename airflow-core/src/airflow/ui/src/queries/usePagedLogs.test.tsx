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

/* eslint-disable unicorn/no-null */
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskInstanceService } from "openapi/requests";
import type { TaskInstanceResponse, TaskInstancesLogResponse } from "openapi/requests/types.gen";
import { Wrapper } from "src/utils/Wrapper";

import { MAX_RETAINED_LOG_ENTRIES, usePagedLogs } from "./usePagedLogs";

const mockUseAutoRefresh = vi.fn<() => number | false>(() => false);

vi.mock("openapi/requests", () => ({
  TaskInstanceService: { getLog: vi.fn() },
}));
vi.mock("src/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  useAutoRefresh: () => mockUseAutoRefresh(),
}));

const taskInstance = {
  dag_id: "test-dag",
  dag_run_id: "test-run",
  map_index: -1,
  state: "success",
  task_id: "test-task",
  try_number: 1,
} as TaskInstanceResponse;

const response = (overrides: Partial<TaskInstancesLogResponse> = {}): TaskInstancesLogResponse => ({
  content: [{ event: "latest" }],
  continuation_token: null,
  next_page_token: null,
  previous_page_token: null,
  ...overrides,
});

const cancelableResponse = (value: TaskInstancesLogResponse) =>
  Object.assign(Promise.resolve(value), { cancel: vi.fn() });

const wrapper = ({ children }: { children: ReactNode }) => <Wrapper>{children}</Wrapper>;

describe("usePagedLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAutoRefresh.mockReturnValue(false);
  });

  it("loads the first 1000 and last 500 log entries initially", async () => {
    vi.mocked(TaskInstanceService.getLog)
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "first" }] })) as never)
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "last" }] })) as never);

    const { result } = renderHook(() => usePagedLogs({ dagId: "test-dag", taskInstance, tryNumber: 1 }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(TaskInstanceService.getLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ limit: 1000, tail: undefined }),
    );
    expect(TaskInstanceService.getLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 500, tail: true }),
    );
    expect(result.current.content).toEqual([{ event: "first" }, { event: "last" }]);
  });

  it("does not request logs while a preview is collapsed", () => {
    renderHook(() => usePagedLogs({ dagId: "test-dag", enabled: false, taskInstance, tryNumber: 1 }), {
      wrapper,
    });

    expect(TaskInstanceService.getLog).not.toHaveBeenCalled();
  });

  it("resets the bounded page when the selected attempt changes", async () => {
    vi.mocked(TaskInstanceService.getLog)
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "attempt-1" }] })) as never)
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "attempt-1-tail" }] })) as never)
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "attempt-2" }] })) as never)
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "attempt-2-tail" }] })) as never);

    const { rerender, result } = renderHook(
      ({ tryNumber }) => usePagedLogs({ dagId: "test-dag", taskInstance, tryNumber }),
      { initialProps: { tryNumber: 1 }, wrapper },
    );

    await waitFor(() => expect(result.current.content[0]).toEqual({ event: "attempt-1" }));
    rerender({ tryNumber: 2 });
    await waitFor(() => expect(result.current.content[0]).toEqual({ event: "attempt-2" }));
    expect(TaskInstanceService.getLog).toHaveBeenLastCalledWith(expect.objectContaining({ tryNumber: 2 }));
  });

  it("prepends an older page using its opaque token", async () => {
    vi.mocked(TaskInstanceService.getLog)
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "first" }] })) as never)
      .mockReturnValueOnce(
        cancelableResponse(
          response({ content: [{ event: "last" }], previous_page_token: "older-token" }),
        ) as never,
      )
      .mockReturnValueOnce(
        cancelableResponse(response({ content: [{ event: "older" }], previous_page_token: null })) as never,
      );

    const { result } = renderHook(() => usePagedLogs({ dagId: "test-dag", taskInstance, tryNumber: 1 }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.hasMoreOlder).toBe(true));
    await act(() => result.current.loadOlder());
    expect(TaskInstanceService.getLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 500, pageToken: "older-token" }),
    );
    expect(result.current.content.map((entry) => (typeof entry === "string" ? entry : entry.event))).toEqual([
      "first",
      "older",
      "last",
    ]);
  });

  it("polls a running task from its continuation token", async () => {
    mockUseAutoRefresh.mockReturnValue(1);
    vi.mocked(TaskInstanceService.getLog)
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "first" }] })) as never)
      .mockReturnValueOnce(
        cancelableResponse(
          response({ content: [{ event: "last" }], continuation_token: "continue" }),
        ) as never,
      )
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "new" }] })) as never);
    const runningTask = { ...taskInstance, state: "running" } as TaskInstanceResponse;

    const { result } = renderHook(
      () => usePagedLogs({ dagId: "test-dag", taskInstance: runningTask, tryNumber: 1 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.content).toHaveLength(3), { timeout: 2000 });
    expect(TaskInstanceService.getLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: "continue" }),
    );
  });

  it("continues polling when no new logs change the continuation token", async () => {
    vi.useFakeTimers();
    mockUseAutoRefresh.mockReturnValue(1);
    vi.mocked(TaskInstanceService.getLog).mockImplementation(
      () => cancelableResponse(response({ continuation_token: "continue" })) as never,
    );
    const runningTask = { ...taskInstance, state: "running" } as TaskInstanceResponse;

    try {
      renderHook(() => usePagedLogs({ dagId: "test-dag", taskInstance: runningTask, tryNumber: 1 }), {
        wrapper,
      });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(TaskInstanceService.getLog).toHaveBeenCalledTimes(4);
      expect(TaskInstanceService.getLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ token: "continue" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds retained live entries and reports discarded history", async () => {
    mockUseAutoRefresh.mockReturnValue(1);
    const initialContent = Array.from({ length: 1000 }, (_, index) => ({ event: `first-${index}` }));
    const tailContent = Array.from({ length: MAX_RETAINED_LOG_ENTRIES - 1000 }, (_, index) => ({
      event: `last-${index}`,
    }));

    vi.mocked(TaskInstanceService.getLog)
      .mockReturnValueOnce(cancelableResponse(response({ content: initialContent })) as never)
      .mockReturnValueOnce(
        cancelableResponse(response({ content: tailContent, continuation_token: "continue" })) as never,
      )
      .mockReturnValueOnce(cancelableResponse(response({ content: [{ event: "newest" }] })) as never);
    const runningTask = { ...taskInstance, state: "running" } as TaskInstanceResponse;

    const { result } = renderHook(
      () => usePagedLogs({ dagId: "test-dag", taskInstance: runningTask, tryNumber: 1 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.wasDiscarded).toBe(true), { timeout: 2000 });
    expect(result.current.content).toHaveLength(MAX_RETAINED_LOG_ENTRIES);
    expect(result.current.content.at(-1)).toEqual({ event: "newest" });
  });
});
