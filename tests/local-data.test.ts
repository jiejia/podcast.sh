import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { buildLocalDataPaths, removeLocalFile, resetLocalData } from '../src/lib/local-data.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('resetLocalData', () => {
  test('removes a local episode file and tolerates an already missing file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-sh-file-'));
    cleanupPaths.push(dir);
    const filePath = path.join(dir, 'episode.m4a');
    fs.writeFileSync(filePath, 'audio');

    await removeLocalFile(filePath);
    await removeLocalFile(filePath);

    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('removes local db, poster, and audio data then recreates empty folders', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-sh-reset-'));
    cleanupPaths.push(dir);

    const paths = buildLocalDataPaths(dir);
    fs.mkdirSync(paths.dbDir, { recursive: true });
    fs.mkdirSync(path.join(paths.posterDir, 'tv'), { recursive: true });
    fs.mkdirSync(path.join(paths.audioDir, '1'), { recursive: true });
    fs.writeFileSync(path.join(paths.dbDir, 'podcast.sqlite'), 'test');
    fs.writeFileSync(path.join(paths.posterDir, 'tv', 'cover.jpg'), 'poster');
    fs.writeFileSync(path.join(paths.audioDir, '1', 'audio.m4a'), 'audio');

    const result = await resetLocalData(paths);

    expect(result.removedPaths).toEqual([paths.dbDir, paths.posterDir, paths.audioDir]);
    expect(fs.existsSync(paths.dbDir)).toBe(true);
    expect(fs.existsSync(paths.posterDir)).toBe(true);
    expect(fs.existsSync(paths.audioDir)).toBe(true);
    expect(fs.readdirSync(paths.dbDir)).toEqual([]);
    expect(fs.readdirSync(paths.posterDir)).toEqual([]);
    expect(fs.readdirSync(paths.audioDir)).toEqual([]);
  });
});
