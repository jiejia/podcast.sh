import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { nowIso } from './lib/utils.js';
import type { CandidateResource, EpisodeRecord, EpisodeType } from './types.js';

export class EpisodeRepository {
  private readonly db: Database.Database;

  public constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  public close(): void {
    this.db.close();
  }

  public listAll(siteUrl?: string): EpisodeRecord[] {
    if (siteUrl) {
      const stmt = this.db.prepare(`
        SELECT *
        FROM episode
        WHERE wordpress_site_url = ?
        ORDER BY id ASC
      `);

      return stmt.all(siteUrl) as EpisodeRecord[];
    }

    const stmt = this.db.prepare(`
      SELECT *
      FROM episode
      ORDER BY id ASC
    `);

    return stmt.all() as EpisodeRecord[];
  }

  public listBacklog(siteUrl: string, types: EpisodeType[], limit: number): EpisodeRecord[] {
    const placeholders = types.map(() => '?').join(', ');
    const stmt = this.db.prepare(`
      SELECT *
      FROM episode
      WHERE wordpress_site_url = ?
        AND status != 'published'
        AND type IN (${placeholders})
      ORDER BY datetime(created_at) ASC, id ASC
      LIMIT ?
    `);

    return stmt.all(siteUrl, ...types, limit) as EpisodeRecord[];
  }

  public listPublished(siteUrl: string, types: EpisodeType[]): EpisodeRecord[] {
    const placeholders = types.map(() => '?').join(', ');
    const stmt = this.db.prepare(`
      SELECT *
      FROM episode
      WHERE wordpress_site_url = ?
        AND status = 'published'
        AND wordpress_post_id IS NOT NULL
        AND type IN (${placeholders})
      ORDER BY id ASC
    `);

    return stmt.all(siteUrl, ...types) as EpisodeRecord[];
  }

  public findByUniqueKey(siteUrl: string, type: EpisodeType, sourceItemId: string): EpisodeRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT *
      FROM episode
      WHERE wordpress_site_url = ?
        AND type = ?
        AND source_item_id = ?
      LIMIT 1
    `);

    return stmt.get(siteUrl, type, sourceItemId) as EpisodeRecord | undefined;
  }

  public findById(id: number): EpisodeRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM episode WHERE id = ? LIMIT 1');
    return stmt.get(id) as EpisodeRecord | undefined;
  }

  public insertPending(candidate: CandidateResource, wordpressSiteUrl: string, posterPath: string, podcastLang: string): EpisodeRecord {
    const timestamp = nowIso();
    const stmt = this.db.prepare(`
      INSERT INTO episode (
        source_item_id,
        type,
        name,
        source_website_url,
        notebook_id,
        wordpress_post_id,
        wordpress_site_url,
        podcast_feature_image_file_path,
        podcast_audio_file_path,
        podcast_format,
        podcast_title,
        podcast_description,
        podcast_tags,
        podcast_lang,
        status,
        error_message,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 'pending', NULL, ?, ?)
    `);

    const result = stmt.run(
      candidate.sourceItemId,
      candidate.type,
      candidate.name,
      candidate.sourceWebsiteUrl,
      wordpressSiteUrl,
      posterPath,
      podcastLang,
      timestamp,
      timestamp,
    );

    return this.findById(Number(result.lastInsertRowid)) as EpisodeRecord;
  }

  public updateNotebookId(id: number, notebookId: string): void {
    this.db.prepare(`
      UPDATE episode
      SET notebook_id = ?, error_message = NULL, updated_at = ?
      WHERE id = ?
    `).run(notebookId, nowIso(), id);
  }

  public updateGenerated(
    id: number,
    values: {
      audioPath: string;
      format: string;
      title: string;
      description: string;
      tags: string[];
    },
  ): void {
    this.db.prepare(`
      UPDATE episode
      SET podcast_audio_file_path = ?,
          podcast_format = ?,
          podcast_title = ?,
          podcast_description = ?,
          podcast_tags = ?,
          status = 'generated',
          error_message = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(
      values.audioPath,
      values.format,
      values.title,
      values.description,
      values.tags.join(', '),
      nowIso(),
      id,
    );
  }

  public updatePosterPath(id: number, posterPath: string): void {
    this.db.prepare(`
      UPDATE episode
      SET podcast_feature_image_file_path = ?, updated_at = ?
      WHERE id = ?
    `).run(posterPath, nowIso(), id);
  }

  public markPublished(id: number, wordpressPostId: number): void {
    this.db.prepare(`
      UPDATE episode
      SET wordpress_post_id = ?,
          status = 'published',
          error_message = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(wordpressPostId, nowIso(), id);
  }

  public prepareForRepublish(id: number, wordpressPostId: number | null): void {
    this.db.prepare(`
      UPDATE episode
      SET wordpress_post_id = ?,
          status = 'generated',
          error_message = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(wordpressPostId, nowIso(), id);
  }

  public markFailed(id: number, message: string): void {
    this.db.prepare(`
      UPDATE episode
      SET status = 'failed',
          error_message = ?,
          updated_at = ?
      WHERE id = ?
    `).run(message.slice(0, 4000), nowIso(), id);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episode (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_item_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('movie', 'tv')),
        name TEXT NOT NULL,
        source_website_url TEXT NOT NULL,
        notebook_id TEXT,
        wordpress_post_id INTEGER,
        wordpress_site_url TEXT NOT NULL,
        podcast_feature_image_file_path TEXT,
        podcast_audio_file_path TEXT,
        podcast_format TEXT,
        podcast_title TEXT,
        podcast_description TEXT,
        podcast_tags TEXT,
        podcast_lang TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'generated', 'published', 'failed')),
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS episode_unique_source
      ON episode (wordpress_site_url, type, source_item_id);
    `);
  }
}
