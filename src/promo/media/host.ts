/**
 * Puts card images at a public URL so Instagram/Threads can fetch them (docs/promo/PLAN.md §6).
 * Files go to a dedicated branch through the GitHub contents API and are served from raw.githubusercontent.com.
 */
import { readFile } from 'node:fs/promises';
import { PlatformError, request, sleep, type Fetch } from '../platforms/http';

export interface MediaHost {
  /** Uploads local files under `dir/` and returns their public URLs, in order. */
  upload(dir: string, files: string[]): Promise<string[]>;
  /** Is the repo public (raw URLs reachable without a token)? */
  check(): Promise<{ repo: string; public: boolean }>;
}

const GITHUB = 'https://api.github.com';

export function createGitHubHost(repo: string, branch: string, token: string, opts: { fetch?: Fetch; readFile?: (p: string) => Promise<Uint8Array> } = {}): MediaHost {
  const f = opts.fetch ?? fetch;
  const read = opts.readFile ?? ((p: string) => readFile(p));
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'promo-agent' };
  const gh = <T>(path: string, o: Parameters<typeof request>[2] = {}) => request<T>(f, `${GITHUB}/repos/${repo}${path}`, { ...o, headers: { ...headers, ...o.headers } });

  let branchReady = false;
  /** Creates the media branch as an orphan with a README the first time. */
  async function ensureBranch() {
    if (branchReady) return;
    try {
      await gh(`/git/ref/heads/${branch}`);
    } catch (e) {
      if (!(e instanceof PlatformError) || e.status !== 404) throw e;
      const blob = await gh<{ sha: string }>('/git/blobs', {
        json: { content: '# 홍보 에이전트 카드 이미지\n\n에이전트가 인스타그램·쓰레드에 올린 카드 이미지를 보관하는 브랜치입니다.\n', encoding: 'utf-8' },
      });
      const tree = await gh<{ sha: string }>('/git/trees', { json: { tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blob.sha }] } });
      const commit = await gh<{ sha: string }>('/git/commits', { json: { message: 'Start promo media branch', tree: tree.sha, parents: [] } });
      await gh('/git/refs', { json: { ref: `refs/heads/${branch}`, sha: commit.sha } });
    }
    branchReady = true;
  }

  return {
    async check() {
      const r = await gh<{ full_name: string; private: boolean }>('');
      return { repo: r.full_name, public: !r.private };
    },

    async upload(dir, files) {
      await ensureBranch();
      const urls: string[] = [];
      for (const file of files) {
        const name = file.split(/[\\/]/).pop()!;
        const path = `${dir}/${name}`;
        const content = Buffer.from(await read(file)).toString('base64');
        let sha: string | undefined;
        try {
          sha = (await gh<{ sha: string }>(`/contents/${path}`, { query: { ref: branch } })).sha;
        } catch (e) {
          if (!(e instanceof PlatformError) || e.status !== 404) throw e;
        }
        await gh(`/contents/${path}`, { method: 'PUT', json: { message: `Add ${path}`, content, branch, sha }, retries: 2 });
        urls.push(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`);
      }
      // raw.githubusercontent.com can lag a few seconds behind a fresh commit.
      for (const url of urls) await waitPublic(f, url);
      return urls;
    },
  };
}

async function waitPublic(f: Fetch, url: string) {
  for (let i = 0; i < 10; i++) {
    try {
      const res = await f(url, { method: 'HEAD' });
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await sleep.ms(3000);
  }
  throw new PlatformError(`이미지 주소가 공개되지 않았어요: ${url} (저장소가 비공개라면 media.repo에 공개 저장소를 적어 주세요)`, null);
}
