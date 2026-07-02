import fs from 'node:fs';
import path from 'node:path';

import { EpisodeRepository } from './db.js';
import { buildNotebookTitle, buildResearchQuery, inferExtensionFromUrl, parsePodcastTags, sanitizeFilename } from './lib/utils.js';
import { downloadToFile } from './services/files.js';
import { BangumiService } from './services/bangumi.js';
import { NotebookLmService } from './services/notebooklm.js';
import { TmdbService } from './services/tmdb.js';
import { WordPressService } from './services/wordpress.js';
import type { AppConfig, CandidateResource, EpisodeRecord, EpisodeType, Logger, ProgressReporter } from './types.js';

export class PodcastPipeline {
  private readonly repository: EpisodeRepository;
  private readonly notebookLm: NotebookLmService;
  private readonly tmdb: TmdbService;
  private readonly bangumi: BangumiService;
  private readonly wordpress: WordPressService;

  public constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly progress: ProgressReporter,
  ) {
    this.repository = new EpisodeRepository(config.dbPath);
    this.notebookLm = new NotebookLmService(logger);
    this.tmdb = new TmdbService(config.tmdbApiToken);
    this.bangumi = new BangumiService(config.bangumiApiToken);
    this.wordpress = new WordPressService(
      config.wordpressSiteUrl,
      config.wordpressUsername,
      config.wordpressAppPassword,
      logger,
    );
  }

  public async run(): Promise<void> {
    let failed = false;
    try {
      await this.preflight();
      const backlog = this.repository.listBacklog(
        this.config.wordpressSiteUrl,
        this.config.cli.types,
        this.config.cli.limit,
      );
      const remaining = this.config.cli.limit - backlog.length;
      const candidates = remaining > 0
        ? await this.collectNewCandidates(remaining)
        : [];
      const createdRecords: EpisodeRecord[] = [];
      for (const candidate of candidates) {
        createdRecords.push(await this.createPendingRecord(candidate));
      }

      const records = [...backlog, ...createdRecords];
      if (records.length === 0) {
        this.progress.note('没有找到可处理的记录。');
      }

      for (const [index, record] of records.entries()) {
        failed = (await this.processRecord(record, index + 1, records.length)) === false || failed;
      }

    } finally {
      this.repository.close();
    }

    if (failed) {
      throw new Error('One or more episodes failed to process');
    }
  }

  private async preflight(): Promise<void> {
    this.logger.info('Preflight started', {
      storageDir: this.config.storageDir,
      siteUrl: this.config.wordpressSiteUrl,
      limit: this.config.cli.limit,
      types: this.config.cli.types,
    });

    this.progress.note('Preflight: 检查本地环境、NotebookLM 登录状态和 WordPress 接口。');
    fs.accessSync(this.config.storageDir, fs.constants.W_OK);
    await this.notebookLm.checkLogin();
    await this.wordpress.preflight();
  }

  private async collectNewCandidates(needed: number): Promise<CandidateResource[]> {
    const perType = new Map<EpisodeType, CandidateResource[]>();
    for (const type of this.config.cli.types) {
      perType.set(type, await this.fetchTypeCandidates(type, needed));
    }

    const selected: CandidateResource[] = [];
    while (selected.length < needed) {
      let advanced = false;
      for (const type of this.config.cli.types) {
        const queue = perType.get(type) ?? [];
        const next = queue.shift();
        if (!next) {
          continue;
        }
        selected.push(next);
        advanced = true;
        if (selected.length >= needed) {
          break;
        }
      }
      if (!advanced) {
        break;
      }
    }

    return selected;
  }

  private async fetchTypeCandidates(type: EpisodeType, limit: number): Promise<CandidateResource[]> {
    const raw = type === 'anime'
      ? await this.bangumi.fetchCandidates(this.config.resourceStartDate, limit)
      : await this.tmdb.fetchCandidates(type, this.config.resourceStartDate, limit);

    return raw.filter((candidate) => !this.repository.findByUniqueKey(
      this.config.wordpressSiteUrl,
      candidate.type,
      candidate.sourceItemId,
    ));
  }

  private async createPendingRecord(candidate: CandidateResource): Promise<EpisodeRecord> {
    const ext = inferExtensionFromUrl(candidate.posterUrl);
    const posterPath = path.join(
      this.config.posterDir,
      candidate.type,
      `${candidate.sourceItemId}${ext}`,
    );
    await downloadToFile(candidate.posterUrl, posterPath);

    return this.repository.insertPending(
      candidate,
      this.config.wordpressSiteUrl,
      posterPath,
      this.config.cli.lang,
    );
  }

  private async processRecord(input: EpisodeRecord, index: number, total: number): Promise<boolean> {
    let record = input;
    const label = `${record.id.toString().padStart(6, '0')} ${buildResearchQuery(record.type, record.name)}`;
    this.progress.beginItem(index, total, label);
    this.logger.info('Processing episode', {
      episodeId: record.id,
      status: record.status,
      sourceItemId: record.source_item_id,
      type: record.type,
    });

    try {
      if (!record.notebook_id) {
        this.progress.update(15, '创建 NotebookLM notebook');
        const notebookId = await this.notebookLm.createNotebook(buildNotebookTitle(record));
        this.repository.updateNotebookId(record.id, notebookId);
        record = this.mustGetRecord(record.id);
      } else {
        this.progress.update(20, '复用已有 notebook');
      }

      if (
        !record.podcast_audio_file_path
        || !record.podcast_title
        || !record.podcast_description
        || !record.podcast_tags
      ) {
        await this.ensureGeneratedAssets(record);
        record = this.mustGetRecord(record.id);
      } else {
        this.progress.update(92, '复用已生成的播客素材');
      }

      await this.publishRecord(record);
      this.progress.complete('已完成并写入本地状态');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.repository.markFailed(record.id, message);
      this.logger.error('Episode processing failed', {
        episodeId: record.id,
        error: message,
      });
      this.progress.fail(message);
      return false;
    }
  }

  private async ensureGeneratedAssets(record: EpisodeRecord): Promise<void> {
    if (!record.notebook_id) {
      throw new Error(`Episode ${record.id} is missing notebook_id`);
    }

    let description = record.podcast_description?.trim() ?? '';
    let tags = parsePodcastTags(record.podcast_tags ?? '');
    let artifactTitle = record.podcast_title ?? '';
    let audioPath = record.podcast_audio_file_path ?? '';

    if (!description || tags.length === 0) {
      this.progress.update(30, '搜索资料并导入 sources');
      await this.notebookLm.runResearch(record.notebook_id, buildResearchQuery(record.type, record.name));
      this.progress.update(50, '请求生成播客音频');
      await this.notebookLm.createAudio(record.notebook_id, this.config.cli.format, this.config.cli.lang);
    }

    if (!description) {
      this.progress.update(60, '生成播客简介');
      description = (await this.notebookLm.queryText(
        record.notebook_id,
        `帮我生成播客的简介（纯文字，里面不能有超链接和引用，300字左右），语言用${this.config.cli.lang}`,
      )).trim();
    }

    if (tags.length === 0) {
      this.progress.update(66, '生成播客标签');
      const tagsText = await this.notebookLm.queryText(
        record.notebook_id,
        `帮我生成播客的标签（标签之间用逗号分隔，最多6个），语言用${this.config.cli.lang}`,
      );
      tags = parsePodcastTags(tagsText);
    }

    if (!audioPath || !fs.existsSync(audioPath) || !artifactTitle) {
      this.progress.update(72, '等待音频生成');
      const artifact = await this.notebookLm.waitForAudioArtifact(record.notebook_id, {
        onPoll: ({ elapsedMs, timeoutMs }) => {
          const ratio = timeoutMs > 0 ? Math.min(elapsedMs / timeoutMs, 1) : 0;
          const percent = 72 + Math.round(ratio * 18);
          this.progress.update(percent, '等待音频生成');
        },
      });
      const audioFilename = `${sanitizeFilename(artifact.title || `episode-${record.id}`)}.m4a`;
      audioPath = path.join(this.config.audioDir, String(record.id), audioFilename);
      this.progress.update(92, '下载音频文件');
      await this.notebookLm.downloadAudio(record.notebook_id, artifact.id, audioPath);
      artifactTitle = this.notebookLm.buildPodcastTitle(record.name, { title: artifact.title || audioFilename });
    }

    this.repository.updateGenerated(record.id, {
      audioPath,
      format: record.podcast_format ?? this.config.cli.format,
      title: artifactTitle || record.name,
      description,
      tags,
    });
  }

  private async publishRecord(record: EpisodeRecord): Promise<void> {
    if (record.wordpress_post_id) {
      this.logger.info('Skipping publish because WordPress post already exists', {
        episodeId: record.id,
        wordpressPostId: record.wordpress_post_id,
      });
      return;
    }

    const posterPath = await this.ensurePosterPath(record);
    const audioPath = record.podcast_audio_file_path;
    if (!audioPath) {
      throw new Error(`Episode ${record.id} is missing podcast_audio_file_path`);
    }

    this.progress.update(95, '上传封面图片');
    const imageId = await this.wordpress.uploadMedia(posterPath);
    this.progress.update(97, '上传播客音频');
    const audioId = await this.wordpress.uploadMedia(audioPath);
    this.progress.update(98, '同步 WordPress 标签');
    const tagIds = await this.wordpress.ensureTags(parsePodcastTags(record.podcast_tags ?? ''));
    this.progress.update(99, '创建 WordPress 文章');
    const postId = await this.wordpress.createEpisodePost({
      title: record.podcast_title ?? record.name,
      content: record.podcast_description ?? '',
      excerpt: record.podcast_description ?? '',
      tagIds,
      featuredMediaId: imageId,
      audioMediaId: audioId,
      imageMediaId: imageId,
      status: this.config.cli.wpStatus,
    });
    this.repository.markPublished(record.id, postId);
  }

  private async ensurePosterPath(record: EpisodeRecord): Promise<string> {
    const current = record.podcast_feature_image_file_path;
    if (current && fs.existsSync(current)) {
      return current;
    }

    const basePath = path.join(this.config.posterDir, record.type, record.source_item_id);
    const downloaded = record.type === 'anime'
      ? await this.bangumi.redownloadPoster(record.source_item_id, basePath)
      : await this.tmdb.redownloadPoster(record.type, record.source_item_id, basePath);

    this.repository.updatePosterPath(record.id, downloaded);
    return downloaded;
  }

  private mustGetRecord(id: number): EpisodeRecord {
    const record = this.repository.findById(id);
    if (!record) {
      throw new Error(`Episode ${id} no longer exists`);
    }

    return record;
  }
}
