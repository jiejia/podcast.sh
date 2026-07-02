import 'dotenv/config';

import { z } from 'zod';

import { createLogger } from './lib/logger.js';
import { buildLocalDataPaths, resetLocalData } from './lib/local-data.js';

const storageSchema = z.object({
  STORAGE_DIR: z.string().min(1),
});

async function main(): Promise<void> {
  const env = storageSchema.parse(process.env);
  const logger = createLogger(true);
  const paths = buildLocalDataPaths(env.STORAGE_DIR);
  const result = await resetLocalData(paths);

  logger.info('Local script data reset complete', {
    storageDir: paths.storageDir,
    removedPaths: result.removedPaths,
    recreatedPaths: result.recreatedPaths,
    note: 'WordPress posts and NotebookLM notebooks were not modified.',
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
