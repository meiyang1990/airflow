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
import { Button } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { FiSave } from "react-icons/fi";

import { useDagTriggerConfigServicePutDagTriggerConfig } from "openapi/queries";
import { toaster } from "src/components/ui";
import { createErrorToaster } from "src/utils";

import { parseConfiguration } from "./triggerConfiguration";

type Props = {
  readonly conf: string;
  readonly dagId: string;
  readonly disabled: boolean;
  readonly onSaveSuccess: () => void;
};

export const SaveDagTriggerConfigButton = ({ conf, dagId, disabled, onSaveSuccess }: Props) => {
  const { t: translate } = useTranslation("components");
  const parsedConf = parseConfiguration(conf);
  const { isPending, mutate } = useDagTriggerConfigServicePutDagTriggerConfig({
    onError: (error: unknown) =>
      createErrorToaster(error, { titleKey: "components:triggerDag.configurationSaveFailed" }, translate),
    onSuccess: () => {
      toaster.create({ title: translate("triggerDag.configurationSaved"), type: "success" });
      onSaveSuccess();
    },
  });

  return (
    <Button
      data-testid="save-dag-config"
      disabled={disabled || isPending || parsedConf === undefined}
      onClick={() => {
        if (parsedConf) {
          mutate({ dagId, requestBody: { conf: parsedConf } });
        }
      }}
      variant="outline"
    >
      <FiSave /> {translate("triggerDag.saveConfiguration")}
    </Button>
  );
};
