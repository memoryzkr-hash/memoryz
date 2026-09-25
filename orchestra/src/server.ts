import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MEMBERS, MODEL_OPTIONS, makeAgent, providerReady } from './agents.js';
import { Room, type RoomEvent } from './orchestrator.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // .env 없이 환경 변수만으로도 동작
}

const PORT = Number(process.env.PORT ?? 8787);
const dataFile = path.join(root, 'data', 'room.json');
const publicDir = path.join(root, 'public');

const clients = new Set<ServerResponse>();
const broadcast = (e: RoomEvent) => {
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of clients) res.write(line);
};

let room: Room;
const save = () => {
  mkdirSync(path.dirname(dataFile), { recursive: true });
  writeFileSync(
    dataFile,
    JSON.stringify({ members: room.members, settings: room.settings, messages: room.messages }, null, 2),
  );
};
const saved = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : {};
// 저장된 멤버 설정을 기본값 위에 덮는다 (새로 생긴 필드는 기본값 유지)
const members = DEFAULT_MEMBERS.map((d) => ({ ...d, ...(saved.members ?? []).find((m: { id: string }) => m.id === d.id) }));
room = new Room(members, { makeAgent, ready: providerReady, emit: broadcast, onChange: save });
room.messages = saved.messages ?? [];
Object.assign(room.settings, saved.settings);

const state = () => ({
  messages: room.messages,
  settings: room.settings,
  busy: room.busy,
  members: room.views(),
  modelOptions: MODEL_OPTIONS,
});

async function body(req: IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, state());
    if (req.method === 'POST' && url.pathname === '/api/message') {
      const { text, to } = await body(req);
      if (typeof text !== 'string' || !text.trim()) return json(res, { error: '빈 메시지' }, 400);
      room.post(text.trim(), typeof to === 'string' ? to : undefined);
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      room.stop();
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      room.reset();
      broadcast({ type: 'members' });
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/member') {
      const { id, ...patch } = await body(req);
      if (patch.provider !== undefined && !['claude', 'gpt'].includes(patch.provider))
        return json(res, { error: '알 수 없는 제공자' }, 400);
      if (patch.effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(patch.effort))
        return json(res, { error: '알 수 없는 생각 깊이' }, 400);
      for (const key of ['name', 'emoji', 'model', 'specialty'] as const)
        if (patch[key] !== undefined) patch[key] = String(patch[key]).slice(0, 200);
      if (patch.present !== undefined) patch.present = Boolean(patch.present);
      if (patch.score !== undefined && !Number.isFinite(Number(patch.score)))
        return json(res, { error: '점수는 숫자여야 합니다' }, 400);
      room.configure(String(id), patch);
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/react') {
      const { id, value } = await body(req);
      room.react(String(id), value === 'up' || value === 'down' ? value : null);
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const { maxTurns, summarize, autoRank } = await body(req);
      if (Number.isFinite(maxTurns)) room.settings.maxTurns = Math.max(1, Math.min(30, Math.round(maxTurns)));
      if (typeof summarize === 'boolean') room.settings.summarize = summarize;
      if (typeof autoRank === 'boolean') room.settings.autoRank = autoRank;
      save();
      broadcast({ type: 'members' });
      return json(res, { ok: true });
    }
    if (req.method === 'GET') {
      const file = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!file.startsWith(publicDir + path.sep)) return json(res, { error: 'not found' }, 404);
      const content = await readFile(file).catch(() => null);
      if (!content) return json(res, { error: 'not found' }, 404);
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
      return res.end(content);
    }
    json(res, { error: 'not found' }, 404);
  } catch (err) {
    json(res, { error: (err as Error).message }, 500);
  }
});

// SSE 연결이 프록시에서 끊기지 않도록 주기적으로 주석을 보낸다
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 20000).unref();

server.listen(PORT, () => {
  console.log(`AI 단톡방: http://localhost:${PORT}`);
  for (const m of room.views()) {
    console.log(`  ${m.emoji} ${m.name} ${m.rank}·${m.position} (${m.model}) ${m.ready ? '준비됨' : '— API 키 없음'}`);
  }
});
