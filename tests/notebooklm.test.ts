import { describe, expect, test, vi } from 'vitest';

import { NotebookLmService } from '../src/services/notebooklm.js';

describe('NotebookLmService', () => {
  test('backs off and retries audio generation after a rate-limit failure', async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const executor = vi.fn()
      .mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'RPC rate limit (RESOURCE_EXHAUSTED)',
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });
    const delays: number[] = [];
    const service = new NotebookLmService(logger, {
      executor,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    await service.createAudio('notebook-1', 'deep-dive', 'en');

    expect(executor).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([30_000]);
    expect(logger.info).toHaveBeenCalledWith(
      'NotebookLM audio generation rate limited; retrying',
      expect.objectContaining({
        notebookId: 'notebook-1',
        attempt: 1,
        nextAttempt: 2,
        delayMs: 30_000,
      }),
    );
  });

  test('does not retry non-rate-limit failures', async () => {
    const executor = vi.fn().mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Notebook not found',
    });
    const service = new NotebookLmService(
      { info: vi.fn(), error: vi.fn() },
      { executor, sleep: vi.fn() },
    );

    await expect(service.createAudio('notebook-1', 'deep-dive', 'en')).rejects.toThrow('Notebook not found');
    expect(executor).toHaveBeenCalledTimes(1);
  });
});
