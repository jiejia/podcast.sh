import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { z } from 'zod';

import type { AppConfig, CliOptions, EpisodeType, PodcastFormat, WordPressPostStatus } from './types.js';

const envSchema = z.object({
  WORDPRESS_USERNAME: z.string().min(1),
  WORDPRESS_APP_PASSWORD: z.string().min(1),
  WORDPRESS_SITE_URL: z.string().url(),
  TMDB_API_TOKEN: z.string().min(1),
  BANGUMI_API_TOKEN: z.string().min(1),
  RESOURCE_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  STORAGE_DIR: z.string().min(1),
});

const cliSchema = z.object({
  type: z.array(z.enum(['anime', 'tv', 'movie'])).default([]),
  limit: z.number().int().positive().default(3),
  lang: z.string().min(1).default('中文'),
  format: z.enum(['deep-dive', 'brief', 'critique', 'debate']).default('deep-dive'),
  wpStatus: z.enum(['publish', 'draft']).default('publish'),
  verbose: z.boolean().default(false),
});

export function parseCliArgs(argv: string[]): CliOptions {
  const program = new Command();

  program
    .allowUnknownOption(false)
    .option('--type <type>', 'anime, tv, or movie', collectType, [])
    .option('--limit <number>', 'max episodes per run', parseIntOption, 3)
    .option('--lang <lang>', 'podcast language', '中文')
    .option('--format <format>', 'deep-dive, brief, critique, debate', 'deep-dive')
    .option('--wp-status <status>', 'publish or draft', 'publish')
    .option('--verbose', 'print detailed logs', false);

  program.parse(argv.slice(2), { from: 'user' });
  const options = program.opts<{
    type: EpisodeType[];
    limit: number;
    lang: string;
    format: PodcastFormat;
    wpStatus: WordPressPostStatus;
    verbose: boolean;
  }>();

  const parsed = cliSchema.parse(options);
  return {
    types: parsed.type.length > 0 ? parsed.type : ['anime', 'tv', 'movie'],
    limit: parsed.limit,
    lang: parsed.lang,
    format: parsed.format,
    wpStatus: parsed.wpStatus,
    verbose: parsed.verbose,
  };
}

export function loadConfig(cli: CliOptions): AppConfig {
  const env = envSchema.parse(process.env);
  const storageDir = path.resolve(env.STORAGE_DIR);
  const dbDir = path.join(storageDir, 'db');
  const posterDir = path.join(storageDir, 'posters');
  const audioDir = path.join(storageDir, 'audio');

  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(posterDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  return {
    wordpressUsername: env.WORDPRESS_USERNAME,
    wordpressAppPassword: env.WORDPRESS_APP_PASSWORD,
    wordpressSiteUrl: env.WORDPRESS_SITE_URL.replace(/\/+$/, ''),
    tmdbApiToken: env.TMDB_API_TOKEN,
    bangumiApiToken: env.BANGUMI_API_TOKEN,
    resourceStartDate: env.RESOURCE_START_DATE,
    storageDir,
    dbPath: path.join(dbDir, 'podcast.sqlite'),
    posterDir,
    audioDir,
    cli,
  };
}

function collectType(value: string, previous: EpisodeType[]): EpisodeType[] {
  if (value !== 'anime' && value !== 'tv' && value !== 'movie') {
    throw new Error(`Unsupported --type value: ${value}`);
  }

  previous.push(value);
  return previous;
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer value: ${value}`);
  }

  return parsed;
}
