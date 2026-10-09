/** Everything an agent run needs, built from promo/ files and environment variables. Shared by the CLI and the local app. */
import { Agent, downloadTo, type AgentDeps } from './agent';
import { createPromoAi, type PromoAi } from './ai/claude';
import { DataDir } from './core/store';
import type { BrandDocs, PlatformId, PromoConfig } from './core/types';
import { renderCards } from './media/render';
import type { Platform } from './platforms/types';
import { buildHost, buildPlatforms, dataLinkBase, loadConfigDir, maintainTokens, type Env } from './setup';

/** Claude is only constructed when a command needs it, so `check` works before the key is added. */
export function lazyAi(key: string | undefined): PromoAi {
  let ai: PromoAi | null = null;
  const get = () => {
    if (!key) throw new Error('Claude API 키가 없어요. 계정 화면에서 등록해 주세요');
    return (ai ??= createPromoAi(key));
  };
  return {
    planTopic: (a) => get().planTopic(a),
    research: (a) => get().research(a),
    write: (a) => get().write(a),
    review: (a) => get().review(a),
    triageComments: (a) => get().triageComments(a),
  };
}

export interface Runtime {
  agent: Agent;
  config: PromoConfig;
  docs: BrandDocs;
  data: DataDir;
  configErrors: string[];
  platforms: Partial<Record<PlatformId, Platform>>;
}

export interface RuntimeOptions {
  env: Env;
  dryRun: boolean;
  /** Renew 60-day Meta tokens when due (real runs only). */
  refreshTokens: boolean;
  log?: (line: string) => void;
}

export async function openRuntime(o: RuntimeOptions): Promise<Runtime> {
  const env = o.env;
  const data = new DataDir(env.PROMO_DATA_DIR || '.promo-data');
  const { config, docs, errors } = await loadConfigDir(env.PROMO_DIR || 'promo');
  const linkBase = dataLinkBase(env);
  const platforms: Partial<Record<PlatformId, Platform>> = {};
  const deps: AgentDeps = {
    config,
    docs,
    ai: lazyAi(env.ANTHROPIC_API_KEY),
    platforms,
    data,
    renderCards,
    host: o.dryRun ? null : buildHost(config, env),
    now: () => new Date(),
    log: o.log ?? ((s) => console.log(s)),
    notify: async () => {},
    pause: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    dryRun: o.dryRun,
    linkBase,
    download: downloadTo,
  };
  const agent = new Agent(deps);
  await agent.load();
  const tokens = await maintainTokens(env, data, agent.state, new Date(), { refresh: o.refreshTokens && !o.dryRun, config });
  Object.assign(platforms, buildPlatforms(config, env, tokens.tokens, data, linkBase));
  for (const n of tokens.notes) agent.events.push({ kind: n.includes('못했어요') ? 'warn' : 'info', message: n });
  return { agent, config, docs, data, configErrors: errors, platforms };
}
