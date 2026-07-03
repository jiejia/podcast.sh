import { downloadToFile } from './files.js';
import { inferExtensionFromUrl } from '../lib/utils.js';
import type { CandidateResource } from '../types.js';

interface BangumiBrowseResponse {
  data?: Array<{
    id: number;
    name: string;
    name_cn?: string;
    date?: string;
    images?: {
      large?: string;
      common?: string;
      grid?: string;
      medium?: string;
      small?: string;
    };
    rating?: {
      score?: number;
      total?: number;
    };
  }>;
}

interface BangumiSubjectResponse {
  id: number;
  images?: {
    large?: string;
    common?: string;
    grid?: string;
    medium?: string;
    small?: string;
  };
}

export class BangumiService {
  public constructor(private readonly apiToken: string) {}

  public async fetchCandidates(startDate: string, startScore: number, limit: number): Promise<CandidateResource[]> {
    return await this.scan(startDate, startScore, limit, 50);
  }

  public async redownloadPoster(sourceItemId: string, targetPathBase: string): Promise<string> {
    const response = await this.request<BangumiSubjectResponse>(`/v0/subjects/${sourceItemId}`);
    const posterUrl = response.images?.large
      ?? response.images?.common
      ?? response.images?.grid
      ?? response.images?.medium
      ?? response.images?.small;

    if (!posterUrl) {
      throw new Error(`Bangumi item ${sourceItemId} has no poster`);
    }

    const filePath = `${targetPathBase}${inferExtensionFromUrl(posterUrl)}`;
    await downloadToFile(posterUrl, filePath, this.headers());
    return filePath;
  }

  private async scan(
    startDate: string,
    startScore: number,
    limit: number,
    maxPages: number,
  ): Promise<CandidateResource[]> {
    const matches: CandidateResource[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < maxPages; page += 1) {
      const url = new URL('https://api.bgm.tv/v0/subjects');
      url.searchParams.set('type', '2');
      url.searchParams.set('sort', 'date');
      url.searchParams.set('limit', '30');
      url.searchParams.set('offset', String(page * 30));

      const response = await fetch(url, { headers: this.headers() });
      if (!response.ok) {
        throw new Error(`Bangumi request failed (${response.status}) for /v0/subjects`);
      }

      const payload = await response.json() as BangumiBrowseResponse;
      const pageItems = payload.data ?? [];
      if (pageItems.length === 0) {
        break;
      }

      let reachedOlderThanStartDate = false;
      for (const item of pageItems) {
        const releaseDate = item.date ?? '';
        if (!releaseDate) {
          continue;
        }
        if (releaseDate < startDate) {
          reachedOlderThanStartDate = true;
          continue;
        }

        const posterUrl = item.images?.large
          ?? item.images?.common
          ?? item.images?.grid
          ?? item.images?.medium
          ?? item.images?.small;

        if (!posterUrl || seen.has(String(item.id))) {
          continue;
        }

        const score = item.rating?.score ?? 0;
        if (score < startScore) {
          continue;
        }

        seen.add(String(item.id));
        matches.push({
          sourceItemId: String(item.id),
          type: 'anime',
          name: item.name_cn?.trim() || item.name,
          sourceWebsiteUrl: `https://bangumi.tv/subject/${item.id}`,
          posterUrl,
          releaseDate,
        });
      }

      if (reachedOlderThanStartDate) {
        break;
      }
    }

    return matches
      .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate) || left.sourceItemId.localeCompare(right.sourceItemId))
      .slice(0, limit);
  }

  private async request<T>(resourcePath: string): Promise<T> {
    const response = await fetch(`https://api.bgm.tv${resourcePath}`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new Error(`Bangumi request failed (${response.status}) for ${resourcePath}`);
    }

    return await response.json() as T;
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiToken}`,
      'User-Agent': 'podcast.sh/0.1.0',
    };
  }
}
