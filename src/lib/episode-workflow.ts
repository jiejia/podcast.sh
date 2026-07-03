import { normalizeNotebookText, parsePodcastTags } from './utils.js';
import type { EpisodeRecord } from '../types.js';

export interface NormalizedEpisodeRecordData {
  audioPath: string;
  description: string;
  hasPublishPayload: boolean;
  hasStoredNormalizationDiff: boolean;
  tagNames: string[];
  tagString: string;
  title: string;
}

export interface PublishedRecordRepairDecision {
  reason: string;
  resetWordPressPostId: boolean;
  shouldRepair: boolean;
}

export function normalizeEpisodeRecordData(record: EpisodeRecord): NormalizedEpisodeRecordData {
  const description = normalizeNotebookText(record.podcast_description ?? '');
  const tagNames = parsePodcastTags(record.podcast_tags ?? '');
  const tagString = tagNames.join(', ');
  const storedDescription = record.podcast_description?.trim() ?? '';
  const storedTags = record.podcast_tags?.trim() ?? '';
  const title = record.podcast_title?.trim() ?? '';
  const audioPath = record.podcast_audio_file_path ?? '';

  return {
    audioPath,
    description,
    hasPublishPayload: Boolean(audioPath && title && description && tagNames.length > 0),
    hasStoredNormalizationDiff: description !== storedDescription || tagString !== storedTags,
    tagNames,
    tagString,
    title,
  };
}

export function shouldRefreshGeneratedAssets(record: EpisodeRecord): boolean {
  const normalized = normalizeEpisodeRecordData(record);
  return !normalized.audioPath
    || !normalized.title
    || !normalized.description
    || normalized.tagNames.length === 0
    || normalized.hasStoredNormalizationDiff;
}

export function decidePublishedRecordRepair(
  record: EpisodeRecord,
  remote: {
    audioFileUrl?: string | null;
    exists: boolean;
  },
): PublishedRecordRepairDecision {
  const normalized = normalizeEpisodeRecordData(record);

  if (!remote.exists && normalized.hasPublishPayload) {
    return {
      reason: 'WordPress post is missing and local record can be republished',
      resetWordPressPostId: true,
      shouldRepair: true,
    };
  }

  if (remote.exists && normalized.hasStoredNormalizationDiff) {
    return {
      reason: 'stored podcast description or tags need normalization repair',
      resetWordPressPostId: false,
      shouldRepair: true,
    };
  }

  if (remote.exists && normalized.hasPublishPayload && !remote.audioFileUrl) {
    return {
      reason: 'WordPress post is missing Audio File binding',
      resetWordPressPostId: false,
      shouldRepair: true,
    };
  }

  return {
    reason: '',
    resetWordPressPostId: false,
    shouldRepair: false,
  };
}
