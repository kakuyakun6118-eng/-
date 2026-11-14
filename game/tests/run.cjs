// すべての動作テストを順に走らせる。使い方:npm run build のあと、npm test
// 各テストの出力は tests/out/ に残る。「errors: []」が出ない・途中で落ちる・時間切れのテストを失敗とする。
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist', 'index.html');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, 'profile'), { recursive: true, force: true });
const only = process.argv[2];
const tests = fs.readdirSync(__dirname).filter((f) => /^\d\d-.*\.cjs$/.test(f) && (!only || f.includes(only))).sort();
// セーブのテストは IndexedDB を使うので、http で開く必要がある
const server = spawn('npx', ['vite', 'preview', '--port', '4179', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
wait(3000);
let failed = 0;
for (const t of tests) {
  const started = Date.now();
  const r = spawnSync('node', [path.join(__dirname, t), dist], { encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const text = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(out, t.replace('.cjs', '.log')), text);
  const ok = r.status === 0 && /errors: \[\]/.test(text) && !/errors: \[\s*['"]/.test(text);
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${t} (${Math.round((Date.now() - started) / 1000)}秒)`);
  if (!ok) console.log(text.split('\n').slice(-12).join('\n'));
}
server.kill();
console.log(failed === 0 ? `すべて通りました(${tests.length}本)` : `${failed}本が失敗しました`);
process.exit(failed === 0 ? 0 : 1);
