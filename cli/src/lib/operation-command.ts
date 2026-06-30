import type { ArgsDef, CommandDef } from "citty";
import {
  defineAltertableCommand,
  type AltertableCommandMeta,
  type CommandRunContext,
} from "@/lib/command-context.ts";
import { writeCommandOutput, type CommandOutputMode } from "@/lib/command-output.ts";
import { createExecutionContext, type ExecutionContext } from "@/lib/execution-context.ts";
import {
  isOperationPlan,
  operationPlan,
  runOperationPlan,
  type OperationPlan,
} from "@/lib/operation-effect.ts";
import { registerOperation, type OperationCapability } from "@/lib/operation-catalog.ts";
import type { OperationCatalogMetadata } from "@/lib/operation-catalog.ts";
import type { OutputSink } from "@/lib/runtime.ts";

export type OperationContext = {
  args: Record<string, unknown>;
  rawArgs: string[];
  runtime: CommandRunContext["runtime"];
  sink: OutputSink;
  readonly execution: ExecutionContext;
};

export type OperationPresenter<TResult, TInput> = (
  result: TResult,
  context: OperationContext,
  input: TInput,
) => CommandOutputMode | Promise<CommandOutputMode | void> | void;

export type OperationSpec<TInput = void, TResult = void> = {
  id?: string;
  capabilities?: readonly OperationCapability[];
  catalog?: OperationCatalogMetadata;
  meta?: AltertableCommandMeta;
  args?: ArgsDef;
  default?: string;
  subCommands?: Record<string, CommandDef>;
  parse?: (context: OperationContext) => TInput | Promise<TInput>;
  run?: (
    input: TInput,
    context: OperationContext,
  ) => OperationPlan<TResult> | Promise<OperationPlan<TResult>>;
  present?: OperationPresenter<TResult, TInput>;
};

function createOperationContext(context: CommandRunContext): OperationContext {
  let execution: ExecutionContext | undefined;
  return {
    args: context.args as Record<string, unknown>,
    rawArgs: context.rawArgs,
    runtime: context.runtime,
    sink: context.sink,
    get execution() {
      execution ??= createExecutionContext(context.runtime);
      return execution;
    },
  };
}

async function writePresentedOutput<TResult, TInput>(
  result: TResult,
  input: TInput,
  context: OperationContext,
  present?: OperationPresenter<TResult, TInput>,
): Promise<void> {
  const output = present ? await present(result, context, input) : undefined;
  if (output) {
    await writeCommandOutput(output, context.sink);
  }
}

export function defineOperationCommand<TInput = void, TResult = void>(
  spec: OperationSpec<TInput, TResult>,
): CommandDef {
  if (spec.id) {
    registerOperation({
      id: spec.id,
      meta: spec.meta,
      capabilities: spec.capabilities ?? [],
      ...spec.catalog,
    });
  }

  const command = {
    meta: spec.meta,
    args: spec.args,
    default: spec.default,
    subCommands: spec.subCommands,
  };

  const run = spec.run;
  if (!run) {
    return defineAltertableCommand(command);
  }

  return defineAltertableCommand({
    ...command,
    async run(context: CommandRunContext) {
      const operationContext = createOperationContext(context);
      const input = spec.parse ? await spec.parse(operationContext) : (undefined as TInput);
      const plannedResult = await run(input, operationContext);
      const result = await runOperationPlan(plannedResult, operationContext);
      await writePresentedOutput(result, input, operationContext, spec.present);
    },
  });
}

export { isOperationPlan, operationPlan };
