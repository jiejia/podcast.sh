import { afterEach, describe, expect, test } from 'vitest';

import { getConfiguredTypesFromEnv, getDefaultLangFromEnv, loadConfig, loadMaintenanceConfig, parseCliArgs } from '../src/config.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('parseCliArgs', () => {
  test('accepts process.argv style input', () => {
    process.env = {
      ...originalEnv,
      PODCAST_LANG: 'zh-CN',
      TYPES: 'tv,movie',
      REGIONS: 'US,JP',
    };

    const result = parseCliArgs([
      'node',
      'src/index.ts',
      '--type=tv',
      '--limit=3',
      '--lang=ja-JP',
      '--format=deep-dive',
    ]);

    expect(result).toEqual({
      types: ['tv'],
      limit: 3,
      lang: 'ja-JP',
      format: 'deep-dive',
      wpStatus: 'publish',
      verbose: false,
    });
  });

  test('defaults CLI types to env TYPES and rejects values outside it', () => {
    process.env = {
      ...originalEnv,
      PODCAST_LANG: 'zh-CN',
      TYPES: 'tv,movie',
      REGIONS: 'US,JP',
    };

    expect(parseCliArgs([
      'node',
      'src/index.ts',
    ])).toEqual({
      types: ['tv', 'movie'],
      limit: 2,
      lang: 'zh-CN',
      format: 'deep-dive',
      wpStatus: 'publish',
      verbose: false,
    });

    expect(() => {
      parseCliArgs([
        'node',
        'src/index.ts',
        '--limit=1',
      ]);
    }).toThrow('`--type` is required when `--limit` is provided');

    expect(() => {
      parseCliArgs([
        'node',
        'src/index.ts',
        '--type=anime',
      ]);
    }).toThrow('Unsupported --type value: anime. Allowed values: tv, movie');
  });

  test('loads RESOURCE_START_SCORE from env', () => {
    process.env = {
      ...originalEnv,
      WORDPRESS_USERNAME: 'admin',
      WORDPRESS_APP_PASSWORD: 'app-password',
      WORDPRESS_SITE_URL: 'http://localhost:7007',
      WORDPRESS_SITE_SLUG: 'localhost7007',
      TMDB_API_TOKEN: 'tmdb-token',
      PODCAST_LANG: 'zh-CN',
      TYPES: 'tv,movie',
      REGIONS: 'US, JP',
      RESOURCE_START_DATE: '2025-06-25',
      RESOURCE_START_SCORE: '7.8',
      STORAGE_DIR: './storage',
    };

    const config = loadConfig({
      types: ['tv'],
      limit: 3,
      lang: 'zh-CN',
      format: 'deep-dive',
      wpStatus: 'publish',
      verbose: false,
    });

    expect(config.resourceStartScore).toBe(7.8);
    expect(config.configuredTypes).toEqual(['tv', 'movie']);
    expect(config.regions).toEqual(['US', 'JP']);
  });

  test('parses TYPES from env and rejects empty values', () => {
    expect(getConfiguredTypesFromEnv({
      ...originalEnv,
      TYPES: 'tv, movie',
    })).toEqual(['tv', 'movie']);

    expect(() => {
      getConfiguredTypesFromEnv({
        ...originalEnv,
        TYPES: '',
      });
    }).toThrow();
  });

  test('rejects invalid REGIONS values', () => {
    process.env = {
      ...originalEnv,
      WORDPRESS_USERNAME: 'admin',
      WORDPRESS_APP_PASSWORD: 'app-password',
      WORDPRESS_SITE_URL: 'http://localhost:7007',
      WORDPRESS_SITE_SLUG: 'localhost7007',
      TMDB_API_TOKEN: 'tmdb-token',
      PODCAST_LANG: 'zh-CN',
      TYPES: 'tv,movie',
      REGIONS: 'USA,JP',
      RESOURCE_START_DATE: '2025-06-25',
      RESOURCE_START_SCORE: '7.8',
      STORAGE_DIR: './storage',
    };

    expect(() => {
      loadConfig({
        types: ['tv'],
        limit: 3,
        lang: 'zh-CN',
        format: 'deep-dive',
        wpStatus: 'publish',
        verbose: false,
      });
    }).toThrow('Unsupported REGIONS value(s): USA. Expected ISO 3166-1 style two-letter codes.');
  });

  test('maintenance config ignores fetch-related env values', () => {
    process.env = {
      ...originalEnv,
      WORDPRESS_USERNAME: 'admin',
      WORDPRESS_APP_PASSWORD: 'app-password',
      WORDPRESS_SITE_URL: 'http://localhost:7007',
      STORAGE_DIR: './storage',
      TYPES: 'tv,anime,movie',
    };

    const config = loadMaintenanceConfig();

    expect(config.wordpressSiteUrl).toBe('http://localhost:7007');
    expect(config.storageDir.endsWith('/storage')).toBe(true);
  });

  test('reads default language from env', () => {
    expect(getDefaultLangFromEnv({
      ...originalEnv,
      PODCAST_LANG: 'en-US',
    })).toBe('en-US');
  });
});
