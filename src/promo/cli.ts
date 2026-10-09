/**
 * npm run promo -- <command> [--dry-run] [--topic "..."] [--platform blog|instagram|threads] [--refs references/picked.json]
 * Commands: run · post-now · preview · comments · check · due (docs/promo/PLAN.md §7)
 */
import Anthropic from '@anthropic-ai/sdk';
import { appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Agent, downloadTo, imagesStale } from './agent';
import { MODEL } from './ai/claude';
import { lazyAi } from './runtime';
import { parseDraft } from './core/draft';
import { DataDir } from './core/store';
import { PLATFORM_LABELS, type PlatformId } from './core/types';
import { describeError } from './errors';
import { renderCards } from './media/render';
import { parseChosen } from './core/references';
import { buildHost, buildPlatforms, dataLinkBase, loadConfigDir, maintainTokens, missingEnv, resolvePlatforms, sendWebhook } from './setup';

const COMMANDS = ['run', 'post-now', 'preview', 'research', 'comments', 'check', 'due'] as const;
type Command = (typeof COMMANDS)[number];

function parseArgs(argv: string[]) {
  const args = { command: 'run' as Command, dryRun: false, topic: null as string | null, platform: null as string | null, refs: null as string | null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--topic') args.topic = argv[++i]?.trim() || null;
    else if (a.startsWith('--topic=')) args.topic = a.slice(8).trim() || null;
    else if (a === '--platform') args.platform = argv[++i]?.trim() || null;
    else if (a === '--refs') args.refs = argv[++i]?.trim() || null;
    else if (a.startsWith('--platform=')) args.platform = a.slice(11).trim() || null;
    else if ((COMMANDS as readonly string[]).includes(a)) args.command = a as Command;
    else throw new Error(`모르는 명령이에요: ${a} (쓸 수 있는 명령: ${COMMANDS.join(', ')})`);
  }
  if (args.command === 'preview') args.dryRun = true;
  return args;
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = process.env;
  const args = parseArgs(process.argv.slice(2));
  const configDir = env.PROMO_DIR || 'promo';
  const data = new DataDir(env.PROMO_DATA_DIR || '.promo-data');
  const log = (s: string) => console.log(s);

  const { config, docs, errors } = await loadConfigDir(configDir);
  if (errors.length) {
    console.error(`설정을 고쳐 주세요 (${configDir}/):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    process.exit(1);
  }

  const linkBase = dataLinkBase(env);
  const deps = {
    config,
    docs,
    ai: lazyAi(env.ANTHROPIC_API_KEY),
    platforms: {} as Partial<Record<PlatformId, ReturnType<typeof buildPlatforms>[PlatformId]>>,
    data,
    renderCards,
    host: args.dryRun ? null : buildHost(config, env),
    now: () => new Date(),
    log,
    notify: async () => {},
    pause: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    dryRun: args.dryRun,
    linkBase,
    download: downloadTo,
  };
  const agent = new Agent(deps as ConstructorParameters<typeof Agent>[0]);
  await agent.load();

  if (args.command === 'due') {
    // Lets the workflow skip installing Chromium and fonts when no images will be made.
    const due = agent.hasDueSlot();
    let approved = false;
    for (const name of await data.list('drafts')) {
      try {
        const d = parseDraft((await data.read(`drafts/${name}`)) ?? '');
        if (d.status === 'approved' && imagesStale(d, true)) approved = true;
      } catch {
        // reported by the real run
      }
    }
    console.log(due || approved ? 'true' : 'false');
    return;
  }

  const needsAi = args.command !== 'check';
  const missing = missingEnv(config, env, needsAi);
  if (missing.length) {
    const msg = `환경 변수(또는 GitHub Secrets)가 비어 있어요: ${missing.join(', ')} — docs/promo/SETUP.md 참고`;
    if (args.command === 'check') console.log(`⚠️ ${msg}`);
    else if (missing.includes('ANTHROPIC_API_KEY')) {
      console.error(msg);
      process.exit(1);
    } else {
      // A platform without an account fails on its own; the others still post.
      agent.events.push({ kind: 'warn', message: `자동화를 켰지만 계정이 없어요: ${missing.join(', ')}` });
    }
  }

  const tokens = await maintainTokens(env, data, agent.state, new Date(), { refresh: !args.dryRun && args.command !== 'check', config });
  Object.assign(deps.platforms, buildPlatforms(config, env, tokens.tokens, data, linkBase));
  for (const n of tokens.notes) agent.events.push({ kind: n.includes('못했어요') ? 'warn' : 'info', message: n });

  if (args.command === 'check') {
    let ok = !missing.length;
    for (const [id, p] of Object.entries(deps.platforms)) {
      try {
        console.log(`✅ ${PLATFORM_LABELS[id as PlatformId]}: ${await p!.check()}`);
      } catch (e) {
        ok = false;
        console.log(`❌ ${PLATFORM_LABELS[id as PlatformId]}: ${describeError(e)}`);
      }
    }
    if (env.ANTHROPIC_API_KEY) {
      try {
        await new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).models.retrieve(MODEL);
        console.log(`✅ Claude: ${MODEL}`);
      } catch (e) {
        ok = false;
        console.log(`❌ Claude: ${describeError(e)}`);
      }
    } else {
      ok = false;
      console.log('❌ Claude: ANTHROPIC_API_KEY가 없어요');
    }
    const host = buildHost(config, env);
    if (!host) console.log('⚠️ 카드 이미지 저장소: GITHUB_TOKEN과 저장소 이름이 없어 이미지를 공개 주소에 올릴 수 없어요 (인스타그램 불가)');
    else {
      try {
        const h = await host.check();
        console.log(h.public ? `✅ 카드 이미지 저장소: ${h.repo} (공개)` : `❌ 카드 이미지 저장소: ${h.repo}가 비공개라 인스타그램이 이미지를 못 가져가요 — media.repo에 공개 저장소를 적어 주세요`);
        if (!h.public && config.platforms.instagram.enabled) ok = false;
      } catch (e) {
        ok = false;
        console.log(`❌ 카드 이미지 저장소: ${describeError(e)}`);
      }
    }
    for (const n of tokens.notes) console.log(`ℹ️ ${n}`);
    process.exit(ok ? 0 : 1);
  }

  try {
    if (args.command === 'run') await agent.run();
    else if (args.command === 'post-now' || args.command === 'preview') {
      // Only files the dashboard writes, never a path outside promo-data/references.
      const refsPath = args.refs && /^references\/[\w.-]+\.json$/.test(args.refs) ? args.refs : null;
      const chosen = refsPath ? parseChosen(await data.read(refsPath)) : [];
      if (args.refs && !chosen.length) agent.events.push({ kind: 'warn', message: `고른 레퍼런스(${args.refs})를 읽지 못해 레퍼런스 없이 썼어요` });
      const draft = await agent.postNow(args.topic, resolvePlatforms(args.platform, config, env), chosen);
      if (draft) log(`초안: ${data.path(`drafts/${draft.id}.md`)}`);
    } else if (args.command === 'research') {
      const path = await agent.findReferences(args.topic, resolvePlatforms(args.platform, config, env));
      if (path) log(`레퍼런스: ${data.path(path)}`);
    } else if (args.command === 'comments') await agent.handleComments();
  } finally {
    await agent.save();
    const report = await agent.writeReport(args.command);
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, report);
    const note = agent.notification();
    if (note && !args.dryRun) {
      const failed = await sendWebhook(env.NOTIFY_WEBHOOK_URL, note);
      if (failed) console.log(`⚠️ ${failed}`);
    }
    console.log(`\n${report}`);
  }
}

main().catch((e) => {
  console.error(`실패: ${describeError(e)}`);
  process.exit(1);
});
