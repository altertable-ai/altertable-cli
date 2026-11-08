import { describe, expect, test } from 'bun:test';

import { runLiveView } from '@/ui/terminal/live-view.ts';

const ENTER_SCREEN = '\u001b[?1049h\u001b[?25l';
const LEAVE_SCREEN = '\u001b[?25h\u001b[?1049l';

function interrupt(): void {
  process.emit('SIGINT', 'SIGINT');
}

describe('runLiveView', () => {
  test('redraws frames until Ctrl+C, then restores the terminal', async () => {
    const writes: string[] = [];
    let renders = 0;
    const sigintListeners = process.listenerCount('SIGINT');

    await runLiveView({
      intervalMs: 1,
      render: async () => {
        renders += 1;
        if (renders === 3) interrupt();
        return `frame ${renders}\nsecond line`;
      },
      write: text => {
        writes.push(text);
      },
    });

    expect(writes[0]).toBe(ENTER_SCREEN);
    expect(writes.at(-1)).toBe(LEAVE_SCREEN);
    expect(writes.slice(1, -1)).toEqual([
      '\u001b[Hframe 1\u001b[K\nsecond line\u001b[K\u001b[J',
      '\u001b[Hframe 2\u001b[K\nsecond line\u001b[K\u001b[J',
    ]);
    expect(process.listenerCount('SIGINT')).toBe(sigintListeners);
  });

  test('discards a frame still rendering when interrupted', async () => {
    const writes: string[] = [];

    await runLiveView({
      intervalMs: 1_000,
      render: () => {
        interrupt();
        return new Promise(() => {});
      },
      write: text => {
        writes.push(text);
      },
    });

    expect(writes).toEqual([ENTER_SCREEN, LEAVE_SCREEN]);
  });

  test('stops waiting between frames when interrupted', async () => {
    const startedAt = Date.now();

    await runLiveView({
      intervalMs: 60_000,
      render: async () => {
        setTimeout(interrupt, 5);
        return 'frame';
      },
      write: () => {},
    });

    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
});
