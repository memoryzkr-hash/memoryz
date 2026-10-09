/**
 * The planning chat. A scripted interview (chat/flow.ts) collects what a good plan needs,
 * one question at a time with tap-to-answer choices; then Claude drafts the plan and the chat
 * keeps going for changes ("더 여유롭게", "교통비 줄이기", or anything typed).
 */
import { checkApiKey } from '../../assistant/core/rules';
import { h, replaceChildren } from '../../assistant/ui/dom';
import type { PlannerAi } from '../ai';
import { forget, nextStep, progress, summary, toRequest, type Answers, type Choice, type Step } from '../chat/flow';
import { formatKrw, formatMoney } from '../core/regions';
import { scheduleTrip } from '../core/schedule';
import type { RoadLookup } from '../core/roads';
import type { PlanRequest } from '../core/store';
import { formatDuration } from '../core/time';
import { cheaperTransport, optimizeTrip, type TweakResult } from '../core/tweaks';
import type { TripPlan } from '../core/types';
import { SAMPLES, samplePlan } from '../samples';

export interface ChatHost {
  /** Claude, if this page can reach it (claude.ai account or a saved API key). */
  planner(): PlannerAi | null;
  /** True when Claude would need an API key typed in. */
  canTakeKey(): boolean;
  saveKey(key: string): boolean;
  forgetKey(): void;
  current(): { plan: TripPlan; req: PlanRequest | null } | null;
  /** Real road distances known so far, so the chat's numbers match the map's. */
  roads?: RoadLookup;
  /** A new or changed plan; the map and timetable follow. */
  usePlan(plan: TripPlan, req: PlanRequest | null): void;
  showTrip(): void;
}

type Phase = 'interview' | 'review' | 'key' | 'working' | 'result';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

function reqFromPlan(p: TripPlan): PlanRequest {
  return {
    destination: p.destination || p.title,
    days: p.days.length,
    travelers: p.travelers,
    budgetKrw: p.budgetKrw,
    pace: 'normal',
    interests: '',
    companions: '',
    transport: 'any',
    start: p.days[0]?.start ?? '09:00',
  };
}

export class Chat {
  readonly el: HTMLElement;
  private list = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite' });
  private composer = h('div', { class: 'composer' });
  private bar = h('span');
  private answers: Answers = {};
  private phase: Phase = 'interview';
  private controller: AbortController | null = null;
  private busy = false;

  constructor(private readonly host: ChatHost) {
    this.el = h(
      'section',
      { class: 'chat', 'aria-label': '여행 계획 대화' },
      h(
        'header',
        { class: 'chat-head' },
        h('div', { class: 'chat-title' }, h('b', null, '여행 플래너'), h('span', { class: 'progress', 'aria-hidden': 'true' }, this.bar)),
        h('button', { type: 'button', class: 'text-btn', onClick: () => this.restart() }, '처음부터'),
        h('button', { type: 'button', class: 'text-btn strong to-trip', onClick: () => host.showTrip() }, '내 여행'),
      ),
      this.list,
      this.composer,
    );
  }

  // ---------- messages ----------

  private scroll(): void {
    requestAnimationFrame(() => this.list.scrollTo({ top: this.list.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' }));
  }

  private push(node: HTMLElement): HTMLElement {
    this.list.append(node);
    this.scroll();
    return node;
  }

  private async bot(text: string, sub?: string, extra?: HTMLElement | null): Promise<void> {
    const typing = this.push(h('div', { class: 'msg bot', 'aria-label': '입력 중' }, h('div', { class: 'bubble typing' }, h('i'), h('i'), h('i'))));
    await wait(420);
    typing.remove();
    this.push(h('div', { class: 'msg bot' }, h('div', { class: 'bubble' }, h('p', null, text), sub ? h('p', { class: 'sub' }, sub) : null), extra ?? null));
  }

  private me(text: string): void {
    this.push(h('div', { class: 'msg me' }, text));
  }

  private setProgress(): void {
    this.bar.style.width = `${Math.round((this.phase === 'interview' ? progress(this.answers) : 1) * 100)}%`;
  }

  // ---------- flow ----------

  async start(): Promise<void> {
    const cur = this.host.current();
    await this.bot('안녕하세요! 몇 가지만 물어볼게요.', '하나씩 고르다 보면 여행 일정과 예상 비용이 완성돼요.');
    if (cur) {
      this.push(this.planCard(cur.plan, '지난번에 만든 여행'));
    }
    await this.ask();
  }

  async restart(): Promise<void> {
    this.controller?.abort();
    this.answers = {};
    this.phase = 'interview';
    replaceChildren(this.list);
    await this.bot('새로 시작할게요.');
    await this.ask();
  }

  private async ask(): Promise<void> {
    const s = nextStep(this.answers);
    this.setProgress();
    if (!s) return this.review();
    this.phase = 'interview';
    this.lock();
    await this.bot(s.ask(this.answers), s.why?.(this.answers));
    this.composeStep(s);
  }

  private async answer(s: Step, value: string): Promise<void> {
    if (this.busy) return;
    const shown = s.echo?.(value, this.answers) ?? value;
    this.me(shown);
    const r = s.apply(this.answers, value);
    if ('error' in r) {
      await this.bot(r.error);
      this.composeStep(s);
      return;
    }
    this.answers = r;
    await this.ask();
  }

  private async review(): Promise<void> {
    this.phase = 'review';
    this.setProgress();
    this.lock();
    const rows = summary(this.answers);
    const card = h(
      'div',
      { class: 'card review' },
      ...rows.map((r) =>
        h(
          'button',
          { type: 'button', class: 'row', onClick: () => this.edit(r.id, r.label) },
          h('span', { class: 'row-k' }, r.label),
          h('span', { class: 'row-v' }, r.value),
          h('span', { class: 'chev', 'aria-hidden': 'true' }),
        ),
      ),
    );
    await this.bot('이렇게 짜 볼게요.', '바꾸고 싶은 항목이 있으면 눌러 주세요.', card);
    this.compose([
      h('button', { type: 'button', class: 'btn primary block', onClick: () => this.generate() }, '이대로 일정 만들기'),
    ]);
  }

  private async edit(id: Parameters<typeof forget>[1], label: string): Promise<void> {
    if (this.busy || this.phase === 'working') return;
    this.me(`${label} 바꿀래요`);
    this.answers = forget(this.answers, id);
    await this.ask();
  }

  private async generate(): Promise<void> {
    const req = toRequest(this.answers);
    const planner = this.host.planner();
    if (!planner) return this.askKey(req);
    this.me('이대로 만들어 주세요');
    await this.run(req, (signal) => planner.plan(req, signal), `${req.destination} ${req.days > 1 ? `${req.days - 1}박 ${req.days}일` : '당일'} 일정을 짜고 있어요`);
  }

  private async askKey(req: PlanRequest): Promise<void> {
    this.phase = 'key';
    const sample = SAMPLES.find((p) => req.destination.includes(p.destination) || p.destination.includes(req.destination));
    await this.bot(
      '일정을 만들려면 Claude가 필요해요.',
      this.host.canTakeKey()
        ? 'Anthropic API 키를 넣으면 이 브라우저에만 저장하고 바로 만들어요. 키 없이 샘플 여행을 볼 수도 있어요.'
        : '지금은 Claude를 쓸 수 없어요. 대신 샘플 여행을 볼 수 있어요.',
    );
    const items: HTMLElement[] = [];
    if (sample) items.push(h('button', { type: 'button', class: 'btn secondary block', onClick: () => this.useSample(sample.id) }, `샘플 「${sample.title}」 보기`));
    items.push(this.sampleChips());
    if (this.host.canTakeKey()) {
      const input = h('input', { class: 'field', type: 'password', id: 'chat-key', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false, 'aria-label': 'Anthropic API 키' });
      const form = h('form', { class: 'ask-row' }, input, h('button', { type: 'submit', class: 'send', 'aria-label': '키 저장' }, h('span', { class: 'arrow' })));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const k = checkApiKey(input.value);
        if (!k.ok) {
          await this.bot(k.message || 'API 키를 넣어 주세요');
          return;
        }
        if (!this.host.saveKey(k.key)) {
          await this.bot('이 브라우저에는 키를 저장할 수 없어요. 일반 창에서 열어 주세요.');
          return;
        }
        this.me('키를 넣었어요');
        await this.generate();
      });
      items.push(form);
    }
    this.compose(items);
  }

  private async run(req: PlanRequest | null, job: (signal: AbortSignal) => Promise<TripPlan>, label: string): Promise<void> {
    const revising = this.phase === 'result';
    this.phase = 'working';
    this.lock();
    const controller = new AbortController();
    this.controller = controller;
    const started = Date.now();
    const secs = h('span', { class: 'secs' }, '0초');
    const timer = setInterval(() => (secs.textContent = `${Math.round((Date.now() - started) / 1000)}초`), 1000);
    const working = this.push(
      h('div', { class: 'msg bot' }, h('div', { class: 'bubble working' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('div', null, h('p', null, label), h('p', { class: 'sub' }, '보통 30초~1분 걸려요 · ', secs)))),
    );
    this.compose([h('button', { type: 'button', class: 'btn secondary block', onClick: () => controller.abort() }, '그만하기')]);
    try {
      const plan = await job(controller.signal);
      this.host.usePlan(plan, req);
      working.remove();
      await this.showResult(plan, revising ? '말씀하신 대로 고쳤어요.' : '일정을 만들었어요!');
      return;
    } catch (e) {
      working.remove();
      const kind = (e as { kind?: string }).kind;
      const keyProblem = kind === 'auth' && this.host.canTakeKey();
      if (keyProblem) this.host.forgetKey();
      await this.bot(kind === 'aborted' ? '멈췄어요.' : (e as Error).message || '만들지 못했어요.', keyProblem ? '키를 다시 넣어 주세요.' : undefined);
    } finally {
      clearInterval(timer);
      this.controller = null;
    }
    if (revising) return this.afterResult();
    this.phase = 'review';
    this.compose([
      h('button', { type: 'button', class: 'btn primary block', onClick: () => this.generate() }, '다시 시도'),
      h('button', { type: 'button', class: 'btn secondary block', onClick: () => this.review() }, '답 고치기'),
    ]);
  }

  // ---------- after a plan exists ----------

  private planCard(plan: TripPlan, title: string): HTMLElement {
    const s = scheduleTrip(plan, this.host.roads);
    const r = s.region;
    const budget =
      plan.budgetKrw === null ? null : s.overBudget ? h('span', { class: 'pill bad' }, `예산보다 ${formatKrw(s.totalKrw - plan.budgetKrw)} 많아요`) : h('span', { class: 'pill good' }, `예산 안이에요 · ${formatKrw(plan.budgetKrw - s.totalKrw)} 남아요`);
    return h(
      'div',
      { class: 'card plan-card' },
      h('p', { class: 'cap' }, title),
      h('h3', null, plan.title),
      h('div', { class: 'big' }, formatMoney(r, s.total), r.id === 'KR' ? null : h('small', null, ` ≈ ${formatKrw(s.totalKrw)}`)),
      h('p', { class: 'sub' }, `1인당 ${formatMoney(r, s.perPerson)} · 이동 ${formatDuration(s.travelMin)}`),
      budget,
      h(
        'ol',
        { class: 'days-mini' },
        ...plan.days.map((d, i) => h('li', null, h('b', null, `${i + 1}일차`), d.stops.map((x) => x.name).join(' → '))),
      ),
      h('button', { type: 'button', class: 'btn primary block', onClick: () => this.host.showTrip() }, '지도에서 이동 보기'),
    );
  }

  private async showResult(plan: TripPlan, title: string): Promise<void> {
    this.phase = 'result';
    this.setProgress();
    await this.bot(title, '▶ 재생을 누르면 하루 동안 움직이는 모습과 쓰는 돈을 볼 수 있어요.', this.planCard(plan, '예상 일정'));
    this.afterResult();
  }

  private afterResult(): void {
    this.phase = 'result';
    const cur = this.host.current();
    if (!cur) return void this.ask();
    const tweak = (label: string, fn: (p: TripPlan) => TweakResult, done: (r: TweakResult) => string, none: string) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip',
          onClick: async () => {
            const now = this.host.current();
            if (!now || this.busy) return;
            this.me(label);
            const r = fn(now.plan);
            if (!r.changed || (r.savedMin <= 0 && r.saved <= 0)) {
              await this.bot(none);
              return this.afterResult();
            }
            this.host.usePlan(r.plan, now.req);
            await this.bot(done(r), undefined, this.planCard(r.plan, '바뀐 일정'));
            this.afterResult();
          },
        },
        label,
      );
    const region = scheduleTrip(cur.plan, this.host.roads).region;
    const ask = (text: string) => this.revise(text);
    const quick = (label: string, text: string) => h('button', { type: 'button', class: 'chip', onClick: () => ask(text || label) }, label);
    this.composeFree(
      [
        tweak('동선 최적화', optimizeTrip, (r) => `이동 시간을 ${formatDuration(r.savedMin)} 줄였어요.`, '지금 순서가 이미 가장 빨라요.'),
        tweak(
          '교통비 줄이기',
          cheaperTransport,
          (r) => `택시·렌터카를 대중교통과 도보로 바꿔서 ${formatMoney(region, r.saved)} 아꼈어요.${r.savedMin < 0 ? ` 대신 이동이 ${formatDuration(-r.savedMin)} 늘어요.` : ''}`,
          '더 줄일 교통비가 없어요.',
        ),
        quick('더 여유롭게', '하루에 가는 곳을 줄이고 쉬는 시간을 늘려 주세요.'),
        quick('맛집 더 넣기', '현지에서 유명한 맛집과 카페를 더 넣어 주세요.'),
        h('button', { type: 'button', class: 'chip', onClick: () => this.restart() }, '다른 여행 짜기'),
      ],
      '바꾸고 싶은 걸 말해 주세요 (예: 둘째 날 온천 넣어 줘)',
      (text) => ask(text),
    );
  }

  private async revise(text: string): Promise<void> {
    const cur = this.host.current();
    if (!cur || this.busy) return;
    const planner = this.host.planner();
    this.me(text);
    if (!planner) {
      await this.bot('이 부탁은 Claude가 있어야 들어줄 수 있어요.', '동선 최적화와 교통비 줄이기는 바로 할 수 있어요.');
      return this.afterResult();
    }
    const req = cur.req ?? reqFromPlan(cur.plan);
    await this.run(req, (signal) => planner.revise(cur.plan, req, text, signal), '말씀하신 대로 고치고 있어요');
  }

  private async useSample(id: string): Promise<void> {
    const p = samplePlan(id);
    if (!p) return;
    this.me(`샘플 「${p.title}」 볼래요`);
    this.host.usePlan(p, null);
    await this.showResult(p, '샘플 여행을 열었어요.');
  }

  private sampleChips(): HTMLElement {
    return h('div', { class: 'chips' }, ...SAMPLES.map((p) => h('button', { type: 'button', class: 'chip', onClick: () => this.useSample(p.id) }, `샘플 · ${p.destination}`)));
  }

  // ---------- composer ----------

  private lock(): void {
    this.busy = true;
    replaceChildren(this.composer);
  }

  private compose(items: HTMLElement[]): void {
    this.busy = false;
    replaceChildren(this.composer, ...items);
  }

  /** Chips plus a free-text box. */
  private composeFree(chips: HTMLElement[], placeholder: string, onText: (t: string) => void): void {
    const input = h('input', { class: 'field', id: 'chat-input', placeholder, autocomplete: 'off', 'aria-label': placeholder, maxLength: 200 });
    const form = h('form', { class: 'ask-row' }, input, h('button', { type: 'submit', class: 'send', 'aria-label': '보내기' }, h('span', { class: 'arrow' })));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (t) onText(t);
    });
    this.compose([h('div', { class: 'chips' }, ...chips), form]);
  }

  private composeStep(s: Step): void {
    const choices = s.choices(this.answers);
    const items: HTMLElement[] = [];
    if (s.multi) {
      const picked = new Set<string>();
      const done = h('button', { type: 'button', class: 'btn primary block', disabled: true }, '다 골랐어요');
      const chips = choices.map((c) => {
        const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, c.label);
        b.addEventListener('click', () => {
          if (picked.has(c.value)) picked.delete(c.value);
          else picked.add(c.value);
          b.setAttribute('aria-pressed', String(picked.has(c.value)));
          done.disabled = picked.size === 0;
          done.textContent = picked.size ? `다 골랐어요 (${picked.size})` : '다 골랐어요';
        });
        return b;
      });
      done.addEventListener('click', () => this.answer(s, [...picked].join(', ')));
      items.push(h('div', { class: 'chips' }, ...chips), done);
    } else if (choices.some((c) => c.hint)) {
      items.push(h('div', { class: 'options' }, ...choices.map((c) => this.option(s, c))));
    } else {
      items.push(h('div', { class: 'chips' }, ...choices.map((c) => h('button', { type: 'button', class: 'chip', onClick: () => this.answer(s, c.value) }, c.label))));
    }
    if (s.id === 'destination') items[0].append(...this.sampleChips().children);
    if (s.input) {
      const input = h('input', { class: 'field', id: `ask-${s.id}`, placeholder: s.input, autocomplete: 'off', 'aria-label': s.input, maxLength: 60 });
      const form = h('form', { class: 'ask-row' }, input, h('button', { type: 'submit', class: 'send', 'aria-label': '보내기' }, h('span', { class: 'arrow' })));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (v) void this.answer(s, v);
      });
      items.push(form);
    }
    this.compose(items);
  }

  private option(s: Step, c: Choice): HTMLElement {
    return h('button', { type: 'button', class: 'option', onClick: () => this.answer(s, c.value) }, h('b', null, c.label), c.hint ? h('span', null, c.hint) : null);
  }
}
