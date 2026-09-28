import { defineAppVariables, type AppVariableValues } from "@altertable/data-app-runtime/ui";

/** Add reader-controlled filters here when the first data view needs them. */
export const variables = defineAppVariables({});

/** The connection check has no inputs. Project new variables into data operations here. */
export const connectionInput = (_values: AppVariableValues<typeof variables>) => ({});
