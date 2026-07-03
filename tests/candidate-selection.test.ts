import { describe, expect, test, vi } from 'vitest';

import { findFreshCandidates } from '../src/lib/candidate-selection.js';
import type { CandidateResource } from '../src/types.js';

function buildCandidate(id: string): CandidateResource {
  return {
    sourceItemId: id,
    type: 'tv',
    name: `TV ${id}`,
    sourceWebsiteUrl: `https://www.themoviedb.org/tv/${id}`,
    posterUrl: `https://example.com/${id}.jpg`,
    releaseDate: '2026-01-01',
  };
}

describe('findFreshCandidates', () => {
  test('keeps expanding the fetch window until it fills the requested number of unseen items', async () => {
    const ordered = ['1', '2', '3', '4', '5', '6'].map(buildCandidate);
    const fetchCandidates = vi.fn(async (limit: number) => ordered.slice(0, limit));

    const fresh = await findFreshCandidates({
      limit: 3,
      fetchCandidates,
      isExisting: (candidate) => ['1', '2', '3'].includes(candidate.sourceItemId),
    });

    expect(fresh.map((candidate) => candidate.sourceItemId)).toEqual(['4', '5', '6']);
    expect(fetchCandidates.mock.calls.map(([limit]) => limit)).toEqual([3, 6]);
  });

  test('returns the remaining unseen items when the source is exhausted', async () => {
    const ordered = ['1', '2', '3', '4'].map(buildCandidate);
    const fetchCandidates = vi.fn(async (limit: number) => ordered.slice(0, Math.min(limit, ordered.length)));

    const fresh = await findFreshCandidates({
      limit: 3,
      fetchCandidates,
      isExisting: (candidate) => ['1', '2', '3'].includes(candidate.sourceItemId),
    });

    expect(fresh.map((candidate) => candidate.sourceItemId)).toEqual(['4']);
    expect(fetchCandidates.mock.calls.map(([limit]) => limit)).toEqual([3, 6]);
  });
});
