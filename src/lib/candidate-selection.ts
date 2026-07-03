import type { CandidateResource } from '../types.js';

interface FindFreshCandidatesOptions {
  fetchCandidates: (limit: number) => Promise<CandidateResource[]>;
  isExisting: (candidate: CandidateResource) => boolean;
  limit: number;
  maxRequestLimit?: number;
}

export async function findFreshCandidates(options: FindFreshCandidatesOptions): Promise<CandidateResource[]> {
  const maxRequestLimit = Math.max(options.limit, options.maxRequestLimit ?? options.limit * 10);
  let requestLimit = Math.max(1, options.limit);
  let previousRawCount = -1;

  while (requestLimit <= maxRequestLimit) {
    const raw = await options.fetchCandidates(requestLimit);
    const fresh = filterFreshCandidates(raw, options.isExisting).slice(0, options.limit);
    if (fresh.length >= options.limit) {
      return fresh;
    }

    if (raw.length < requestLimit || raw.length === previousRawCount) {
      return fresh;
    }

    previousRawCount = raw.length;
    if (requestLimit === maxRequestLimit) {
      return fresh;
    }

    requestLimit = Math.min(maxRequestLimit, requestLimit + options.limit);
  }

  return [];
}

function filterFreshCandidates(
  candidates: CandidateResource[],
  isExisting: (candidate: CandidateResource) => boolean,
): CandidateResource[] {
  const seen = new Set<string>();
  const fresh: CandidateResource[] = [];

  for (const candidate of candidates) {
    const uniqueKey = `${candidate.type}:${candidate.sourceItemId}`;
    if (seen.has(uniqueKey) || isExisting(candidate)) {
      continue;
    }

    seen.add(uniqueKey);
    fresh.push(candidate);
  }

  return fresh;
}
