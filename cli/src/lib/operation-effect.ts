import type { OperationHttpRequest } from "@/lib/operation-transport.ts";
import { sendOperationHttp, sendOperationHttpStream } from "@/lib/operation-transport.ts";
import type { OperationContext } from "@/lib/operation-command.ts";
import { startProgress } from "@/lib/progress.ts";

export type OperationScope<TResult> = {
  effect: OperationEffect<TResult>;
  release?: () => void | Promise<void>;
};

export type OperationEffect<TResult = unknown> =
  | {
      kind: "value";
      value: TResult;
    }
  | {
      kind: "http";
      request: OperationHttpRequest;
      decode?: (body: string, context: OperationContext) => TResult | Promise<TResult>;
    }
  | {
      kind: "http-stream";
      request: OperationHttpRequest;
      decode: (
        stream: ReadableStream<Uint8Array>,
        context: OperationContext,
      ) => TResult | Promise<TResult>;
    }
  | {
      kind: "all";
      effects: readonly OperationEffect[];
      combine: (results: unknown[], context: OperationContext) => TResult | Promise<TResult>;
    }
  | {
      kind: "progress";
      message: string;
      effect: OperationEffect<TResult>;
    }
  | {
      kind: "scope";
      acquire: (
        context: OperationContext,
      ) => OperationScope<TResult> | Promise<OperationScope<TResult>>;
    };

export function valueEffect<TResult>(value: TResult): OperationEffect<TResult> {
  return { kind: "value", value };
}

export function httpEffect<TResult = string>(
  request: OperationHttpRequest,
  decode?: (body: string, context: OperationContext) => TResult | Promise<TResult>,
): OperationEffect<TResult> {
  return { kind: "http", request, decode };
}

export function httpStreamEffect<TResult>(
  request: OperationHttpRequest,
  decode: (
    stream: ReadableStream<Uint8Array>,
    context: OperationContext,
  ) => TResult | Promise<TResult>,
): OperationEffect<TResult> {
  return { kind: "http-stream", request, decode };
}

export function allEffects<TResult>(
  effects: readonly OperationEffect[],
  combine: (results: unknown[], context: OperationContext) => TResult | Promise<TResult>,
): OperationEffect<TResult> {
  return { kind: "all", effects, combine };
}

export function progressEffect<TResult>(
  message: string,
  effect: OperationEffect<TResult>,
): OperationEffect<TResult> {
  return { kind: "progress", message, effect };
}

export function scopedEffect<TResult>(
  acquire: (
    context: OperationContext,
  ) => OperationScope<TResult> | Promise<OperationScope<TResult>>,
): OperationEffect<TResult> {
  return { kind: "scope", acquire };
}

export function isOperationEffect(value: unknown): value is OperationEffect {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value.kind === "value" ||
      value.kind === "http" ||
      value.kind === "http-stream" ||
      value.kind === "all" ||
      value.kind === "progress" ||
      value.kind === "scope")
  );
}

export async function runOperationEffect<TResult>(
  effect: OperationEffect<TResult>,
  context: OperationContext,
): Promise<TResult> {
  if (effect.kind === "value") {
    return effect.value;
  }

  if (effect.kind === "http") {
    const body = await sendOperationHttp(effect.request, context.execution);
    return effect.decode ? await effect.decode(body, context) : (body as TResult);
  }

  if (effect.kind === "http-stream") {
    const stream = await sendOperationHttpStream(effect.request, context.execution);
    return effect.decode(stream, context);
  }

  if (effect.kind === "all") {
    const results = await Promise.all(
      effect.effects.map((nestedEffect) => runOperationEffect(nestedEffect, context)),
    );
    return effect.combine(results, context);
  }

  if (effect.kind === "progress") {
    const progress = startProgress(effect.message);
    try {
      const result = await runOperationEffect(effect.effect, context);
      progress.done();
      return result;
    } catch (error) {
      progress.fail();
      throw error;
    }
  }

  const scope = await effect.acquire(context);
  try {
    return await runOperationEffect(scope.effect, context);
  } finally {
    await scope.release?.();
  }
}
