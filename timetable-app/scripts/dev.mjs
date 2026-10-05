// AI 서버와 Expo 개발 서버를 함께 켠다. 끝내려면 Ctrl+C.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('.env 파일을 만들었어요. AI 계획 세우기를 쓰려면 .env에 ANTHROPIC_API_KEY를 넣고 다시 켜 주세요.\n');
}

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const server = run(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'server/planner-server.ts']);
const expo = run('npx', ['expo', 'start', ...process.argv.slice(2)]);

const stop = () => {
  server.kill();
  expo.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
expo.on('exit', (code) => {
  server.kill();
  process.exit(code ?? 0);
});
