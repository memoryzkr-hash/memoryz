import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgents } from './agents.js';
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
  writeFileSync(dataFile, JSON.stringify({ messages: room.messages, settings: room.settings }, null, 2));
};
room = new Room(createAgents({ nameOf: (a) => room.nameOf(a) }), broadcast, save);
if (existsSync(dataFile)) {
  const saved = JSON.parse(readFileSync(dataFile, 'utf8'));
  room.messages = saved.messages ?? [];
  Object.assign(room.settings, saved.settings);
}

const state = () => ({
  messages: room.messages,
  settings: room.settings,
  busy: room.busy,
  members: room.agents.map((a) => ({
    ...a.persona,
    model: a.model,
    ready: a.ready,
    present: room.present.has(a.persona.id),
  })),
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
      const { text } = await body(req);
      if (typeof text !== 'string' || !text.trim()) return json(res, { error: '빈 메시지' }, 400);
      room.post(text.trim());
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
      const { id, present } = await body(req);
      room.setPresent(String(id), Boolean(present));
      return json(res, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const { maxTurns, summarize } = await body(req);
      if (Number.isFinite(maxTurns)) room.settings.maxTurns = Math.max(1, Math.min(30, Math.round(maxTurns)));
      if (typeof summarize === 'boolean') room.settings.summarize = summarize;
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
  for (const a of room.agents) {
    console.log(`  ${a.persona.emoji} ${a.persona.name} (${a.model}) ${a.ready ? '준비됨' : '— API 키 없음'}`);
  }
});
