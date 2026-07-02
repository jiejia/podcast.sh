import path from 'node:path';

import { downloadToFile } from './files.js';
import { inferExtensionFromUrl } from '../lib/utils.js';
import type { CandidateResource, EpisodeType } from '../types.js';

interface TmdbDiscoverResponse {
  results: Array<{
    id: number;
    title?: string;
    name?: string;
    poster_path: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average: number;
    vote_count: number;
  }>;
}

interface TmdbDetailResponse {
  id: number;
  poster_path: string | null;
}

export class TmdbService {
  public constructor(private readonly apiToken: string) {}

  public async fetchCandidates(type: Exclude<EpisodeType, 'anime'>, startDate: string, limit: number): Promise<CandidateResource[]> {
    const strict = await this.scan(type, startDate, limit, true, 5);
    if (strict.length >= limit) {
      return strict.slice(0, limit);
    }

    const relaxed = await this.scan(type, startDate, limit, false, 10, strict);
    return relaxed.slice(0, limit);
  }

  public async redownloadPoster(type: Exclude<EpisodeType, 'anime'>, sourceItemId: string, targetPathBase: string): Promise<string> {
    const detail = await this.request<TmdbDetailResponse>(`/${type}/${sourceItemId}`, new URLSearchParams({
      language: 'en-US',
    }));

    if (!detail.poster_path) {
      throw new Error(`TMDB item ${sourceItemId} has no poster`);
    }

    const posterUrl = `https://image.tmdb.org/t/p/original${detail.poster_path}`;
    const filePath = `${targetPathBase}${inferExtensionFromUrl(posterUrl)}`;
    await downloadToFile(posterUrl, filePath);
    return filePath;
  }

  private async scan(
    type: Exclude<EpisodeType, 'anime'>,
    startDate: string,
    limit: number,
    strict: boolean,
    maxPages: number,
    seed: CandidateResource[] = [],
  ): Promise<CandidateResource[]> {
    const results = [...seed];
    const seen = new Set(results.map((item) => item.sourceItemId));

    for (let page = 1; page <= maxPages && results.length < limit; page += 1) {
      const params = new URLSearchParams({
        include_adult: 'false',
        language: 'en-US',
        page: String(page),
        sort_by: type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc',
      });

      if (type === 'movie') {
        params.set('primary_release_date.gte', startDate);
      } else {
        params.set('first_air_date.gte', startDate);
        params.set('include_null_first_air_dates', 'false');
      }

      if (strict) {
        params.set('vote_average.gte', '6.5');
        params.set('vote_count.gte', '100');
      }

      const response = await this.request<TmdbDiscoverResponse>(`/discover/${type}`, params);
      for (const item of response.results) {
        const name = item.title ?? item.name ?? '';
        const releaseDate = item.release_date ?? item.first_air_date ?? '';
        if (!name || !releaseDate || !item.poster_path) {
          continue;
        }
        if (seen.has(String(item.id))) {
          continue;
        }

        seen.add(String(item.id));
        results.push({
          sourceItemId: String(item.id),
          type,
          name,
          sourceWebsiteUrl: `https://www.themoviedb.org/${type}/${item.id}`,
          posterUrl: `https://image.tmdb.org/t/p/original${item.poster_path}`,
          releaseDate,
        });

        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
  }

  private async request<T>(resourcePath: string, searchParams: URLSearchParams): Promise<T> {
    const url = new URL(`https://api.themoviedb.org/3${resourcePath}`);
    url.search = searchParams.toString();
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB request failed (${response.status}) for ${url.pathname}`);
    }

    return await response.json() as T;
  }
}
