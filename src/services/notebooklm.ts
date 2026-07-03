import { spawn } from 'node:child_process';

import { buildPodcastTitle, normalizeNotebookLanguage, normalizePodcastFormat, removeFileExtension, sleep } from '../lib/utils.js';
import type { Logger, PodcastFormat } from '../types.js';

interface StudioArtifact {
  id: string;
  title: string;
  type?: string;
  artifact_type?: string;
  status?: string | number;
  audio_url?: string | null;
  created_at?: string;
}

interface NotebookDetails {
  notebook_id: string;
  title?: string;
  source_count?: number;
  sources?: Array<{
    id?: string;
    title?: string;
    url?: string | null;
    type?: string;
  }>;
}

interface WaitForAudioArtifactOptions {
  timeoutMs?: number;
  intervalMs?: number;
  onPoll?: (payload: {
    elapsedMs: number;
    timeoutMs: number;
    artifact?: StudioArtifact;
  }) => void;
}

export class NotebookLmService {
  public constructor(private readonly logger: Logger) {}

  public async checkLogin(): Promise<void> {
    await this.run(['login', '--check']);
  }

  public async createNotebook(title: string): Promise<string> {
    const output = await this.runJson(['notebook', 'create', title]);
    const notebookId = this.extractNotebookId(output);
    if (!notebookId) {
      throw new Error('Unable to extract notebook_id from nlm notebook create');
    }

    return notebookId;
  }

  public async runResearch(notebookId: string, query: string): Promise<void> {
    await this.run(['research', 'start', query, '--notebook-id', notebookId, '--mode', 'fast']);
    await this.run(['research', 'status', notebookId, '--full', '--poll-interval', '15', '--max-wait', '300']);
    await this.run(['research', 'import', notebookId, '--timeout', '300']);
  }

  public async getNotebookSourceCount(notebookId: string): Promise<number> {
    const output = await this.runJson(['notebook', 'get', notebookId]);
    return this.extractSourceCount(output);
  }

  public async addSourceUrl(notebookId: string, url: string): Promise<void> {
    await this.run(['source', 'add', notebookId, '--url', url, '--wait', '--wait-timeout', '300']);
  }

  public async createAudio(notebookId: string, format: PodcastFormat, language: string): Promise<void> {
    await this.run([
      'audio',
      'create',
      notebookId,
      '--format',
      normalizePodcastFormat(format),
      '--language',
      normalizeNotebookLanguage(language),
      '--confirm',
    ]);
  }

  public async queryText(notebookId: string, prompt: string): Promise<string> {
    const output = await this.run(['notebook', 'query', notebookId, prompt]);
    return output.trim();
  }

  public async waitForAudioArtifact(notebookId: string, options: WaitForAudioArtifactOptions = {}): Promise<StudioArtifact> {
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    const intervalMs = options.intervalMs ?? 20_000;
    const startedAt = Date.now();
    let lastSeen: StudioArtifact | undefined;

    while (Date.now() - startedAt <= timeoutMs) {
      const output = await this.runJson(['studio', 'status', notebookId, '--json', '--full']);
      const artifacts = this.extractArtifacts(output);
      const audioArtifacts = artifacts.filter((artifact) => this.isAudioArtifact(artifact));
      if (audioArtifacts.length > 0) {
        audioArtifacts.sort((left, right) => {
          const leftValue = left.created_at ?? left.title;
          const rightValue = right.created_at ?? right.title;
          return rightValue.localeCompare(leftValue);
        });
        lastSeen = audioArtifacts[0];
        if (this.isCompletedStatus(lastSeen.status)) {
          return lastSeen;
        }
      }

      options.onPoll?.({
        elapsedMs: Date.now() - startedAt,
        timeoutMs,
        artifact: lastSeen,
      });
      await sleep(intervalMs);
    }

    throw new Error(`Audio generation did not complete in time for notebook ${notebookId}; last artifact=${JSON.stringify(lastSeen)}`);
  }

  public async downloadAudio(notebookId: string, artifactId: string, outputPath: string): Promise<void> {
    await this.run(['download', 'audio', notebookId, '--id', artifactId, '--output', outputPath]);
  }

  public async deleteNotebook(notebookId: string): Promise<void> {
    await this.run(['notebook', 'delete', notebookId, '--confirm']);
  }

  public buildPodcastTitle(resourceName: string, artifact: { title: string }): string {
    return buildPodcastTitle(resourceName, removeFileExtension(artifact.title));
  }

  private async run(args: string[]): Promise<string> {
    this.logger.info('Running nlm command', { args });
    const result = await this.exec('nlm', args);
    if (result.code !== 0) {
      throw new Error(`nlm ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    }

    return result.stdout;
  }

  private async runJson(args: string[]): Promise<unknown> {
    const commandArgs = args.includes('--json') ? args : [...args, '--json'];
    const output = await this.run(commandArgs);

    try {
      return JSON.parse(output);
    } catch (error) {
      throw new Error(`Failed to parse JSON from nlm ${args.join(' ')}: ${String(error)}\n${output}`);
    }
  }

  private extractNotebookId(output: unknown): string | undefined {
    if (typeof output === 'object' && output) {
      if ('notebook_id' in output && typeof (output as { notebook_id: unknown }).notebook_id === 'string') {
        return (output as { notebook_id: string }).notebook_id;
      }

      if ('id' in output && typeof (output as { id: unknown }).id === 'string') {
        return (output as { id: string }).id;
      }
    }

    const notebookId = this.findStringField(output, 'notebook_id');
    if (notebookId) {
      return notebookId;
    }

    return this.findStringField(output, 'id');
  }

  private extractSourceCount(output: unknown): number {
    if (typeof output === 'object' && output) {
      const notebook = output as NotebookDetails;
      if (typeof notebook.source_count === 'number') {
        return notebook.source_count;
      }
      if (Array.isArray(notebook.sources)) {
        return notebook.sources.length;
      }
    }

    const sourceCount = this.findNumberField(output, 'source_count');
    if (typeof sourceCount === 'number') {
      return sourceCount;
    }

    const sources = this.findArrayField(output, 'sources');
    if (Array.isArray(sources)) {
      return sources.length;
    }

    return 0;
  }

  private extractArtifacts(output: unknown): StudioArtifact[] {
    const matches: StudioArtifact[] = [];
    this.walk(output, (value) => {
      if (!value || typeof value !== 'object') {
        return;
      }

      const candidate = value as Record<string, unknown>;
      const id = typeof candidate.id === 'string' ? candidate.id : undefined;
      const title = typeof candidate.title === 'string' ? candidate.title : undefined;
      if (!id || !title) {
        return;
      }

      matches.push({
        id,
        title,
        type: typeof candidate.type === 'string' ? candidate.type : undefined,
        artifact_type: typeof candidate.artifact_type === 'string' ? candidate.artifact_type : undefined,
        status: typeof candidate.status === 'string' || typeof candidate.status === 'number' ? candidate.status : undefined,
        audio_url: typeof candidate.audio_url === 'string' ? candidate.audio_url : undefined,
        created_at: typeof candidate.created_at === 'string' ? candidate.created_at : undefined,
      });
    });

    return matches;
  }

  private isAudioArtifact(artifact: StudioArtifact): boolean {
    const type = `${artifact.type ?? ''} ${artifact.artifact_type ?? ''}`.toLowerCase();
    return type.includes('audio')
      || Boolean(artifact.audio_url)
      || artifact.title.toLowerCase().includes('audio')
      || artifact.title.toLowerCase().includes('podcast');
  }

  private isCompletedStatus(status: StudioArtifact['status']): boolean {
    if (typeof status === 'number') {
      return status === 3;
    }

    return typeof status === 'string' && status.toLowerCase().includes('complete');
  }

  private walk(value: unknown, visitor: (value: unknown) => void): void {
    visitor(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        this.walk(entry, visitor);
      }
      return;
    }

    if (value && typeof value === 'object') {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        this.walk(entry, visitor);
      }
    }
  }

  private findStringField(value: unknown, fieldName: string): string | undefined {
    let found: string | undefined;
    this.walk(value, (entry) => {
      if (found) {
        return;
      }

      if (entry && typeof entry === 'object') {
        const candidate = entry as Record<string, unknown>;
        if (typeof candidate[fieldName] === 'string') {
          found = candidate[fieldName] as string;
        }
      }
    });
    return found;
  }

  private findNumberField(value: unknown, fieldName: string): number | undefined {
    let found: number | undefined;
    this.walk(value, (entry) => {
      if (typeof found === 'number') {
        return;
      }

      if (entry && typeof entry === 'object') {
        const candidate = entry as Record<string, unknown>;
        if (typeof candidate[fieldName] === 'number') {
          found = candidate[fieldName] as number;
        }
      }
    });
    return found;
  }

  private findArrayField(value: unknown, fieldName: string): unknown[] | undefined {
    let found: unknown[] | undefined;
    this.walk(value, (entry) => {
      if (found) {
        return;
      }

      if (entry && typeof entry === 'object') {
        const candidate = entry as Record<string, unknown>;
        if (Array.isArray(candidate[fieldName])) {
          found = candidate[fieldName] as unknown[];
        }
      }
    });
    return found;
  }

  private exec(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });

      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', reject);
      child.on('close', (code) => {
        resolve({
          code: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
  }
}
