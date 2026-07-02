import fs from 'node:fs';

import type { Logger } from '../types.js';

function formatPayload(level: 'INFO' | 'ERROR', message: string, context?: Record<string, unknown>): string {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };
  return JSON.stringify(payload);
}

export function createLogger(verbose: boolean, logFilePath?: string): Logger {
  return {
    info(message, context) {
      const line = formatPayload('INFO', message, context);
      if (logFilePath) {
        fs.appendFileSync(logFilePath, `${line}\n`);
      }
      if (!verbose) {
        return;
      }
      process.stdout.write(`${line}\n`);
    },
    error(message, context) {
      const line = formatPayload('ERROR', message, context);
      if (logFilePath) {
        fs.appendFileSync(logFilePath, `${line}\n`);
      }
      if (!verbose) {
        return;
      }
      process.stdout.write(`${line}\n`);
    },
  };
}
