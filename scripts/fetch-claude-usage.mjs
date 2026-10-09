// Fetches Claude usage for every account whose token is in the environment and prints the same
// batch JSON the Mac script copies (tokens never appear in the output).
//   CLAUDE_USAGE_TOKEN_QUATERNARY2026=sk-ant-oat01-…  CLAUDE_USAGE_TOKEN_MEMORYZ_KR=…  node scripts/fetch-claude-usage.mjs
const PREFIX = 'CLAUDE_USAGE_TOKEN_';
const entries = Object.entries(process.env)
  .filter(([k, v]) => k.startsWith(PREFIX) && v)
  .sort(([a], [b]) => a.localeCompare(b));
if (entries.length === 0) {
  console.error(`${PREFIX}<계정이름> 환경 변수가 없어요.`);
  process.exit(1);
}

const explain = (status) =>
  ({ 401: '토큰이 만료됐거나 끊겼어요', 403: '이 토큰으로는 사용량을 볼 수 없어요', 429: '요청이 너무 잦아요' })[status] ?? `응답 코드 ${status}`;

const accounts = [];
for (const [key, token] of entries) {
  const name = key.slice(PREFIX.length).toLowerCase();
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: `Bearer ${token.trim()}`, 'anthropic-beta': 'oauth-2025-04-20', Accept: 'application/json', 'User-Agent': 'claude-usage/1' },
      signal: AbortSignal.timeout(20_000),
    });
    accounts.push(res.ok ? { name, usage: await res.json() } : { name, error: explain(res.status) });
  } catch (e) {
    accounts.push({ name, error: `연결 실패: ${e.message}` });
  }
}
console.log(JSON.stringify({ source: 'claude-usage', version: 1, fetchedAt: new Date().toISOString(), accounts }, null, 2));
