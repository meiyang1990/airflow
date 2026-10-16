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
import type { EditorProps } from "@monaco-editor/react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { JsonEditor } from "./JsonEditor";

let editorProps: EditorProps | undefined;

vi.mock("@monaco-editor/react", () => ({
  default: (props: EditorProps) => {
    editorProps = props;

    return undefined;
  },
}));

describe("JsonEditor", () => {
  it("passes the latest editor value to the blur handler", () => {
    const onBlur = vi.fn();
    let onDidBlur: (() => void) | undefined;

    const { rerender } = render(<JsonEditor onBlur={onBlur} value='{"tags":["algo_operators"]}' />);

    act(() => {
      editorProps?.onMount?.(
        {
          onDidBlurEditorText: (callback: () => void) => {
            onDidBlur = callback;

            return { dispose: vi.fn() };
          },
        } as never,
        {} as never,
      );
      editorProps?.onChange?.('{"tags":[]}', {} as never);
      rerender(<JsonEditor onBlur={onBlur} value='{"tags":["algo_operators"]}' />);
      onDidBlur?.();
    });

    expect(onBlur).toHaveBeenCalledWith('{"tags":[]}');
  });
});
