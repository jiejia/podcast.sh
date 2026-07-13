import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { z } from 'zod';

import type { AppConfig, CliOptions, EpisodeType, MaintenanceConfig, PodcastFormat, WordPressPostStatus } from './types.js';

const EPISODE_TYPE_VALUES = ['tv', 'movie'] as const;

const envSchema = z.object({
  WORDPRESS_USERNAME: z.string().min(1),
  WORDPRESS_APP_PASSWORD: z.string().min(1),
  WORDPRESS_SITE_URL: z.string().url(),
  WORDPRESS_SITE_SLUG: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/),
  WORDPRESS_AUTHORS: z.string().default(''),
  WORDPRESS_CONTRIBUTORS: z.string().default(''),
  TMDB_API_TOKEN: z.string().min(1),
  PODCAST_LANG: z.string().min(1),
  TYPES: z.string().min(1),
  REGIONS: z.string().min(1),
  RESOURCE_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  RESOURCE_START_SCORE: z.coerce.number().min(0).max(10),
  STORAGE_DIR: z.string().min(1),
});

const maintenanceEnvSchema = z.object({
  WORDPRESS_USERNAME: z.string().min(1),
  WORDPRESS_APP_PASSWORD: z.string().min(1),
  WORDPRESS_SITE_URL: z.string().url(),
  STORAGE_DIR: z.string().min(1),
});

const cliSchema = z.object({
  type: z.array(z.enum(EPISODE_TYPE_VALUES)).default([]),
  limit: z.number().int().positive().default(3),
  lang: z.string().min(1).optional(),
  format: z.enum(['deep-dive', 'brief', 'critique', 'debate']).default('deep-dive'),
  wpStatus: z.enum(['publish', 'draft']).default('publish'),
  verbose: z.boolean().default(false),
});

export function parseCliArgs(argv: string[]): CliOptions {
  const configuredTypes = getConfiguredTypesFromEnv(process.env);
  const userArgs = argv.slice(2);
  const hasTypeOption = hasExplicitOption(userArgs, 'type');
  const hasLimitOption = hasExplicitOption(userArgs, 'limit');
  const hasLangOption = hasExplicitOption(userArgs, 'lang');
  const program = new Command();

  program
    .allowUnknownOption(false)
    .option('--type <type>', `allowed values: ${configuredTypes.join(', ')}`, (value: string, previous: EpisodeType[]) => {
      return collectType(value, previous, configuredTypes);
    }, [])
    .option('--limit <number>', 'max episodes per run', parseIntOption, 3)
    .option('--lang <lang>', 'podcast language')
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
  const resolvedLang = hasLangOption
    ? (parsed.lang ?? getDefaultLangFromEnv(process.env))
    : getDefaultLangFromEnv(process.env);
  if (!hasTypeOption && hasLimitOption) {
    throw new Error('`--type` is required when `--limit` is provided');
  }

  if (!hasTypeOption && !hasLimitOption) {
    return {
      types: configuredTypes,
      limit: configuredTypes.length,
      lang: resolvedLang,
      format: parsed.format,
      wpStatus: parsed.wpStatus,
      verbose: parsed.verbose,
    };
  }

  return {
    types: parsed.type,
    limit: parsed.limit,
    lang: resolvedLang,
    format: parsed.format,
    wpStatus: parsed.wpStatus,
    verbose: parsed.verbose,
  };
}

export function loadConfig(cli: CliOptions): AppConfig {
  const env = envSchema.parse(process.env);
  const configuredTypes = parseConfiguredTypes(env.TYPES);
  const regions = parseRegions(env.REGIONS);
  const unsupportedCliTypes = cli.types.filter((type) => !configuredTypes.includes(type));
  if (unsupportedCliTypes.length > 0) {
    throw new Error(`CLI types must be a subset of TYPES. Unsupported value(s): ${unsupportedCliTypes.join(', ')}`);
  }
  const storageDir = path.resolve(env.STORAGE_DIR);
  const paths = buildStoragePaths(storageDir);

  fs.mkdirSync(paths.dbDir, { recursive: true });
  fs.mkdirSync(paths.posterDir, { recursive: true });
  fs.mkdirSync(paths.audioDir, { recursive: true });
  fs.mkdirSync(paths.logDir, { recursive: true });

  return {
    wordpressUsername: env.WORDPRESS_USERNAME,
    wordpressAppPassword: env.WORDPRESS_APP_PASSWORD,
    wordpressSiteUrl: env.WORDPRESS_SITE_URL.replace(/\/+$/, ''),
    wordpressSiteSlug: env.WORDPRESS_SITE_SLUG,
    wordpressAuthors: parseWordPressUsernames(env.WORDPRESS_AUTHORS),
    wordpressContributors: parseWordPressUsernames(env.WORDPRESS_CONTRIBUTORS),
    tmdbApiToken: env.TMDB_API_TOKEN,
    configuredTypes,
    regions,
    resourceStartDate: env.RESOURCE_START_DATE,
    resourceStartScore: env.RESOURCE_START_SCORE,
    storageDir,
    dbPath: paths.dbPath,
    posterDir: paths.posterDir,
    audioDir: paths.audioDir,
    logDir: paths.logDir,
    runLogPath: paths.runLogPath,
    cli,
  };
}

export function loadMaintenanceConfig(): MaintenanceConfig {
  const env = maintenanceEnvSchema.parse(process.env);
  const storageDir = path.resolve(env.STORAGE_DIR);
  const paths = buildStoragePaths(storageDir);

  fs.mkdirSync(paths.dbDir, { recursive: true });
  fs.mkdirSync(paths.logDir, { recursive: true });

  return {
    wordpressUsername: env.WORDPRESS_USERNAME,
    wordpressAppPassword: env.WORDPRESS_APP_PASSWORD,
    wordpressSiteUrl: env.WORDPRESS_SITE_URL.replace(/\/+$/, ''),
    storageDir,
    dbPath: paths.dbPath,
    logDir: paths.logDir,
    runLogPath: paths.runLogPath,
  };
}

export function getConfiguredTypesFromEnv(env: NodeJS.ProcessEnv): EpisodeType[] {
  const parsed = envSchema.pick({ TYPES: true }).parse(env);
  return parseConfiguredTypes(parsed.TYPES);
}

export function getDefaultLangFromEnv(env: NodeJS.ProcessEnv): string {
  const parsed = envSchema.pick({ PODCAST_LANG: true }).parse(env);
  return parsed.PODCAST_LANG.trim();
}

export function parseWordPressUsernames(input: string): string[] {
  return Array.from(new Set(
    input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ));
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

function parseRegions(input: string): string[] {
  const regions = Array.from(new Set(
    input
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  ));

  if (regions.length === 0) {
    throw new Error('REGIONS must contain at least one region code');
  }

  const invalidRegions = regions.filter((value) => !/^[A-Z]{2}$/.test(value));
  if (invalidRegions.length > 0) {
    throw new Error(`Unsupported REGIONS value(s): ${invalidRegions.join(', ')}. Expected ISO 3166-1 style two-letter codes.`);
  }

  return regions;
}

function buildStoragePaths(storageDir: string): {
  dbDir: string;
  posterDir: string;
  audioDir: string;
  logDir: string;
  dbPath: string;
  runLogPath: string;
} {
  const dbDir = path.join(storageDir, 'db');
  const posterDir = path.join(storageDir, 'posters');
  const audioDir = path.join(storageDir, 'audio');
  const logDir = path.join(storageDir, 'logs');
  const runStamp = new Date().toISOString().replaceAll(':', '-');
  const runLogPath = path.join(logDir, `run-${runStamp}.log`);

  return {
    dbDir,
    posterDir,
    audioDir,
    logDir,
    dbPath: path.join(dbDir, 'podcast.sqlite'),
    runLogPath,
  };
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
