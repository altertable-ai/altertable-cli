import {
  httpEffect,
  httpStreamEffect,
  operationPlan,
  type OperationPlan,
} from "@/lib/operation-effect.ts";
import type { OperationContext } from "@/lib/operation-command.ts";
import type { OperationHttpRequest } from "@/lib/operation-transport.ts";

export type HttpOperationDescriptor<TInput, TResult> = {
  id: string;
  request: (input: TInput, context?: OperationContext) => OperationHttpRequest;
  decode?: (body: string, context: OperationContext, input: TInput) => TResult | Promise<TResult>;
};

export type HttpStreamOperationDescriptor<TInput, TResult> = {
  id: string;
  request: (input: TInput, context?: OperationContext) => OperationHttpRequest;
  decode: (
    stream: ReadableStream<Uint8Array>,
    context: OperationContext,
    input: TInput,
  ) => TResult | Promise<TResult>;
};

export function defineHttpOperation<TInput, TResult>(
  descriptor: HttpOperationDescriptor<TInput, TResult>,
): HttpOperationDescriptor<TInput, TResult> {
  return descriptor;
}

export function defineHttpStreamOperation<TInput, TResult>(
  descriptor: HttpStreamOperationDescriptor<TInput, TResult>,
): HttpStreamOperationDescriptor<TInput, TResult> {
  return descriptor;
}

export function httpOperationPlan<TInput, TResult>(
  descriptor: HttpOperationDescriptor<TInput, TResult>,
  input: TInput,
  context: OperationContext,
): OperationPlan<TResult> {
  return operationPlan(
    httpEffect(descriptor.request(input, context), (body, operationContext) =>
      descriptor.decode ? descriptor.decode(body, operationContext, input) : (body as TResult),
    ),
  );
}

export function httpStreamOperationPlan<TInput, TResult>(
  descriptor: HttpStreamOperationDescriptor<TInput, TResult>,
  input: TInput,
  context: OperationContext,
): OperationPlan<TResult> {
  return operationPlan(
    httpStreamEffect(descriptor.request(input, context), (stream, operationContext) =>
      descriptor.decode(stream, operationContext, input),
    ),
  );
}
