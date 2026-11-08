import {
  createQueryTopFrameRenderer,
  fetchQueryTopSnapshot,
  QUERY_TOP_SORT_KEYS,
  renderQueryTopTable,
} from '@/commands/query/lib/top.ts';
import { booleanArg, enumArg, stringArg } from '@/lib/args.ts';
import { defineCommand } from '@/lib/command.ts';
import { CliError } from '@/lib/errors.ts';
import { runLiveView } from '@/ui/terminal/live-view.ts';

export const queryTopCommand = defineCommand({
  metadata: {
    name: 'top',
    description:
      'Show running queries with progress, rows, and memory; --watch refreshes live.',
    examples: [
      'altertable query top',
      'altertable query top --watch',
      'altertable query top -w --interval 5',
      'altertable query top --sort memory',
    ],
  },
  args: {
    watch: {
      type: 'boolean',
      alias: 'w',
      description: 'Keep refreshing the view until interrupted (Ctrl+C)',
    },
    interval: {
      type: 'string',
      description: 'Seconds between refreshes in --watch mode',
      default: '1',
      valueHint: 'SECONDS',
    },
    sort: {
      type: 'enum',
      description: 'Column to sort by, largest first',
      options: QUERY_TOP_SORT_KEYS,
      default: 'elapsed',
    },
  },
  async run({ args, execution, sink }) {
    const intervalMs = parseIntervalMs(stringArg(args, 'interval'));
    const sortKey = enumArg(args, 'sort', QUERY_TOP_SORT_KEYS);
    const fetchSnapshot = () => fetchQueryTopSnapshot(execution, sortKey);

    if (!booleanArg(args, 'watch')) {
      const snapshot = await fetchSnapshot();
      if (sink.json) {
        sink.writeJson(snapshot);
        return;
      }
      // Piped output keeps full statements instead of fitting a phantom 80 columns.
      sink.writeHuman(
        renderQueryTopTable(snapshot, {
          horizontalScroll: process.stdout.isTTY !== true,
        })
      );
      return;
    }

    if (sink.json) {
      throw new CliError('--watch cannot be combined with --json or --agent.');
    }
    if (process.stdout.isTTY !== true) {
      throw new CliError('--watch requires an interactive terminal.');
    }
    const encoder = new TextEncoder();
    await runLiveView({
      intervalMs,
      render: createQueryTopFrameRenderer(fetchSnapshot, {
        intervalMs,
        sortKey,
      }),
      write: text => sink.writeBytes(encoder.encode(text)),
    });
  },
});

const MIN_INTERVAL_MS = 200;

function parseIntervalMs(value: string): number {
  const seconds = Number(value.trim());
  const intervalMs = Math.round(seconds * 1_000);
  if (!Number.isFinite(seconds) || intervalMs < MIN_INTERVAL_MS) {
    throw new CliError(
      `Invalid --interval: must be a number of seconds >= ${MIN_INTERVAL_MS / 1_000}.`
    );
  }
  return intervalMs;
}
