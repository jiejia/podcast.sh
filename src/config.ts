import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { z } from 'zod';

import type { AppConfig, CliOptions, EpisodeType, PodcastFormat, WordPressPostStatus } from './types.js';

const EPISODE_TYPE_VALUES = ['anime', 'tv', 'movie'] as const;

const envSchema = z.object({
  WORDPRESS_USERNAME: z.string().min(1),
  WORDPRESS_APP_PASSWORD: z.string().min(1),
  WORDPRESS_SITE_URL: z.string().url(),
  WORDPRESS_SITE_SLUG: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/),
  TMDB_API_TOKEN: z.string().min(1),
  BANGUMI_API_TOKEN: z.string().min(1),
  TYPES: z.string().min(1),
  RESOURCE_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  RESOURCE_START_SCORE: z.coerce.number().min(0).max(10),
  STORAGE_DIR: z.string().min(1),
});

const cliSchema = z.object({
  type: z.array(z.enum(EPISODE_TYPE_VALUES)).default([]),
  limit: z.number().int().positive().default(3),
  lang: z.string().min(1).default('中文'),
  format: z.enum(['deep-dive', 'brief', 'critique', 'debate']).default('deep-dive'),
  wpStatus: z.enum(['publish', 'draft']).default('publish'),
  verbose: z.boolean().default(false),
});

export function parseCliArgs(argv: string[]): CliOptions {
  const configuredTypes = getConfiguredTypesFromEnv(process.env);
  const userArgs = argv.slice(2);
  const hasTypeOption = hasExplicitOption(userArgs, 'type');
  const hasLimitOption = hasExplicitOption(userArgs, 'limit');
  const program = new Command();

  program
    .allowUnknownOption(false)
    .option('--type <type>', `allowed values: ${configuredTypes.join(', ')}`, (value: string, previous: EpisodeType[]) => {
      return collectType(value, previous, configuredTypes);
    }, [])
    .option('--limit <number>', 'max episodes per run', parseIntOption, 3)
    .option('--lang <lang>', 'podcast language', '中文')
    .option('--format <format>', 'deep-dive, brief, critique, debate', 'deep-dive')
    .option('--wp-status <status>', 'publish or draft', 'publish')
    .option('--verbose', 'print detailed logs', false);

  program.parse(userArgs, { from: 'user' });
  const options = program.opts<{
    type: EpisodeType[];
    limit: number;
    lang: string;
    format: PodcastFormat;
    wpStatus: WordPressPostStatus;
    verbose: boolean;
  }>();

  const parsed = cliSchema.parse(options);
  if (!hasTypeOption && hasLimitOption) {
    throw new Error('`--type` is required when `--limit` is provided');
  }

  if (!hasTypeOption && !hasLimitOption) {
    return {
      types: configuredTypes,
      limit: configuredTypes.length,
      lang: parsed.lang,
      format: parsed.format,
      wpStatus: parsed.wpStatus,
      verbose: parsed.verbose,
    };
  }

  return {
    types: parsed.type,
    limit: parsed.limit,
    lang: parsed.lang,
    format: parsed.format,
    wpStatus: parsed.wpStatus,
    verbose: parsed.verbose,
  };
}

export function loadConfig(cli: CliOptions): AppConfig {
  const env = envSchema.parse(process.env);
  const configuredTypes = parseConfiguredTypes(env.TYPES);
  const unsupportedCliTypes = cli.types.filter((type) => !configuredTypes.includes(type));
  if (unsupportedCliTypes.length > 0) {
    throw new Error(`CLI types must be a subset of TYPES. Unsupported value(s): ${unsupportedCliTypes.join(', ')}`);
  }
  const storageDir = path.resolve(env.STORAGE_DIR);
  const dbDir = path.join(storageDir, 'db');
  const posterDir = path.join(storageDir, 'posters');
  const audioDir = path.join(storageDir, 'audio');
  const logDir = path.join(storageDir, 'logs');
  const runStamp = new Date().toISOString().replaceAll(':', '-');
  const runLogPath = path.join(logDir, `run-${runStamp}.log`);

  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(posterDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  return {
    wordpressUsername: env.WORDPRESS_USERNAME,
    wordpressAppPassword: env.WORDPRESS_APP_PASSWORD,
    wordpressSiteUrl: env.WORDPRESS_SITE_URL.replace(/\/+$/, ''),
    wordpressSiteSlug: env.WORDPRESS_SITE_SLUG,
    tmdbApiToken: env.TMDB_API_TOKEN,
    bangumiApiToken: env.BANGUMI_API_TOKEN,
    configuredTypes,
    resourceStartDate: env.RESOURCE_START_DATE,
    resourceStartScore: env.RESOURCE_START_SCORE,
    storageDir,
    dbPath: path.join(dbDir, 'podcast.sqlite'),
    posterDir,
    audioDir,
    logDir,
    runLogPath,
    cli,
  };
}

export function getConfiguredTypesFromEnv(env: NodeJS.ProcessEnv): EpisodeType[] {
  const parsed = envSchema.pick({ TYPES: true }).parse(env);
  return parseConfiguredTypes(parsed.TYPES);
}

function parseConfiguredTypes(input: string): EpisodeType[] {
  const configuredTypes = Array.from(new Set(
    input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ));

  if (configuredTypes.length === 0) {
    throw new Error('TYPES must contain at least one resource type');
  }

  const invalidTypes = configuredTypes.filter((value) => !EPISODE_TYPE_VALUES.includes(value as EpisodeType));
  if (invalidTypes.length > 0) {
    throw new Error(`Unsupported TYPES value(s): ${invalidTypes.join(', ')}`);
  }

  return configuredTypes as EpisodeType[];
}

function collectType(value: string, previous: EpisodeType[], configuredTypes: EpisodeType[]): EpisodeType[] {
  if (!configuredTypes.includes(value as EpisodeType)) {
    throw new Error(`Unsupported --type value: ${value}. Allowed values: ${configuredTypes.join(', ')}`);
  }

  previous.push(value as EpisodeType);
  return previous;
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer value: ${value}`);
  }

  return parsed;
}

function hasExplicitOption(args: string[], optionName: string): boolean {
  return args.some((arg, index) => {
    if (arg === `--${optionName}`) {
      return true;
    }

    if (arg.startsWith(`--${optionName}=`)) {
      return true;
    }

    return false;
  });
}
