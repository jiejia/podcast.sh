import { afterEach, describe, expect, test, vi } from 'vitest';

import { WordPressService } from '../src/services/wordpress.js';
import type { Logger } from '../src/types.js';

const logger: Logger = {
  info: vi.fn(),
  error: vi.fn(),
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('WordPressService', () => {
  test('resolves exact usernames to user IDs and enforces roles', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([
      { id: 2, username: 'host', roles: ['author'] },
      { id: 3, username: 'guest', roles: ['contributor'] },
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const service = new WordPressService('https://example.com', 'admin', 'password', logger);

    await expect(service.resolveUserIds(['host'], 'author')).resolves.toEqual([2]);
    await expect(service.resolveUserIds(['guest'], 'author')).rejects.toThrow(
      'WordPress user "guest" was not found with role "author"',
    );
  });

  test('writes configured Members and Guests associations for new posts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 42 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new WordPressService('https://example.com', 'admin', 'password', logger);

    await service.createEpisodePost({
      title: 'Episode',
      content: 'Description',
      excerpt: 'Description',
      tagIds: [1],
      featuredMediaId: 2,
      audioMediaId: 3,
      imageMediaId: 2,
      categoryId: 4,
      status: 'draft',
      members: [2],
      guests: [3],
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body)) as { meta: Record<string, unknown> };
    expect(body.meta).toMatchObject({
      _aripplesong_episode_members: [2],
      _aripplesong_episode_guests: [3],
    });
  });
});
