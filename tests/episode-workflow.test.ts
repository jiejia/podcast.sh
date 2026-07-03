import { describe, expect, test } from 'vitest';

import {
  decidePublishedRecordRepair,
  normalizeEpisodeRecordData,
  shouldRefreshGeneratedAssets,
} from '../src/lib/episode-workflow.js';
import type { EpisodeRecord } from '../src/types.js';

function buildRecord(overrides: Partial<EpisodeRecord> = {}): EpisodeRecord {
  return {
    id: 1,
    source_item_id: '123',
    type: 'tv',
    name: 'Test',
    source_website_url: 'https://www.themoviedb.org/tv/123',
    notebook_id: 'notebook-1',
    wordpress_post_id: 99,
    wordpress_site_url: 'https://example.com',
    podcast_feature_image_file_path: '/tmp/poster.jpg',
    podcast_audio_file_path: '/tmp/audio.m4a',
    podcast_format: 'brief',
    podcast_title: '《Test》标题',
    podcast_description: '第一段\n\n第二段',
    podcast_tags: '剧集, 新作',
    podcast_lang: '中文',
    status: 'published',
    error_message: null,
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('episode workflow helpers', () => {
  test('normalizes wrapped notebook output and tags', () => {
    const normalized = normalizeEpisodeRecordData(buildRecord({
      podcast_description: '{"answer":"第一段\\n\\n第二段"}',
      podcast_tags: '{"answer":"剧集, 新作, 新作, 解析 [1-3]。"}',
    }));

    expect(normalized.description).toBe('第一段\n\n第二段');
    expect(normalized.tagNames).toEqual(['剧集', '新作', '解析']);
    expect(normalized.hasStoredNormalizationDiff).toBe(true);
  });

  test('detects generated asset refresh need when stored content is malformed', () => {
    expect(shouldRefreshGeneratedAssets(buildRecord({
      podcast_description: '{"answer":"简介"}',
      podcast_tags: '{"answer":"标签1, 标签2"}',
      status: 'generated',
    }))).toBe(true);
  });

  test('repairs published records when WordPress post is missing', () => {
    const decision = decidePublishedRecordRepair(buildRecord(), {
      audioFileUrl: null,
      exists: false,
    });

    expect(decision).toEqual({
      reason: 'WordPress post is missing and local record can be republished',
      resetWordPressPostId: true,
      shouldRepair: true,
    });
  });

  test('repairs published records when audio binding is missing remotely', () => {
    const decision = decidePublishedRecordRepair(buildRecord(), {
      audioFileUrl: '',
      exists: true,
    });

    expect(decision).toEqual({
      reason: 'WordPress post is missing Audio File binding',
      resetWordPressPostId: false,
      shouldRepair: true,
    });
  });
});
