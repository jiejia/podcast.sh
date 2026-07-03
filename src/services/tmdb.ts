import path from 'node:path';

import { downloadToFile } from './files.js';
import { inferExtensionFromUrl, resolveTmdbLanguage } from '../lib/utils.js';
import type { CandidateResource, EpisodeType } from '../types.js';

type TmdbResourceType = 'movie' | 'tv';

interface TmdbDiscoverResponse {
  results: Array<{
    id: number;
    title?: string;
    name?: string;
    poster_path: string | null;
    release_date?: string;
    first_air_date?: string;
    origin_country?: string[];
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

  public async fetchCandidates(
    type: EpisodeType,
    startDate: string,
    startScore: number,
    lang: string,
    regions: string[],
    limit: number,
  ): Promise<CandidateResource[]> {
    const normalizedRegions = Array.from(new Set(regions.map((value) => value.trim().toUpperCase()).filter(Boolean)));
    if (normalizedRegions.length <= 1) {
      return await this.scan(
        type,
        startDate,
        startScore,
        lang,
        limit,
        10,
        normalizedRegions[0],
      );
    }

    const perRegionResults = await Promise.all(
      normalizedRegions.map(async (region) => {
        return await this.scan(type, startDate, startScore, lang, limit, 10, region);
      }),
    );

    return this.mergeCandidates(perRegionResults.flat(), limit);
  }

  public async redownloadPoster(sourceWebsiteUrl: string, sourceItemId: string, targetPathBase: string): Promise<string> {
    const resourceType = this.resolveResourceTypeFromUrl(sourceWebsiteUrl);
    const detail = await this.request<TmdbDetailResponse>(`/${resourceType}/${this.extractTmdbNumericId(sourceItemId)}`, new URLSearchParams({
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
    type: TmdbResourceType,
    startDate: string,
    startScore: number,
    lang: string,
    limit: number,
    maxPages: number,
    region?: string,
  ): Promise<CandidateResource[]> {
    const results: CandidateResource[] = [];
    const seen = new Set<string>();
    const tmdbLanguage = resolveTmdbLanguage(lang);

    for (let page = 1; page <= maxPages && results.length < limit; page += 1) {
      const params = new URLSearchParams({
        include_adult: 'false',
        language: tmdbLanguage,
        page: String(page),
        sort_by: type === 'movie' ? 'primary_release_date.asc' : 'first_air_date.asc',
        'vote_average.gte': String(startScore),
      });

      if (type === 'movie') {
        params.set('primary_release_date.gte', startDate);
        if (region) {
          params.set('with_origin_country', region);
        }
      } else {
        params.set('first_air_date.gte', startDate);
        params.set('include_null_first_air_dates', 'false');
      }

      const response = await this.request<TmdbDiscoverResponse>(`/discover/${type}`, params);
      for (const item of response.results) {
        const name = item.title ?? item.name ?? '';
        const releaseDate = item.release_date ?? item.first_air_date ?? '';
        if (!name || !releaseDate || !item.poster_path) {
          continue;
        }
        if (type === 'tv' && region && !item.origin_country?.includes(region)) {
          continue;
        }
        const sourceItemId = String(item.id);
        if (seen.has(sourceItemId)) {
          continue;
        }

        seen.add(sourceItemId);
        results.push({
          sourceItemId,
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

  private mergeCandidates(candidates: CandidateResource[], limit: number): CandidateResource[] {
    const deduped = new Map<string, CandidateResource>();
    for (const candidate of candidates) {
      const key = `${candidate.type}:${candidate.sourceItemId}`;
      if (!deduped.has(key)) {
        deduped.set(key, candidate);
      }
    }

    return [...deduped.values()]
      .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate) || left.sourceItemId.localeCompare(right.sourceItemId))
      .slice(0, limit);
  }

  private resolveResourceTypeFromUrl(sourceWebsiteUrl: string): TmdbResourceType {
    try {
      const pathname = new URL(sourceWebsiteUrl).pathname;
      const match = pathname.match(/^\/(movie|tv)\//);
      if (match) {
        return match[1] as TmdbResourceType;
      }
    } catch {
      // Fall through to error below.
    }

    throw new Error(`Unable to infer TMDB resource type from URL: ${sourceWebsiteUrl}`);
  }

  private extractTmdbNumericId(sourceItemId: string): string {
    const match = sourceItemId.match(/(\d+)$/);
    if (!match) {
      throw new Error(`Unable to extract TMDB numeric id from source_item_id: ${sourceItemId}`);
    }

    return match[1];
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
