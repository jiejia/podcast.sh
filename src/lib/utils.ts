import path from 'node:path';

import type { EpisodeRecord, EpisodeType, PodcastFormat } from '../types.js';

const LANGUAGE_MAP: Record<string, string> = {
  '中文': 'zh-CN',
  '简体中文': 'zh-CN',
  '繁體中文': 'zh-TW',
  '英文': 'en',
  'english': 'en',
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizePodcastFormat(format: PodcastFormat): string {
  if (format === 'deep-dive') {
    return 'deep_dive';
  }

  return format;
}

export function normalizeNotebookLanguage(lang: string): string {
  const trimmed = lang.trim();
  if (!trimmed) {
    return 'zh-CN';
  }

  const mapped = LANGUAGE_MAP[trimmed] ?? LANGUAGE_MAP[trimmed.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  return trimmed;
}

export function displayType(type: EpisodeType): string {
  switch (type) {
    case 'anime':
      return 'Anime';
    case 'tv':
      return 'TV';
    case 'movie':
      return 'Movie';
  }
}

export function buildNotebookTitle(record: Pick<EpisodeRecord, 'id' | 'type' | 'name'>): string {
  return `${String(record.id).padStart(6, '0')}. ${displayType(record.type)}《${record.name}》`;
}

export function buildResearchQuery(type: EpisodeType, name: string): string {
  return `${displayType(type)}《${name}》`;
}

export function sanitizeFilename(input: string): string {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function removeFileExtension(filename: string): string {
  const ext = path.extname(filename);
  if (!ext) {
    return filename;
  }

  return filename.slice(0, -ext.length);
}

export function buildPodcastTitle(name: string, artifactTitle: string): string {
  return `《${name}》${removeFileExtension(artifactTitle).trim()}`;
}

export function parsePodcastTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .replaceAll('，', ',')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 6);
}

export function inferExtensionFromUrl(url: string, fallback = '.jpg'): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return ext || fallback;
  } catch {
    return fallback;
  }
}

export function inferContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.m4a':
      return 'audio/mp4';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

export function isWpThemeMissingError(status: number, body: string): boolean {
  if (status !== 404) {
    return false;
  }

  const normalized = body.toLowerCase();
  return normalized.includes('rest_no_route')
    || normalized.includes('invalid post type')
    || normalized.includes('not found');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
