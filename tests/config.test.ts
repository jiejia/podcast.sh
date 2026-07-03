import { afterEach, describe, expect, test } from 'vitest';

import { loadConfig, parseCliArgs } from '../src/config.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('parseCliArgs', () => {
  test('accepts process.argv style input', () => {
    const result = parseCliArgs([
      'node',
      'src/index.ts',
      '--type=anime',
      '--limit=3',
      '--lang=中文',
      '--format=deep-dive',
    ]);

    expect(result).toEqual({
      types: ['anime'],
      limit: 3,
      lang: '中文',
      format: 'deep-dive',
      wpStatus: 'publish',
      verbose: false,
    });
  });

  test('loads RESOURCE_START_SCORE from env', () => {
    process.env = {
      ...originalEnv,
      WORDPRESS_USERNAME: 'admin',
      WORDPRESS_APP_PASSWORD: 'app-password',
      WORDPRESS_SITE_URL: 'http://localhost:7007',
      WORDPRESS_SITE_SLUG: 'localhost7007',
      TMDB_API_TOKEN: 'tmdb-token',
      BANGUMI_API_TOKEN: 'bangumi-token',
      RESOURCE_START_DATE: '2025-06-25',
      RESOURCE_START_SCORE: '7.8',
      STORAGE_DIR: './storage',
    };

    const config = loadConfig({
      types: ['anime'],
      limit: 3,
      lang: '中文',
      format: 'deep-dive',
      wpStatus: 'publish',
      verbose: false,
    });

    expect(config.resourceStartScore).toBe(7.8);
  });
});
