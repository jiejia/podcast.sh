import 'dotenv/config';

import { loadConfig, parseCliArgs } from './config.js';
import { createLogger } from './lib/logger.js';
import { createProgressReporter } from './lib/progress.js';
import { PodcastPipeline } from './pipeline.js';

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv);
  const config = loadConfig(cli);
  const logger = createLogger(cli.verbose);
  const progress = createProgressReporter(!cli.verbose);
  const pipeline = new PodcastPipeline(config, logger, progress);

  await pipeline.run();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
