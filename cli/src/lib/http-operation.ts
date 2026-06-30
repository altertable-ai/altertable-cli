import {
  httpEffect,
  httpStreamEffect,
  operationPlan,
  type OperationEffect,
  type OperationPlan,
} from "@/lib/operation-effect.ts";
import type { OperationContext } from "@/lib/operation-command.ts";
import type { OperationHttpRequest } from "@/lib/operation-transport.ts";

type HttpOperationDefinition<TInput, TResult> = {
  id: string;
  request: (input: TInput, context?: OperationContext) => OperationHttpRequest;
  decode?: (body: string, context: OperationContext, input: TInput) => TResult | Promise<TResult>;
};

type HttpStreamOperationDefinition<TInput, TResult> = {
  id: string;
  request: (input: TInput, context?: OperationContext) => OperationHttpRequest;
  decode: (
    stream: ReadableStream<Uint8Array>,
    context: OperationContext,
    input: TInput,
  ) => TResult | Promise<TResult>;
};

export type HttpOperationDescriptor<TInput, TResult> = HttpOperationDefinition<TInput, TResult> & {
  effect: (input: TInput, context: OperationContext) => OperationEffect<TResult>;
  plan: (input: TInput, context: OperationContext) => OperationPlan<TResult>;
};

export type HttpStreamOperationDescriptor<TInput, TResult> = HttpStreamOperationDefinition<
  TInput,
  TResult
> & {
  effect: (input: TInput, context: OperationContext) => OperationEffect<TResult>;
  plan: (input: TInput, context: OperationContext) => OperationPlan<TResult>;
};

export function defineHttpOperation<TInput, TResult>(
  definition: HttpOperationDefinition<TInput, TResult>,
): HttpOperationDescriptor<TInput, TResult> {
  const descriptor = {
    ...definition,
    effect(input: TInput, context: OperationContext): OperationEffect<TResult> {
      return httpOperationEffect(descriptor, input, context);
    },
    plan(input: TInput, context: OperationContext): OperationPlan<TResult> {
      return httpOperationPlan(descriptor, input, context);
    },
  };
  return descriptor;
}

export function defineHttpStreamOperation<TInput, TResult>(
  definition: HttpStreamOperationDefinition<TInput, TResult>,
): HttpStreamOperationDescriptor<TInput, TResult> {
  const descriptor = {
    ...definition,
    effect(input: TInput, context: OperationContext): OperationEffect<TResult> {
      return httpStreamOperationEffect(descriptor, input, context);
    },
    plan(input: TInput, context: OperationContext): OperationPlan<TResult> {
      return httpStreamOperationPlan(descriptor, input, context);
    },
  };
  return descriptor;
}

export function httpOperationEffect<TInput, TResult>(
  descriptor: HttpOperationDescriptor<TInput, TResult>,
  input: TInput,
  context: OperationContext,
): OperationEffect<TResult> {
  return httpEffect(descriptor.request(input, context), (body, operationContext) =>
    descriptor.decode ? descriptor.decode(body, operationContext, input) : (body as TResult),
  );
}

export function httpStreamOperationEffect<TInput, TResult>(
  descriptor: HttpStreamOperationDescriptor<TInput, TResult>,
  input: TInput,
  context: OperationContext,
): OperationEffect<TResult> {
  return httpStreamEffect(descriptor.request(input, context), (stream, operationContext) =>
    descriptor.decode(stream, operationContext, input),
  );
}

export function httpOperationPlan<TInput, TResult>(
  descriptor: HttpOperationDescriptor<TInput, TResult>,
  input: TInput,
  context: OperationContext,
): OperationPlan<TResult> {
  return operationPlan(httpOperationEffect(descriptor, input, context));
}

export function httpStreamOperationPlan<TInput, TResult>(
  descriptor: HttpStreamOperationDescriptor<TInput, TResult>,
  input: TInput,
  context: OperationContext,
): OperationPlan<TResult> {
  return operationPlan(httpStreamOperationEffect(descriptor, input, context));
}
