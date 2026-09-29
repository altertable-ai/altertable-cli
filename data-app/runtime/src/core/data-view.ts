export type DataView<T, Input = unknown> =
  | { kind: "loading" }
  | { kind: "empty"; input: Input }
  | { kind: "error"; error: Error }
  | { kind: "ready"; data: T; input: Input }
  | { kind: "updating"; data: T; requestedInput: Input; displayedInput: Input; message: string }
  | {
      kind: "stale-error";
      data: T;
      requestedInput: Input;
      displayedInput: Input;
      error: Error;
      message: string;
    };

export type DataSnapshot<Data, Input> = { data: Data; input: Input };
export type DisplayedSnapshot<Data, Input> = DataSnapshot<Data, Input> & {
  state: "ready" | "updating" | "stale-error";
};

/** The result currently shown to the reader, including the input that produced it. */
export function displayedSnapshot<Data, Input>(
  view: DataView<Data, Input>,
): DisplayedSnapshot<Data, Input> | undefined {
  if (view.kind === "ready") return { data: view.data, input: view.input, state: view.kind };
  if (view.kind === "updating" || view.kind === "stale-error")
    return { data: view.data, input: view.displayedInput, state: view.kind };
  return undefined;
}

/** Keep the requested input separate from the input that produced visible data. */
export function resolveDataView<Data, Input>({
  requestedInput,
  current,
  previous,
  pending,
  error,
  sameInput,
  describe,
  isEmpty,
}: {
  requestedInput: Input;
  current?: DataSnapshot<Data, Input>;
  previous?: DataSnapshot<Data, Input>;
  pending: boolean;
  error?: Error;
  sameInput: (a: Input, b: Input) => boolean;
  describe: (input: Input) => string;
  isEmpty: (data: Data) => boolean;
}): DataView<Data, Input> {
  const shown = current ?? previous;
  if (!shown) return error ? { kind: "error", error } : { kind: "loading" };
  const currentInput = sameInput(shown.input, requestedInput);
  if (error)
    return {
      kind: "stale-error",
      data: shown.data,
      displayedInput: shown.input,
      requestedInput,
      error,
      message: currentInput
        ? `Couldn’t refresh. Showing the last result for ${describe(shown.input)}.`
        : `Couldn’t refresh. Showing ${describe(shown.input)} while ${describe(requestedInput)} is unavailable.`,
    };
  if (pending || !currentInput)
    return {
      kind: "updating",
      data: shown.data,
      displayedInput: shown.input,
      requestedInput,
      message: currentInput
        ? `Updating ${describe(requestedInput)}…`
        : `Showing ${describe(shown.input)} while loading ${describe(requestedInput)}…`,
    };
  return isEmpty(shown.data)
    ? { kind: "empty", input: shown.input }
    : { kind: "ready", data: shown.data, input: shown.input };
}
