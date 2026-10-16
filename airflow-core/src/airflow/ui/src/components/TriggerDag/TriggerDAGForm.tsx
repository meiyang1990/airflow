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
import { VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { useDagParams } from "src/queries/useDagParams";
import { useParamStore } from "src/queries/useParamStore";
import { useTogglePause } from "src/queries/useTogglePause";
import { DEFAULT_DATETIME_FORMAT } from "src/utils/datetimeUtils";

import ConfigForm from "../ConfigForm";
import { ErrorAlert, type ExpandedApiError } from "../ErrorAlert";
import TriggerDAGAdvancedOptions from "./TriggerDAGAdvancedOptions";
import { TriggerDAGFooter } from "./TriggerDAGFooter";
import { TriggerDAGScheduleFields } from "./TriggerDAGScheduleFields";
import { TriggerDAGUnpauseOption } from "./TriggerDAGUnpauseOption";
import { usePersistTriggerConfiguration } from "./triggerConfiguration";
import type { DagRunTriggerParams } from "./types";

type TriggerDAGFormProps = {
  readonly dagDisplayName: string;
  readonly dagId: string;
  readonly error?: unknown;
  readonly hasSchedule: boolean;
  readonly isPartitioned: boolean;
  readonly isPaused: boolean;
  readonly isPending?: boolean;
  readonly onClose: () => void;
  readonly onSubmitTrigger?: (params: DagRunTriggerParams) => void;
  readonly open: boolean;
  readonly prefillConfig?:
    | {
        conf: Record<string, unknown> | undefined;
        logicalDate: string | undefined;
        runId: string;
      }
    | undefined;
};

const TriggerDAGForm = ({
  dagDisplayName,
  dagId,
  error,
  hasSchedule,
  isPartitioned,
  isPaused,
  isPending = false,
  onClose,
  onSubmitTrigger,
  open,
  prefillConfig,
}: TriggerDAGFormProps) => {
  const [errors, setErrors] = useState<{ conf?: string; date?: unknown }>({});
  const [formError, setFormError] = useState(false);
  const initialParamsDict = useDagParams(dagId, open);
  const { conf, initialParamDict, setConf, setInitialParamDict } = useParamStore();
  const [unpause, setUnpause] = useState(true);
  const { mutate: togglePause } = useTogglePause({ dagId });
  const { isPending: isSavingConfig, persistConfiguration } = usePersistTriggerConfiguration(dagId);

  const { control, handleSubmit, reset, watch } = useForm<DagRunTriggerParams>({
    defaultValues: {
      conf,
      dagRunId: "",
      dataIntervalEnd: "",
      dataIntervalMode: "auto",
      dataIntervalStart: "",
      // Default logical date to now, show it in the selected timezone.
      // For partitioned Dags, logical date is not applicable.
      logicalDate: isPartitioned ? "" : dayjs().format(DEFAULT_DATETIME_FORMAT),
      note: "",
      partitionKey: undefined,
    },
  });

  // Pre-fill form when prefillConfig is provided (priority over conf)
  // Only restore 'conf' (parameters), not logicalDate, runId, or partitionKey to avoid 409 conflicts
  useEffect(() => {
    if (prefillConfig && open) {
      const confString = prefillConfig.conf ? JSON.stringify(prefillConfig.conf, undefined, 2) : "";

      reset({
        conf: confString,
        dagRunId: "",
        dataIntervalEnd: "",
        dataIntervalMode: "auto",
        dataIntervalStart: "",
        logicalDate: isPartitioned ? "" : dayjs().format(DEFAULT_DATETIME_FORMAT),
        note: "",
        partitionKey: undefined,
      });
      // Also update the param store to keep it in sync.
      // Wait until we have the initial params so section ordering stays consistent.
      if (confString && Object.keys(initialParamsDict.paramsDict).length > 0) {
        if (Object.keys(initialParamDict).length === 0) {
          setInitialParamDict(initialParamsDict.paramsDict);
        }
        setConf(confString);
      }
    }
  }, [
    prefillConfig,
    open,
    reset,
    setConf,
    initialParamsDict.paramsDict,
    initialParamDict,
    setInitialParamDict,
    isPartitioned,
  ]);

  // Keep the form state in sync with changes made through the flexible parameter form.
  useEffect(() => {
    if (conf && open) {
      reset((prevValues) => ({ ...prevValues, conf }));
    }
  }, [conf, open, reset]);

  const resetDateError = () => setErrors((prev) => ({ ...prev, date: undefined }));

  const dataIntervalMode = watch("dataIntervalMode");
  const dataIntervalStart = watch("dataIntervalStart");
  const dataIntervalEnd = watch("dataIntervalEnd");
  const noDataInterval = !Boolean(dataIntervalStart) || !Boolean(dataIntervalEnd);
  const dataIntervalInvalid =
    dataIntervalMode === "manual" &&
    (noDataInterval || dayjs(dataIntervalStart).isAfter(dayjs(dataIntervalEnd)));
  const onSubmit = async (data: DagRunTriggerParams) => {
    await persistConfiguration(data.conf, () => {
      if (unpause && isPaused) {
        togglePause({ dagId, requestBody: { is_paused: false } });
      }
      onSubmitTrigger?.(data);
    });
  };

  return (
    <>
      <ErrorAlert error={errors.date ?? error} />
      <VStack alignItems="stretch" gap={2} pt={4}>
        <TriggerDAGScheduleFields
          control={control}
          dataIntervalInvalid={dataIntervalInvalid}
          dataIntervalMode={dataIntervalMode}
          dateError={errors.date}
          hasSchedule={hasSchedule}
          isPartitioned={isPartitioned}
          onDateBlur={resetDateError}
        />
        {isPaused ? (
          <TriggerDAGUnpauseOption
            checked={unpause}
            dagDisplayName={dagDisplayName}
            onChange={() => setUnpause(!unpause)}
          />
        ) : undefined}
        <ConfigForm
          control={control}
          errors={errors}
          initialParamsDict={initialParamsDict}
          setErrors={setErrors}
          setFormError={setFormError}
        >
          <TriggerDAGAdvancedOptions control={control} />
        </ConfigForm>
      </VStack>
      <TriggerDAGFooter
        conf={watch("conf")}
        dagId={dagId}
        onSaveSuccess={onClose}
        onTrigger={() => void handleSubmit(onSubmit)()}
        saveDisabled={Boolean(errors.conf) || formError || isSavingConfig}
        triggerDisabled={
          Boolean(errors.conf) ||
          Boolean(errors.date) ||
          formError ||
          isPending ||
          isSavingConfig ||
          dataIntervalInvalid ||
          (Boolean(error) && (error as ExpandedApiError).status === 403)
        }
      />
    </>
  );
};

export default TriggerDAGForm;
