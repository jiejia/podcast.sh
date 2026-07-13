export type EpisodeType = 'movie' | 'tv';
export type EpisodeStatus = 'pending' | 'generated' | 'published' | 'failed';
export type PodcastFormat = 'deep-dive' | 'brief' | 'critique' | 'debate';
export type WordPressPostStatus = 'publish' | 'draft';

export interface CliOptions {
  types: EpisodeType[];
  limit: number;
  lang: string;
  format: PodcastFormat;
  wpStatus: WordPressPostStatus;
  verbose: boolean;
}

export interface AppConfig {
  wordpressUsername: string;
  wordpressAppPassword: string;
  wordpressSiteUrl: string;
  wordpressSiteSlug: string;
  wordpressAuthors: string[];
  wordpressContributors: string[];
  tmdbApiToken: string;
  configuredTypes: EpisodeType[];
  regions: string[];
  resourceStartDate: string;
  resourceStartScore: number;
  storageDir: string;
  dbPath: string;
  posterDir: string;
  audioDir: string;
  logDir: string;
  runLogPath: string;
  cli: CliOptions;
}

export interface MaintenanceConfig {
  wordpressUsername: string;
  wordpressAppPassword: string;
  wordpressSiteUrl: string;
  storageDir: string;
  dbPath: string;
  logDir: string;
  runLogPath: string;
}

export interface EpisodeRecord {
  id: number;
  source_item_id: string;
  type: EpisodeType;
  name: string;
  source_website_url: string;
  notebook_id: string | null;
  wordpress_post_id: number | null;
  wordpress_site_url: string;
  podcast_feature_image_file_path: string | null;
  podcast_audio_file_path: string | null;
  podcast_format: string | null;
  podcast_title: string | null;
  podcast_description: string | null;
  podcast_tags: string | null;
  podcast_lang: string;
  status: EpisodeStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateResource {
  sourceItemId: string;
  type: EpisodeType;
  name: string;
  sourceWebsiteUrl: string;
  posterUrl: string;
  releaseDate: string;
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface ProgressReporter {
  note(message: string): void;
  beginItem(index: number, total: number, label: string): void;
  update(percent: number, status: string): void;
  complete(status: string): void;
  fail(message: string): void;
}
