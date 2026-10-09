/** Updating keys in a .env file without disturbing the rest of it (comments, order, other keys). */

const KEY = /^[A-Z][A-Z0-9_]*$/;

/** Double-quoted so spaces and # survive; Node's loadEnvFile understands \n and \" inside double quotes. */
export function quoteEnv(value: string): string {
  const v = value.replace(/\r?\n/g, ' ').trim();
  return /^[\w@%+=:,./-]*$/.test(v) ? v : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function setEnvValues(text: string, updates: Record<string, string>): string {
  for (const k of Object.keys(updates)) if (!KEY.test(k)) throw new Error(`환경 변수 이름이 올바르지 않아요: ${k}`);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const done = new Set<string>();
  const out = lines.map((line) => {
    const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (!m || !(m[1] in updates)) return line;
    if (done.has(m[1])) return null; // a duplicate further down would win when loading: drop it
    done.add(m[1]);
    return `${m[1]}=${quoteEnv(updates[m[1]])}`;
  });
  const kept = out.filter((l): l is string => l !== null);
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  for (const [k, v] of Object.entries(updates)) if (!done.has(k)) kept.push(`${k}=${quoteEnv(v)}`);
  return `${kept.join('\n')}\n`;
}
