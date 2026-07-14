import fs from 'node:fs/promises';
import path from 'node:path';

export interface LocalDataPaths {
  storageDir: string;
  dbDir: string;
  posterDir: string;
  audioDir: string;
}

export interface ResetLocalDataResult {
  removedPaths: string[];
  recreatedPaths: string[];
}

export function buildLocalDataPaths(storageDir: string): LocalDataPaths {
  const resolvedStorageDir = path.resolve(storageDir);
  return {
    storageDir: resolvedStorageDir,
    dbDir: path.join(resolvedStorageDir, 'db'),
    posterDir: path.join(resolvedStorageDir, 'posters'),
    audioDir: path.join(resolvedStorageDir, 'audio'),
  };
}

export async function removeLocalFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

export async function resetLocalData(paths: LocalDataPaths): Promise<ResetLocalDataResult> {
  const removedPaths: string[] = [];
  const recreatedPaths: string[] = [];
  const targets = [paths.dbDir, paths.posterDir, paths.audioDir];

  await fs.mkdir(paths.storageDir, { recursive: true });

  for (const target of targets) {
    await fs.rm(target, { recursive: true, force: true });
    removedPaths.push(target);
  }

  for (const target of targets) {
    await fs.mkdir(target, { recursive: true });
    recreatedPaths.push(target);
  }

  return {
    removedPaths,
    recreatedPaths,
  };
}
