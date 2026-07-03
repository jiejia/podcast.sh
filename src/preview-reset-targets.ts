import 'dotenv/config';

import type { CliOptions } from './types.js';
import { getConfiguredTypesFromEnv, loadConfig } from './config.js';
import { EpisodeRepository } from './db.js';

const configuredTypes = getConfiguredTypesFromEnv(process.env);

const previewCli: CliOptions = {
  types: configuredTypes,
  limit: 1,
  lang: '中文',
  format: 'brief',
  wpStatus: 'draft',
  verbose: true,
};

async function main(): Promise<void> {
  const config = loadConfig(previewCli);
  const repository = new EpisodeRepository(config.dbPath);

  try {
    const records = repository.listAll(config.wordpressSiteUrl);
    const rows = records.map((record) => ({
      id: record.id,
      type: record.type,
      name: record.name,
      status: record.status,
      wordpress_post_id: record.wordpress_post_id ?? '',
      notebook_id: record.notebook_id ?? '',
      has_local_poster: record.podcast_feature_image_file_path ? 'yes' : 'no',
      has_local_audio: record.podcast_audio_file_path ? 'yes' : 'no',
    }));

    process.stdout.write(`storageDir: ${config.storageDir}\n`);
    process.stdout.write(`dbPath: ${config.dbPath}\n`);
    process.stdout.write(`records: ${records.length}\n`);
    process.stdout.write(`wordpress-linked: ${records.filter((record) => record.wordpress_post_id).length}\n`);
    process.stdout.write(`notebook-linked: ${records.filter((record) => record.notebook_id).length}\n`);
    process.stdout.write('This is a preview only. Nothing was deleted.\n');

    if (rows.length === 0) {
      process.stdout.write('No local records found.\n');
      return;
    }

    console.table(rows);
  } finally {
    repository.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
