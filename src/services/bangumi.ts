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

  public async fetchCandidates(startDate: string, limit: number): Promise<CandidateResource[]> {
    const strict = await this.scan(startDate, limit, true, 5);
    if (strict.length >= limit) {
      return strict.slice(0, limit);
    }

    const relaxed = await this.scan(startDate, limit, false, 10, strict);
    return relaxed.slice(0, limit);
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
    limit: number,
    strict: boolean,
    maxPages: number,
    seed: CandidateResource[] = [],
  ): Promise<CandidateResource[]> {
    const results = [...seed];
    const seen = new Set(results.map((item) => item.sourceItemId));

    for (let page = 0; page < maxPages && results.length < limit; page += 1) {
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
      for (const item of payload.data ?? []) {
        const releaseDate = item.date ?? '';
        if (!releaseDate || releaseDate < startDate) {
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
        const scoreCount = item.rating?.total ?? 0;
        if (strict && (score < 6.5 || scoreCount < 100)) {
          continue;
        }

        seen.add(String(item.id));
        results.push({
          sourceItemId: String(item.id),
          type: 'anime',
          name: item.name_cn?.trim() || item.name,
          sourceWebsiteUrl: `https://bangumi.tv/subject/${item.id}`,
          posterUrl,
          releaseDate,
        });

        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
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
