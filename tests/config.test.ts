import { afterEach, describe, expect, test } from 'vitest';

import { getConfiguredTypesFromEnv, loadConfig, parseCliArgs } from '../src/config.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('parseCliArgs', () => {
  test('accepts process.argv style input', () => {
    process.env = {
      ...originalEnv,
      TYPES: 'anime,tv',
    };

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

  test('defaults CLI types to env TYPES and rejects values outside it', () => {
    process.env = {
      ...originalEnv,
      TYPES: 'tv,anime',
    };

    expect(parseCliArgs([
      'node',
      'src/index.ts',
    ])).toEqual({
      types: ['tv', 'anime'],
      limit: 2,
      lang: '中文',
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
        '--type=movie',
      ]);
    }).toThrow('Unsupported --type value: movie. Allowed values: tv, anime');
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
      TYPES: 'anime,tv,movie',
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
    expect(config.configuredTypes).toEqual(['anime', 'tv', 'movie']);
  });

  test('parses TYPES from env and rejects empty values', () => {
    expect(getConfiguredTypesFromEnv({
      ...originalEnv,
      TYPES: 'tv, anime, movie',
    })).toEqual(['tv', 'anime', 'movie']);

    expect(() => {
      getConfiguredTypesFromEnv({
        ...originalEnv,
        TYPES: '',
      });
    }).toThrow();
  });
});
