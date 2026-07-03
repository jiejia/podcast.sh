import path from 'node:path';

import type { EpisodeRecord, EpisodeType, PodcastFormat } from '../types.js';

const NOTEBOOK_LANGUAGE_MAP: Record<string, string> = {
  '中文': 'zh-CN',
  '简体中文': 'zh-CN',
  '繁體中文': 'zh-TW',
  '日本語': 'ja',
  '日文': 'ja',
  '英文': 'en',
  'english': 'en',
  'English': 'en',
};

const TMDB_LANGUAGE_MAP: Record<string, string> = {
  '中文': 'zh-CN',
  '简体中文': 'zh-CN',
  '繁體中文': 'zh-TW',
  'English': 'en-US',
  '英文': 'en-US',
  '日本語': 'ja-JP',
  '日文': 'ja-JP',
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

  const mapped = NOTEBOOK_LANGUAGE_MAP[trimmed] ?? NOTEBOOK_LANGUAGE_MAP[trimmed.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  const localeMatch = trimmed.match(/^([a-z]{2,3})(?:-[A-Z]{2})?$/);
  if (localeMatch) {
    const primary = localeMatch[1].toLowerCase();
    if (trimmed === 'zh-CN' || trimmed === 'zh-SG') {
      return 'zh-CN';
    }
    if (trimmed === 'zh-TW' || trimmed === 'zh-HK') {
      return 'zh-TW';
    }
    return primary;
  }

  return trimmed;
}

export function resolvePromptLanguage(lang: string): string {
  const trimmed = lang.trim();
  if (!trimmed) {
    return '简体中文';
  }

  if (trimmed === '中文' || trimmed === '简体中文' || trimmed === 'zh-CN' || trimmed === 'zh-SG') {
    return '简体中文';
  }
  if (trimmed === '繁體中文' || trimmed === 'zh-TW' || trimmed === 'zh-HK') {
    return '繁體中文';
  }
  if (trimmed === 'English' || trimmed === '英文') {
    return 'English';
  }
  if (trimmed === '日本語' || trimmed === '日文') {
    return '日本語';
  }

  const localeMatch = trimmed.match(/^([a-z]{2,3})(?:-[A-Z]{2})?$/);
  if (localeMatch) {
    const primary = localeMatch[1].toLowerCase();
    const displayNames = typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames(['en'], { type: 'language' })
      : null;
    return displayNames?.of(primary) ?? primary;
  }

  return trimmed;
}

export function resolveTmdbLanguage(lang: string): string {
  const trimmed = lang.trim();
  if (!trimmed) {
    return 'zh-CN';
  }

  if (/^[a-z]{2}-[A-Z]{2}$/.test(trimmed)) {
    return trimmed;
  }

  return TMDB_LANGUAGE_MAP[trimmed] ?? TMDB_LANGUAGE_MAP[trimmed.toLowerCase()] ?? 'en-US';
}


export function displayType(type: EpisodeType): string {
  switch (type) {
    case 'tv':
      return 'TV';
    case 'movie':
      return 'Movie';
  }
}

export function buildNotebookTitle(
  siteSlug: string,
  record: Pick<EpisodeRecord, 'id' | 'type' | 'name'>,
): string {
  return `${siteSlug}-${String(record.id).padStart(6, '0')}. ${displayType(record.type)}《${record.name}》`;
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

export function sanitizeHeaderFilename(input: string, fallback = 'file'): string {
  const ext = path.extname(input);
  const baseName = ext ? input.slice(0, -ext.length) : input;
  const sanitizedBase = baseName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);

  const safeExt = ext
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9.]/g, '')
    .toLowerCase();

  if (sanitizedBase) {
    return `${sanitizedBase}${safeExt}`;
  }

  return `${fallback}${safeExt || ''}`;
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

export function extractNotebookAnswer(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(unfenced) as unknown;
    if (parsed && typeof parsed === 'object' && 'answer' in parsed && typeof (parsed as { answer: unknown }).answer === 'string') {
      return ((parsed as { answer: string }).answer).trim();
    }
  } catch {
    // Keep raw text when the response is not JSON.
  }

  return unfenced;
}

export function normalizeNotebookText(raw: string): string {
  return extractNotebookAnswer(raw)
    .replace(/\r\n/g, '\n')
    .trim();
}

export function parsePodcastTags(raw: string): string[] {
  const normalized = extractNotebookAnswer(raw)
    .replace(/^标签[:：]\s*/giu, '')
    .replace(/^以下是[^,，。\n]*标签[:：]?\s*/giu, '')
    .replace(/^只返回标签[,，。:\s]*/giu, '')
    .replaceAll('，', ',')
    .replaceAll('、', ',')
    .replace(/[；;]+/g, ',')
    .replace(/[。！？!?]+/g, ',')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[{}"]/g, '')
    .replace(/\s*\n+\s*/g, ',');

  return Array.from(
    new Set(
      normalized
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
