const CSI = '\u001b[';
const ENTER_SCREEN = `${CSI}?1049h${CSI}?25l`;
const LEAVE_SCREEN = `${CSI}?25h${CSI}?1049l`;

export type LiveViewport = {
  /** Terminal height in lines, when known. */
  rows?: number;
};

export type LiveViewOptions = {
  intervalMs: number;
  /** Builds the next frame. A frame still pending at Ctrl+C is discarded. */
  render: (viewport: LiveViewport) => Promise<string>;
  write: (text: string) => void | Promise<void>;
};

/**
 * Redraws a full-screen view on the alternate screen every `intervalMs` until
 * Ctrl+C, then restores the terminal. The caller checks for an interactive TTY.
 */
export async function runLiveView(options: LiveViewOptions): Promise<void> {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt);
  await options.write(ENTER_SCREEN);
  try {
    while (!controller.signal.aborted) {
      const frame = await untilAborted(
        options.render({ rows: process.stdout.rows }),
        controller.signal
      );
      if (frame === undefined || controller.signal.aborted) {
        return;
      }
      await options.write(redrawInPlace(frame));
      await abortableSleep(options.intervalMs, controller.signal);
    }
  } finally {
    process.off('SIGINT', interrupt);
    await options.write(LEAVE_SCREEN);
  }
}

/** Homes the cursor and clears each line's tail, then everything below. */
function redrawInPlace(frame: string): string {
  const body = frame
    .split('\n')
    .map(line => `${line}${CSI}K`)
    .join('\n');
  return `${CSI}H${body}${CSI}J`;
}

async function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T | undefined> {
  let onAbort = () => {};
  const aborted = new Promise<undefined>(resolve => {
    onAbort = () => resolve(undefined);
    // `promise` may have aborted the signal while it was being created.
    if (signal.aborted) onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function abortableSleep(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
