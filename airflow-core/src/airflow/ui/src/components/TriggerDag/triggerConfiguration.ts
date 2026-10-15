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
import { useTranslation } from "react-i18next";

import { useDagTriggerConfigServicePutDagTriggerConfig } from "openapi/queries";
import { createErrorToaster } from "src/utils";

export const parseConfiguration = (conf: string): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(conf) as unknown;

    return parsed !== null && !Array.isArray(parsed) && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

type SaveConfiguration = (variables: {
  dagId: string;
  requestBody: { conf: Record<string, unknown> };
}) => Promise<unknown>;

export const persistConfigurationBeforeTrigger = async ({
  conf,
  dagId,
  onPersisted,
  saveConfig,
}: {
  conf: string;
  dagId: string;
  onPersisted: () => void;
  saveConfig: SaveConfiguration;
}) => {
  const parsedConf = parseConfiguration(conf);

  if (parsedConf === undefined) {
    return;
  }

  try {
    await saveConfig({ dagId, requestBody: { conf: parsedConf } });
  } catch {
    return;
  }

  onPersisted();
};

export const usePersistTriggerConfiguration = (dagId: string) => {
  const { t: translate } = useTranslation("components");
  const { isPending, mutateAsync } = useDagTriggerConfigServicePutDagTriggerConfig({
    onError: (error: unknown) =>
      createErrorToaster(error, { titleKey: "components:triggerDag.configurationSaveFailed" }, translate),
  });

  return {
    isPending,
    persistConfiguration: (conf: string, onPersisted: () => void) =>
      persistConfigurationBeforeTrigger({ conf, dagId, onPersisted, saveConfig: mutateAsync }),
  };
};
