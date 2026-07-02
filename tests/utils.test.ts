import { describe, expect, test } from 'vitest';

import {
  buildNotebookTitle,
  buildPodcastTitle,
  normalizeNotebookLanguage,
  normalizePodcastFormat,
  parsePodcastTags,
} from '../src/lib/utils.js';

describe('utils', () => {
  test('normalizes podcast format for NotebookLM CLI', () => {
    expect(normalizePodcastFormat('deep-dive')).toBe('deep_dive');
    expect(normalizePodcastFormat('brief')).toBe('brief');
  });

  test('normalizes language aliases', () => {
    expect(normalizeNotebookLanguage('中文')).toBe('zh-CN');
    expect(normalizeNotebookLanguage('English')).toBe('en');
    expect(normalizeNotebookLanguage('es-419')).toBe('es-419');
  });

  test('builds notebook title from local episode id', () => {
    expect(buildNotebookTitle({
      id: 20,
      type: 'tv',
      name: '90\'s - A Middle Class Biopic',
    })).toBe('000020. TV《90\'s - A Middle Class Biopic》');
  });

  test('builds podcast title from resource name and artifact name', () => {
    expect(buildPodcastTitle('逐玉', '粉底液将军审美之争.m4a')).toBe('《逐玉》粉底液将军审美之争');
  });

  test('parses and de-duplicates tags', () => {
    expect(parsePodcastTags('动漫， 热门, 热门, 剧情, , 配音')).toEqual(['动漫', '热门', '剧情', '配音']);
  });
});
