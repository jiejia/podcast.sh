import { describe, expect, test } from 'vitest';

import {
  buildNotebookTitle,
  buildPodcastTitle,
  extractNotebookAnswer,
  normalizeNotebookLanguage,
  normalizeNotebookText,
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
    expect(buildNotebookTitle('localhost7007', {
      id: 20,
      type: 'tv',
      name: '90\'s - A Middle Class Biopic',
    })).toBe('localhost7007-000020. TV《90\'s - A Middle Class Biopic》');
  });

  test('builds podcast title from resource name and artifact name', () => {
    expect(buildPodcastTitle('逐玉', '粉底液将军审美之争.m4a')).toBe('《逐玉》粉底液将军审美之争');
  });

  test('extracts answer text from json response wrapper', () => {
    expect(extractNotebookAnswer('{"answer":"你好世界","conversation_id":"abc"}')).toBe('你好世界');
    expect(normalizeNotebookText('{"answer":"第一段\\n\\n第二段"}')).toBe('第一段\n\n第二段');
  });

  test('parses and de-duplicates tags', () => {
    expect(parsePodcastTags('动漫， 热门, 热门, 剧情, , 配音')).toEqual(['动漫', '热门', '剧情', '配音']);
    expect(parsePodcastTags('{"answer":"魔法少女小圆, 魔女之夜的回天, 晓美焰, 剧情预测, 可爱美学, 动漫解析 [1-4]。"}')).toEqual([
      '魔法少女小圆',
      '魔女之夜的回天',
      '晓美焰',
      '剧情预测',
      '可爱美学',
      '动漫解析',
    ]);
  });
});
