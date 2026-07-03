import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { EpisodeRepository } from '../src/db.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('EpisodeRepository', () => {
  test('enforces unique source per site and type', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-sh-db-'));
    cleanupPaths.push(dir);
    const repository = new EpisodeRepository(path.join(dir, 'podcast.sqlite'));

    repository.insertPending({
      sourceItemId: '123',
      type: 'tv',
      name: 'Test TV',
      sourceWebsiteUrl: 'https://www.themoviedb.org/tv/123',
      posterUrl: 'https://example.com/test.jpg',
      releaseDate: '2026-01-01',
    }, 'https://example.com', '/tmp/test.jpg', '中文');

    expect(() => {
      repository.insertPending({
        sourceItemId: '123',
        type: 'tv',
        name: 'Test TV',
        sourceWebsiteUrl: 'https://www.themoviedb.org/tv/123',
        posterUrl: 'https://example.com/test.jpg',
        releaseDate: '2026-01-01',
      }, 'https://example.com', '/tmp/test.jpg', '中文');
    }).toThrow();

    repository.close();
  });

  test('orders backlog by created_at then id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-sh-db-'));
    cleanupPaths.push(dir);
    const repository = new EpisodeRepository(path.join(dir, 'podcast.sqlite'));

    const first = repository.insertPending({
      sourceItemId: '1',
      type: 'movie',
      name: 'Movie 1',
      sourceWebsiteUrl: 'https://www.themoviedb.org/movie/1',
      posterUrl: 'https://example.com/1.jpg',
      releaseDate: '2026-01-01',
    }, 'https://example.com', '/tmp/1.jpg', '中文');

    const second = repository.insertPending({
      sourceItemId: '2',
      type: 'movie',
      name: 'Movie 2',
      sourceWebsiteUrl: 'https://www.themoviedb.org/movie/2',
      posterUrl: 'https://example.com/2.jpg',
      releaseDate: '2026-01-02',
    }, 'https://example.com', '/tmp/2.jpg', '中文');

    repository.markFailed(first.id, 'boom');
    repository.updateGenerated(second.id, {
      audioPath: '/tmp/audio.m4a',
      format: 'deep-dive',
      title: 'Title',
      description: 'Desc',
      tags: ['a'],
    });

    const backlog = repository.listBacklog('https://example.com', ['movie'], 10);
    expect(backlog.map((item) => item.id)).toEqual([first.id, second.id]);

    repository.close();
  });
});
