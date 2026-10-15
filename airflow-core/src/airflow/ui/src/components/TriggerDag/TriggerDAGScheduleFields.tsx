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
import { Box, Spacer, HStack, Field, Stack, Text } from "@chakra-ui/react";
import { Controller, type Control } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { DateTimeInput } from "../DateTimeInput";
import { RadioCardItem, RadioCardRoot } from "../ui/RadioCard";
import { dataIntervalModeOptions, type DagRunTriggerParams } from "./types";

type Props = {
  readonly control: Control<DagRunTriggerParams>;
  readonly dataIntervalInvalid: boolean;
  readonly dataIntervalMode: string;
  readonly dateError: unknown;
  readonly hasSchedule: boolean;
  readonly isPartitioned: boolean;
  readonly onDateBlur: () => void;
};

export const TriggerDAGScheduleFields = ({
  control,
  dataIntervalInvalid,
  dataIntervalMode,
  dateError,
  hasSchedule,
  isPartitioned,
  onDateBlur,
}: Props) => {
  const { t: translate } = useTranslation(["common", "components"]);

  if (isPartitioned) {
    return undefined;
  }

  return (
    <>
      <Controller
        control={control}
        name="logicalDate"
        render={({ field }) => (
          <Field.Root invalid={Boolean(dateError)} orientation="horizontal">
            <Stack>
              <Field.Label fontSize="md" style={{ flexBasis: "30%" }}>
                {translate("logicalDate")}
              </Field.Label>
            </Stack>
            <Stack css={{ flexBasis: "70%" }}>
              <DateTimeInput {...field} onBlur={onDateBlur} size="sm" />
            </Stack>
          </Field.Root>
        )}
      />
      <Spacer />
      {hasSchedule ? (
        <Box>
          <Text fontSize="md" fontWeight="semibold" mb={3}>
            {translate("components:triggerDag.dataInterval")}
          </Text>
          <Controller
            control={control}
            name="dataIntervalMode"
            render={({ field }) => (
              <RadioCardRoot defaultValue={String(field.value)} onChange={field.onChange}>
                <HStack align="stretch">
                  {dataIntervalModeOptions.map((mode) => (
                    <RadioCardItem
                      colorPalette="brand"
                      indicatorPlacement="start"
                      key={mode.value}
                      label={translate(mode.label)}
                      value={mode.value}
                    />
                  ))}
                </HStack>
              </RadioCardRoot>
            )}
          />
          <Spacer />
          {dataIntervalMode === "manual" ? (
            <HStack alignItems="flex-start" mt={3} w="full">
              <Controller
                control={control}
                name="dataIntervalStart"
                render={({ field }) => (
                  <Field.Root invalid={Boolean(dateError) || dataIntervalInvalid} required>
                    <Field.Label>{translate("components:triggerDag.intervalStart")}</Field.Label>
                    <DateTimeInput {...field} onBlur={onDateBlur} size="sm" />
                  </Field.Root>
                )}
              />
              <Controller
                control={control}
                name="dataIntervalEnd"
                render={({ field }) => (
                  <Field.Root invalid={Boolean(dateError) || dataIntervalInvalid} required>
                    <Field.Label>{translate("components:triggerDag.intervalEnd")}</Field.Label>
                    <DateTimeInput {...field} onBlur={onDateBlur} size="sm" />
                  </Field.Root>
                )}
              />
            </HStack>
          ) : undefined}
        </Box>
      ) : undefined}
      <Spacer />
    </>
  );
};
