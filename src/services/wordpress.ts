import fs from 'node:fs/promises';
import path from 'node:path';

import { inferContentType, isWpThemeMissingError } from '../lib/utils.js';
import type { Logger, WordPressPostStatus } from '../types.js';

interface WordPressTag {
  id: number;
  name: string;
}

interface WordPressMediaResponse {
  id: number;
}

interface WordPressPostResponse {
  id: number;
}

export class WordPressService {
  private readonly authHeader: string;

  public constructor(
    private readonly siteUrl: string,
    username: string,
    applicationPassword: string,
    private readonly logger: Logger,
  ) {
    this.authHeader = `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}`;
  }

  public async preflight(): Promise<void> {
    const meResponse = await this.request('/wp-json/wp/v2/users/me?context=edit', {
      method: 'GET',
    });

    if (meResponse.status === 401 || meResponse.status === 403) {
      throw new Error(`WordPress authentication failed (${meResponse.status})`);
    }

    if (!meResponse.ok) {
      throw new Error(`WordPress auth check failed (${meResponse.status}): ${await meResponse.text()}`);
    }

    const cptResponse = await this.request('/wp-json/wp/v2/types/aripplesong_episode', {
      method: 'GET',
    });
    if (cptResponse.ok) {
      return;
    }

    const body = await cptResponse.text();
    if (isWpThemeMissingError(cptResponse.status, body)) {
      throw new Error('a-ripple-song theme capability check failed: aripplesong_episode route/type not found');
    }

    throw new Error(`WordPress CPT capability check failed (${cptResponse.status}): ${body}`);
  }

  public async ensureTags(tagNames: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of tagNames) {
      ids.push(await this.ensureTag(name));
    }

    return ids;
  }

  public async uploadMedia(filePath: string): Promise<number> {
    const filename = path.basename(filePath);
    const bytes = await fs.readFile(filePath);
    const response = await this.request('/wp-json/wp/v2/media', {
      method: 'POST',
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': inferContentType(filePath),
      },
      body: bytes,
    });

    if (!response.ok) {
      throw new Error(`Media upload failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json() as WordPressMediaResponse;
    return payload.id;
  }

  public async createEpisodePost(input: {
    title: string;
    content: string;
    excerpt: string;
    tagIds: number[];
    featuredMediaId: number;
    audioMediaId: number;
    imageMediaId: number;
    status: WordPressPostStatus;
  }): Promise<number> {
    const response = await this.request('/wp-json/wp/v2/aripplesong_episode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        excerpt: input.excerpt,
        status: input.status,
        tags: input.tagIds,
        featured_media: input.featuredMediaId,
        meta: {
          _aripplesong_episode_audio_file: input.audioMediaId,
          _aripplesong_episode_image: input.imageMediaId,
          _aripplesong_episode_explicit: 'clean',
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (isWpThemeMissingError(response.status, body)) {
        throw new Error('a-ripple-song theme capability check failed during post creation');
      }

      throw new Error(`WordPress episode creation failed (${response.status}): ${body}`);
    }

    const payload = await response.json() as WordPressPostResponse;
    return payload.id;
  }

  private async ensureTag(name: string): Promise<number> {
    const existingResponse = await this.request(`/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=100`, {
      method: 'GET',
    });
    if (!existingResponse.ok) {
      throw new Error(`Failed to search WordPress tags (${existingResponse.status}): ${await existingResponse.text()}`);
    }

    const tags = await existingResponse.json() as WordPressTag[];
    const exact = tags.find((tag) => tag.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (exact) {
      return exact.id;
    }

    const createResponse = await this.request('/wp-json/wp/v2/tags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create WordPress tag "${name}" (${createResponse.status}): ${await createResponse.text()}`);
    }

    const created = await createResponse.json() as WordPressTag;
    return created.id;
  }

  private async request(resourcePath: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', this.authHeader);
    headers.set('Accept', 'application/json');

    this.logger.info('WordPress request', { method: init.method ?? 'GET', resourcePath });
    return await fetch(`${this.siteUrl}${resourcePath}`, {
      ...init,
      headers,
    });
  }
}
