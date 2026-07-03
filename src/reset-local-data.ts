import 'dotenv/config';

import type { CliOptions } from './types.js';
import { getConfiguredTypesFromEnv, loadConfig } from './config.js';
import { EpisodeRepository } from './db.js';
import { createLogger } from './lib/logger.js';
import { buildLocalDataPaths, resetLocalData } from './lib/local-data.js';
import { NotebookLmService } from './services/notebooklm.js';
import { WordPressService } from './services/wordpress.js';

const configuredTypes = getConfiguredTypesFromEnv(process.env);

const resetCli: CliOptions = {
  types: configuredTypes,
  limit: 1,
  lang: '中文',
  format: 'brief',
  wpStatus: 'draft',
  verbose: true,
};

async function main(): Promise<void> {
  const config = loadConfig(resetCli);
  const logger = createLogger(true, config.runLogPath);
  const paths = buildLocalDataPaths(config.storageDir);
  const repository = new EpisodeRepository(config.dbPath);
  const wordpress = new WordPressService(
    config.wordpressSiteUrl,
    config.wordpressUsername,
    config.wordpressAppPassword,
    logger,
  );
  const notebookLm = new NotebookLmService(logger);

  try {
    const records = repository.listAll(config.wordpressSiteUrl);

    for (const record of records) {
      if (record.wordpress_post_id) {
        const post = await wordpress.getEpisodePost(record.wordpress_post_id);
        const mediaIds = post ? wordpress.extractEpisodeMediaIds(post) : [];
        await wordpress.deleteEpisodePost(record.wordpress_post_id);
        for (const mediaId of mediaIds) {
          await wordpress.deleteMedia(mediaId);
        }
      }

      if (record.notebook_id) {
        await notebookLm.deleteNotebook(record.notebook_id);
      }
    }

    const result = await resetLocalData(paths);

    logger.info('Script data reset complete', {
      storageDir: paths.storageDir,
      recordsProcessed: records.length,
      removedPaths: result.removedPaths,
      recreatedPaths: result.recreatedPaths,
      note: 'Local data, linked WordPress episode posts/media, and linked NotebookLM notebooks were removed.',
    });
  } finally {
    repository.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
