import dotenv from 'dotenv';

dotenv.config({ override: true });

import { loadMaintenanceConfig } from './config.js';
import { EpisodeRepository } from './db.js';
import { createLogger } from './lib/logger.js';
import { createProgressReporter } from './lib/progress.js';
import { displayType } from './lib/utils.js';
import { buildLocalDataPaths, resetLocalData } from './lib/local-data.js';
import { NotebookLmService } from './services/notebooklm.js';
import { WordPressService } from './services/wordpress.js';

async function main(): Promise<void> {
  const config = loadMaintenanceConfig();
  const logger = createLogger(false, config.runLogPath);
  const progress = createProgressReporter(true);
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
    const totalItems = records.length + 1;

    progress.note(`日志文件: ${config.runLogPath}`);
    progress.note('Reset: 删除脚本关联的 WordPress / NotebookLM 数据，并清空本地存储。');

    for (const [index, record] of records.entries()) {
      const label = `${record.id.toString().padStart(6, '0')} ${displayType(record.type)}《${record.name}》`;
      progress.beginItem(index + 1, totalItems, label);

      try {
        if (record.wordpress_post_id) {
          progress.update(25, '读取 WordPress 文章与媒体关联');
          const post = await wordpress.getEpisodePost(record.wordpress_post_id);
          const mediaIds = post ? wordpress.extractEpisodeMediaIds(post) : [];
          progress.update(45, '删除 WordPress 文章');
          await wordpress.deleteEpisodePost(record.wordpress_post_id);
          if (mediaIds.length > 0) {
            progress.update(60, `删除 WordPress 媒体 ${mediaIds.length} 个`);
          }
          for (const [mediaIndex, mediaId] of mediaIds.entries()) {
            const percent = 60 + Math.round(((mediaIndex + 1) / mediaIds.length) * 20);
            progress.update(percent, `删除 WordPress 媒体 ${mediaIndex + 1}/${mediaIds.length}`);
            await wordpress.deleteMedia(mediaId);
          }
        } else {
          progress.update(45, '没有 WordPress 文章，跳过');
        }

        if (record.notebook_id) {
          progress.update(85, '删除 NotebookLM notebook');
          await notebookLm.deleteNotebook(record.notebook_id);
        } else {
          progress.update(85, '没有 NotebookLM notebook，跳过');
        }

        progress.complete('远端对象删除完成');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        progress.fail(message);
        throw error;
      }
    }

    progress.beginItem(totalItems, totalItems, '清空本地存储');
    try {
      progress.update(35, '删除本地 db / posters / audio');
      const result = await resetLocalData(paths);
      progress.update(85, '重建本地目录');
      progress.complete('本地数据已清空');

      logger.info('Script data reset complete', {
        storageDir: paths.storageDir,
        recordsProcessed: records.length,
        removedPaths: result.removedPaths,
        recreatedPaths: result.recreatedPaths,
        note: 'Local data, linked WordPress episode posts/media, and linked NotebookLM notebooks were removed.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progress.fail(message);
      throw error;
    }
  } finally {
    repository.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
