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
  let active = false;

  function render(percent: number, status: string, persist: boolean): void {
    const width = Math.max(10, Math.min(24, Math.floor((process.stdout.columns ?? 100) * 0.2)));
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    const filled = Math.round((clamped / 100) * width);
    const bar = `${'='.repeat(filled)}${'-'.repeat(width - filled)}`;
    const line = `${prefix} [${bar}] ${String(clamped).padStart(3, ' ')}% ${truncate(status, 80)}`;

    process.stdout.write(`\r\x1b[2K${line}`);
    active = !persist;

    if (persist) {
      process.stdout.write('\n');
    }
  }

  return {
    note(message) {
      if (active) {
        process.stdout.write('\n');
        active = false;
      }
      process.stdout.write(`${message}\n`);
    },
    beginItem(index, total, label) {
      prefix = `[${index}/${total}] ${truncate(label, 48)}`;
      render(0, '准备中', false);
    },
    update(percent, status) {
      render(percent, status, false);
    },
    complete(status) {
      render(100, status, true);
    },
    fail(message) {
      render(100, `FAILED ${message}`, true);
    },
  };
}
