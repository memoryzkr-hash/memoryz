/**
 * Writes the travel planner as its own small project for handing over:
 * `npm run export:travel` → dist-handoff/travel-planner/ (plus travel-planner.zip when `zip` exists).
 * Only files the app and its tests actually import are copied, found by following imports.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outBase = join(root, 'dist-handoff');
const out = join(outBase, 'travel-planner');
rmSync(outBase, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

// ---- follow relative imports from the app and its tests ----
const seen = new Set();
const queue = [...walk(join(root, 'src/travel')), ...walk(join(root, 'tests/travel'))].filter((f) => /\.(ts|css)$/.test(f));
const resolveImport = (from, spec) => {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c;
  throw new Error(`cannot resolve ${spec} from ${relative(root, from)}`);
};
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!file.endsWith('.ts')) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) queue.push(resolveImport(file, m[1]));
}
for (const f of seen) {
  const dest = join(out, relative(root, f));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(f, dest);
}

// ---- project files ----
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const pick = (names, from) => Object.fromEntries(names.map((n) => [n, from[n]]));
const pkg = {
  name: 'travel-planner',
  private: true,
  version: '1.0.0',
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'tsc --noEmit && vite build',
    preview: 'vite preview',
    test: 'vitest run',
    typecheck: 'tsc --noEmit',
    'build:artifact': 'node scripts/build-artifact.mjs',
  },
  dependencies: pick(['@anthropic-ai/sdk', 'maplibre-gl'], rootPkg.dependencies),
  devDependencies: pick(['@types/geojson', 'typescript', 'vite', 'vitest'], rootPkg.devDependencies),
};
writeFileSync(join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
tsconfig.compilerOptions.types = ['vite/client'];
writeFileSync(join(out, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');

writeFileSync(
  join(out, 'vite.config.ts'),
  `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  base: './',\n  build: { chunkSizeWarningLimit: 2000 },\n});\n`,
);
writeFileSync(join(out, 'index.html'), readFileSync(join(root, 'travel.html'), 'utf8'));
writeFileSync(join(out, '.gitignore'), 'node_modules\ndist\ndist-artifact\n.env.local\n*.log\n');
writeFileSync(
  join(out, '.env.example'),
  '# 복사해서 .env.local 로 저장하고 채우세요 (Git에 올리지 않음). 지금 버전은 키 없이 동작합니다.\n# 카카오맵을 붙일 때: docs/REALTIME_MAP.md 3번\nVITE_KAKAO_JS_KEY=\n# 길찾기 프록시를 만들 때: docs/REALTIME_MAP.md 4번\nVITE_ROUTE_PROXY=\n',
);

mkdirSync(join(out, 'scripts'), { recursive: true });
writeFileSync(
  join(out, 'scripts/build-artifact.mjs'),
  readFileSync(join(root, 'scripts/build-travel-artifact.mjs'), 'utf8')
    .replace("join(root, 'travel.html')", "join(root, 'index.html')")
    .replace('`npm run build:travel-artifact`', '`npm run build:artifact`'),
);

// ---- docs: the setup guide becomes the README; paths follow the new layout ----
const fixPaths = (s) => s.replaceAll('docs/travel/LOCAL_SETUP.md', 'README.md').replaceAll('docs/travel/', 'docs/');
writeFileSync(join(out, 'README.md'), fixPaths(readFileSync(join(root, 'docs/travel/LOCAL_SETUP.md'), 'utf8')));
mkdirSync(join(out, 'docs'), { recursive: true });
for (const [from, to] of [
  ['docs/travel/HANDOFF.md', 'docs/HANDOFF.md'],
  ['docs/travel/REALTIME_MAP.md', 'docs/REALTIME_MAP.md'],
  ['docs/TRAVEL_PLAN.md', 'docs/TRAVEL_PLAN.md'],
]) {
  writeFileSync(join(out, to), fixPaths(readFileSync(join(root, from), 'utf8')));
}

// A lockfile so the recipient installs exactly the versions tested here.
try {
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: out, stdio: 'ignore' });
} catch {
  console.log('(could not write package-lock.json: npm install will resolve versions)');
}

console.log(`dist-handoff/travel-planner: ${seen.size} source files`);
try {
  execFileSync('zip', ['-qr', 'travel-planner.zip', 'travel-planner'], { cwd: outBase });
  console.log('dist-handoff/travel-planner.zip');
} catch {
  console.log('(zip not found: compress dist-handoff/travel-planner yourself)');
}
