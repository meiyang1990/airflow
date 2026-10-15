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
import { expect, test } from "@playwright/test";
import { AUTH_FILE, testConfig } from "playwright.config";

test.describe("Shared DAG trigger configuration", () => {
  test.setTimeout(60_000);

  const dagId = testConfig.testDag.id;

  test("uses a previously saved configuration in a normal trigger dialog", async ({ browser, page }) => {
    const baseUrl = process.env.AIRFLOW_UI_BASE_URL ?? "http://localhost:8080";
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const setupPage = await context.newPage();
    const savedConfig = { source: "shared-trigger-config-e2e" };

    const response = await setupPage.request.put(`${baseUrl}/api/v2/dags/${dagId}/trigger-config`, {
      data: { conf: savedConfig },
    });

    expect(response.ok()).toBeTruthy();

    const responseBody = (await response.json()) as { conf: typeof savedConfig };

    expect(responseBody.conf).toEqual(savedConfig);

    await context.close();

    await page.goto(`/dags/${dagId}`);
    await page.getByTestId("trigger-dag-button").click();

    await expect(page.getByRole("dialog").locator(".view-lines")).toContainText("shared-trigger-config-e2e");
  });
});
