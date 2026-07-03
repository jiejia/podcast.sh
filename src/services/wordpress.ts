import fs from 'node:fs/promises';
import path from 'node:path';

import { displayType, inferContentType, isWpThemeMissingError, sanitizeHeaderFilename } from '../lib/utils.js';
import type { EpisodeType, Logger, WordPressPostStatus } from '../types.js';

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

interface WordPressEpisodeResponse {
  id: number;
  featured_media?: number;
  audio_file?: string;
  meta?: Record<string, unknown>;
}

const EPISODE_TAXONOMY = 'aripplesong_episode_category';
const EPISODE_AUDIO_META_KEY = '_aripplesong_episode_audio_file';
const EPISODE_IMAGE_META_KEY = '_aripplesong_episode_episode_image';
const EPISODE_EXPLICIT_META_KEY = '_aripplesong_episode_episode_explicit';
const EPISODE_TYPE_META_KEY = '_aripplesong_episode_episode_type';

export class WordPressService {
  private readonly authHeader: string;
  private readonly restBaseUrl: string;

  public constructor(
    private readonly siteUrl: string,
    username: string,
    applicationPassword: string,
    private readonly logger: Logger,
  ) {
    this.authHeader = `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}`;
    this.restBaseUrl = `${this.siteUrl}/index.php`;
  }

  public async preflight(): Promise<void> {
    const meResponse = await this.request('/wp-json/wp/v2/users/me?context=edit', {
      method: 'GET',
    });

    if (meResponse.status === 401 || meResponse.status === 403) {
      throw new Error(`WordPress authentication failed (${meResponse.status})`);
    }

    await this.expectJson(meResponse, 'WordPress auth check');

    const cptResponse = await this.request('/wp-json/wp/v2/types/aripplesong_episode', {
      method: 'GET',
    });
    await this.expectJson(cptResponse, 'WordPress CPT capability check');
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
    const headerFilename = sanitizeHeaderFilename(filename, `upload${path.extname(filename) || ''}`);
    const bytes = await fs.readFile(filePath);
    const response = await this.request('/wp-json/wp/v2/media', {
      method: 'POST',
      headers: {
        'Content-Disposition': `attachment; filename="${headerFilename}"`,
        'Content-Type': inferContentType(filePath),
      },
      body: bytes,
    });

    if (!response.ok) {
      throw new Error(`Media upload failed (${response.status}): ${await response.text()}`);
    }

    const payload = await this.parseJsonResponse<WordPressMediaResponse>(response, 'Media upload');
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
    categoryId: number;
    status: WordPressPostStatus;
  }): Promise<number> {
    return await this.saveEpisodePost(null, input);
  }

  public async updateEpisodePost(postId: number, input: {
    title: string;
    content: string;
    excerpt: string;
    tagIds: number[];
    featuredMediaId: number;
    audioMediaId: number;
    imageMediaId: number;
    categoryId: number;
    status: WordPressPostStatus;
  }): Promise<number> {
    return await this.saveEpisodePost(postId, input);
  }

  public async episodePostExists(postId: number): Promise<boolean> {
    const response = await this.request(`/wp-json/wp/v2/aripplesong_episode/${postId}?context=edit`, {
      method: 'GET',
    });

    if (response.status === 404) {
      return false;
    }

    await this.expectJson(response, `Check episode post ${postId}`);
    return true;
  }

  private async saveEpisodePost(postId: number | null, input: {
    title: string;
    content: string;
    excerpt: string;
    tagIds: number[];
    featuredMediaId: number;
    audioMediaId: number;
    imageMediaId: number;
    categoryId: number;
    status: WordPressPostStatus;
  }): Promise<number> {
    const resourcePath = postId === null
      ? '/wp-json/wp/v2/aripplesong_episode'
      : `/wp-json/wp/v2/aripplesong_episode/${postId}`;
    const response = await this.request(resourcePath, {
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
        [EPISODE_TAXONOMY]: [input.categoryId],
        meta: {
          [EPISODE_AUDIO_META_KEY]: input.audioMediaId,
          [EPISODE_IMAGE_META_KEY]: input.imageMediaId,
          [EPISODE_EXPLICIT_META_KEY]: 'clean',
          [EPISODE_TYPE_META_KEY]: 'full',
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      if (isWpThemeMissingError(response.status, body)) {
        throw new Error('a-ripple-song theme capability check failed during post creation');
      }

      throw new Error(`WordPress episode save failed (${response.status}): ${body}`);
    }

    const payload = await this.parseJsonResponse<WordPressPostResponse>(
      response,
      postId === null ? 'WordPress episode creation' : 'WordPress episode update',
    );
    return payload.id;
  }

  public async ensureEpisodeCategory(type: EpisodeType): Promise<number> {
    const slug = type;
    const name = displayType(type);
    const searchResponse = await this.request(`/wp-json/wp/v2/${EPISODE_TAXONOMY}?slug=${encodeURIComponent(slug)}&per_page=100`, {
      method: 'GET',
    });
    if (!searchResponse.ok) {
      throw new Error(`Failed to search episode categories (${searchResponse.status}): ${await searchResponse.text()}`);
    }

    const existing = await this.parseJsonResponse<WordPressTag[]>(searchResponse, 'Episode category search');
    const exact = existing.find((term) => term.name.trim().toLowerCase() === name.toLowerCase()) ?? existing[0];
    if (exact) {
      return exact.id;
    }

    const createResponse = await this.request(`/wp-json/wp/v2/${EPISODE_TAXONOMY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        slug,
      }),
    });
    if (!createResponse.ok) {
      throw new Error(`Failed to create episode category "${slug}" (${createResponse.status}): ${await createResponse.text()}`);
    }

    const created = await this.parseJsonResponse<WordPressTag>(createResponse, 'Episode category creation');
    return created.id;
  }

  public async getEpisodePost(postId: number): Promise<WordPressEpisodeResponse | null> {
    const response = await this.request(`/wp-json/wp/v2/aripplesong_episode/${postId}?context=edit`, {
      method: 'GET',
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch episode post ${postId} (${response.status}): ${await response.text()}`);
    }

    return await this.parseJsonResponse<WordPressEpisodeResponse>(response, `Fetch episode post ${postId}`);
  }

  public async deleteEpisodePost(postId: number): Promise<void> {
    const response = await this.request(`/wp-json/wp/v2/aripplesong_episode/${postId}?force=true`, {
      method: 'DELETE',
    });

    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to delete episode post ${postId} (${response.status}): ${await response.text()}`);
    }
  }

  public async deleteMedia(mediaId: number): Promise<void> {
    const response = await this.request(`/wp-json/wp/v2/media/${mediaId}?force=true`, {
      method: 'DELETE',
    });

    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to delete media ${mediaId} (${response.status}): ${await response.text()}`);
    }
  }

  public extractEpisodeMediaIds(post: WordPressEpisodeResponse): number[] {
    const ids = new Set<number>();

    if (typeof post.featured_media === 'number' && post.featured_media > 0) {
      ids.add(post.featured_media);
    }

    const audioId = post.meta?.[EPISODE_AUDIO_META_KEY];
    if (typeof audioId === 'number' && audioId > 0) {
      ids.add(audioId);
    }

    const imageId = post.meta?.[EPISODE_IMAGE_META_KEY];
    if (typeof imageId === 'number' && imageId > 0) {
      ids.add(imageId);
    }

    return Array.from(ids);
  }

  private async ensureTag(name: string): Promise<number> {
    const existingResponse = await this.request(`/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=100`, {
      method: 'GET',
    });
    if (!existingResponse.ok) {
      throw new Error(`Failed to search WordPress tags (${existingResponse.status}): ${await existingResponse.text()}`);
    }

    const tags = await this.parseJsonResponse<WordPressTag[]>(existingResponse, 'WordPress tag search');
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

    const created = await this.parseJsonResponse<WordPressTag>(createResponse, `WordPress tag creation ${name}`);
    return created.id;
  }

  private async request(resourcePath: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', this.authHeader);
    headers.set('Accept', 'application/json');
    const url = this.buildRestUrl(resourcePath);
    this.logger.info('WordPress request', { method: init.method ?? 'GET', resourcePath, url });
    return await fetch(url, {
      ...init,
      headers,
    });
  }

  private buildRestUrl(resourcePath: string): string {
    const normalized = resourcePath.replace(/^\/wp-json/, '');
    const [routePath, queryString = ''] = normalized.split('?');
    const url = new URL(this.restBaseUrl);
    url.searchParams.set('rest_route', routePath);

    if (queryString) {
      const extraParams = new URLSearchParams(queryString);
      for (const [key, value] of extraParams.entries()) {
        url.searchParams.append(key, value);
      }
    }

    return url.toString();
  }

  private async expectJson(response: Response, label: string): Promise<void> {
    if (!response.ok) {
      const body = await response.text();
      if (isWpThemeMissingError(response.status, body)) {
        throw new Error(`${label} failed: a-ripple-song route/type not found`);
      }
      throw new Error(`${label} failed (${response.status}): ${body}`);
    }

    await this.parseJsonResponse(response, label);
  }

  private async parseJsonResponse<T>(response: Response, label: string): Promise<T> {
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();

    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(`${label} expected JSON but received ${contentType || 'unknown content type'}: ${text.slice(0, 200)}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new Error(`${label} JSON parse failed: ${String(error)}: ${text.slice(0, 200)}`);
    }
  }
}
