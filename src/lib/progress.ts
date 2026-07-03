import ora, { type Ora } from 'ora';

import type { ProgressReporter } from '../types.js';

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function renderBar(percent: number): string {
  const width = Math.max(10, Math.min(24, Math.floor((process.stdout.columns ?? 100) * 0.2)));
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);
  return `[${'='.repeat(filled)}${'-'.repeat(width - filled)}] ${String(clamped).padStart(3, ' ')}%`;
}

function buildLine(prefix: string, percent: number, status: string): string {
  return `${prefix} ${renderBar(percent)} ${truncate(status, 80)}`;
}

export function createProgressReporter(enabled: boolean): ProgressReporter {
  if (!enabled) {
    return {
      note() {},
      beginItem() {},
      update() {},
      complete() {},
      fail() {},
    };
  }

  let prefix = '';
  let spinner: Ora | null = null;

  function ensureSpinner(text: string): Ora {
    if (spinner) {
      spinner.text = text;
      return spinner;
    }

    spinner = ora({
      hideCursor: true,
      text,
    }).start();
    return spinner;
  }

  function clearSpinner(): void {
    if (!spinner) {
      return;
    }

    spinner.stop();
    spinner = null;
  }

  return {
    note(message) {
      clearSpinner();
      process.stdout.write(`${message}\n`);
    },
    beginItem(index, total, label) {
      prefix = `[${index}/${total}] ${truncate(label, 48)}`;
      ensureSpinner(buildLine(prefix, 0, '准备中'));
    },
    update(percent, status) {
      ensureSpinner(buildLine(prefix, percent, status));
    },
    complete(status) {
      const instance = ensureSpinner(buildLine(prefix, 100, status));
      instance.succeed(buildLine(prefix, 100, status));
      spinner = null;
    },
    fail(message) {
      const instance = ensureSpinner(buildLine(prefix, 100, `FAILED ${message}`));
      instance.fail(buildLine(prefix, 100, `FAILED ${message}`));
      spinner = null;
    },
  };
}
