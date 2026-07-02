import { describe, expect, test } from 'vitest';

import { parseCliArgs } from '../src/config.js';

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
});
