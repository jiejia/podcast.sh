import dotenv from 'dotenv';

dotenv.config({ override: true });

import { loadConfig, parseCliArgs } from './config.js';
import { createLogger } from './lib/logger.js';
import { createProgressReporter } from './lib/progress.js';
import { PodcastPipeline } from './pipeline.js';

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv);
  const config = loadConfig(cli);
  const logger = createLogger(cli.verbose, config.runLogPath);
  const progress = createProgressReporter(!cli.verbose);
  const pipeline = new PodcastPipeline(config, logger, progress);
  logger.info('Run started', {
    argv: process.argv.slice(2),
    runLogPath: config.runLogPath,
  });
  if (!cli.verbose) {
    progress.note(`日志文件: ${config.runLogPath}`);
  }

  await pipeline.run();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
