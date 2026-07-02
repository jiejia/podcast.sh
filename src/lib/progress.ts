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

  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let prefix = '';
  let active = false;
  let lastPercent = 0;
  let lastStatus = '';
  let spinnerIndex = 0;
  let timer: NodeJS.Timeout | null = null;

  function draw(percent: number, status: string, persist: boolean): void {
    const width = Math.max(10, Math.min(24, Math.floor((process.stdout.columns ?? 100) * 0.2)));
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    const filled = Math.round((clamped / 100) * width);
    const spinner = spinnerFrames[spinnerIndex % spinnerFrames.length];
    let bar = `${'='.repeat(filled)}${'-'.repeat(width - filled)}`;

    if (!persist) {
      const remaining = Math.max(0, width - filled);
      const animatedTail = remaining > 0
        ? spinner.repeat(remaining)
        : '';
      bar = `${'='.repeat(filled)}${animatedTail}`;
    }

    const line = `${prefix} [${bar}] ${String(clamped).padStart(3, ' ')}% ${truncate(status, 80)}`;

    process.stdout.write(`\r\x1b[2K${line}`);

    if (persist) {
      process.stdout.write('\n');
    }
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function ensureTimer(): void {
    if (timer || !active) {
      return;
    }

    timer = setInterval(() => {
      if (!active) {
        stopTimer();
        return;
      }

      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      draw(lastPercent, lastStatus, false);
    }, 120);
    timer.unref?.();
  }

  function render(percent: number, status: string, persist: boolean): void {
    lastPercent = percent;
    lastStatus = status;
    active = !persist;
    draw(percent, status, persist);

    if (persist) {
      stopTimer();
    } else {
      ensureTimer();
    }
  }

  return {
    note(message) {
      if (active) {
        stopTimer();
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
