/** The promo-data directory: state.json, drafts/, media/, exports/, report.md, inbox.md. */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class DataDir {
  constructor(readonly root: string) {}

  path(rel: string): string {
    return join(this.root, rel);
  }

  async read(rel: string): Promise<string | null> {
    try {
      return await readFile(this.path(rel), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async write(rel: string, text: string): Promise<void> {
    await mkdir(dirname(this.path(rel)), { recursive: true });
    await writeFile(this.path(rel), text);
  }

  async list(rel: string): Promise<string[]> {
    try {
      return (await readdir(this.path(rel))).sort();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async exists(rel: string): Promise<boolean> {
    return (await this.read(rel).catch(() => null)) !== null;
  }
}
