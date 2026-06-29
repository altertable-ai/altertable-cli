import type { CommandDef } from "citty";
import {
  defineOperationCommand,
  type OperationContext,
  type OperationPresenter,
  type OperationSpec,
} from "@/lib/operation-command.ts";
import type { CommandOutputMode } from "@/lib/command-output.ts";
import type { AuthPlane } from "@/lib/errors.ts";
import type { HttpOperationDescriptor } from "@/lib/http-operation.ts";
import type { OperationCapability } from "@/lib/operation-catalog.ts";
import { localPlan, outputPlan, valuePlan } from "@/lib/operation-effect.ts";

type CommandOutputShape = "raw-api" | "normalized" | "human" | "tabular" | "none";

type OperationCommandBase<TInput, TResult> = Omit<OperationSpec<TInput, TResult>, "run"> & {
  output: CommandOutputShape;
};

type GroupCommandSpec = Pick<
  OperationSpec,
  "id" | "capabilities" | "meta" | "args" | "default" | "subCommands" | "catalog"
>;

type HttpCommandSpec<TInput, TResult> = OperationCommandBase<TInput, TResult> & {
  plane: AuthPlane;
  operation: HttpOperationDescriptor<TInput, TResult>;
  mutates?: boolean;
};

type LocalCommandSpec<TInput, TResult> = OperationCommandBase<TInput, TResult> & {
  mutates?: boolean;
  readFile?: boolean;
  writeFile?: boolean;
  local: (input: TInput, context: OperationContext) => TResult | Promise<TResult>;
};

type ValueCommandSpec<TInput, TResult> = OperationCommandBase<TInput, TResult> & {
  value: (input: TInput, context: OperationContext) => TResult | Promise<TResult>;
};

type OutputCommandSpec<TInput> = Omit<OperationCommandBase<TInput, void>, "present"> & {
  output: Exclude<CommandOutputShape, "none">;
  value: (
    input: TInput,
    context: OperationContext,
  ) => CommandOutputMode | Promise<CommandOutputMode>;
};

function httpCapability(plane: AuthPlane): OperationCapability {
  return plane === "lakehouse" ? "lakehouse-http" : "management-http";
}

export function defineGroupCommand(spec: GroupCommandSpec): CommandDef {
  return defineOperationCommand(spec);
}

export function defineHttpCommand<TInput, TResult>(
  spec: HttpCommandSpec<TInput, TResult>,
): CommandDef {
  return defineOperationCommand({
    ...spec,
    capabilities: spec.capabilities ?? [httpCapability(spec.plane)],
    catalog: {
      effects: ["http"],
      planes: [spec.plane],
      mutates: spec.mutates,
      output: spec.output,
      ...spec.catalog,
    },
    run(input, context) {
      return spec.operation.plan(input, context);
    },
  });
}

export function defineLocalCommand<TInput = void, TResult = void>(
  spec: LocalCommandSpec<TInput, TResult>,
): CommandDef {
  const capabilities = [...(spec.capabilities ?? [])];
  if (!capabilities.includes("local-config")) {
    capabilities.push("local-config");
  }
  if (spec.readFile && !capabilities.includes("local-file-read")) {
    capabilities.push("local-file-read");
  }
  if ((spec.writeFile || spec.mutates) && !capabilities.includes("local-file-write")) {
    capabilities.push("local-file-write");
  }

  return defineOperationCommand({
    ...spec,
    capabilities,
    catalog: {
      effects: ["local"],
      mutates: spec.mutates,
      output: spec.output,
      ...spec.catalog,
    },
    run(input, context) {
      return localPlan(() => spec.local(input, context));
    },
  });
}

export function defineValueCommand<TInput = void, TResult = void>(
  spec: ValueCommandSpec<TInput, TResult>,
): CommandDef {
  return defineOperationCommand({
    ...spec,
    catalog: {
      effects: ["value"],
      output: spec.output,
      ...spec.catalog,
    },
    async run(input, context) {
      return valuePlan(await spec.value(input, context));
    },
  });
}

export function defineOutputCommand<TInput = void>(spec: OutputCommandSpec<TInput>): CommandDef {
  return defineOperationCommand({
    ...spec,
    catalog: {
      effects: ["output"],
      output: spec.output,
      ...spec.catalog,
    },
    async run(input, context) {
      return outputPlan(await spec.value(input, context));
    },
  });
}

export type { OperationPresenter };
