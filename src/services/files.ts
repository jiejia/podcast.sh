import fs from 'node:fs/promises';
import path from 'node:path';

export async function downloadToFile(url: string, targetPath: string, headers?: Record<string, string>): Promise<void> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, bytes);
}
