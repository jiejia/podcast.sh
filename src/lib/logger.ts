import type { Logger } from '../types.js';

function write(level: 'INFO' | 'ERROR', message: string, context?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function createLogger(verbose: boolean): Logger {
  return {
    info(message, context) {
      if (!verbose) {
        return;
      }
      write('INFO', message, context);
    },
    error(message, context) {
      if (!verbose) {
        return;
      }
      write('ERROR', message, context);
    },
  };
}
