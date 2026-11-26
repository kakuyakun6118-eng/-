// すべての動作テストを走らせる。使い方:npm run build のあと、npm test
// 各テストの出力は tests/out/ に残る。「errors: []」が出ない・途中で落ちる・時間切れのテストを失敗とする。
// Version 51:時間を縮めるため、テストを同時に何本か走らせる(TEST_JOBS で本数を変えられる。既定は2本)。
// 長いテスト(34 など)を先に始め、短いテストをそのあいだに流す。node tests/run.cjs 35 のように、名前の一部で絞れる。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist', 'index.html');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, 'profile'), { recursive: true, force: true });
const only = process.argv[2];
const tests = fs.readdirSync(__dirname).filter((f) => /^\d\d-.*\.cjs$/.test(f) && (!only || f.includes(only))).sort();
const jobs = Math.max(1, Number(process.env.TEST_JOBS ?? 2));
// 前回の所要時間(長いものから始める)
const timesFile = path.join(out, 'times.json');
let times = {};
try { times = JSON.parse(fs.readFileSync(timesFile, 'utf8')); } catch { times = {}; }
const order = [...tests].sort((a, b) => (times[b] ?? 30) - (times[a] ?? 30));
// セーブのテストは IndexedDB を使うので、http で開く必要がある
const server = spawn('npx', ['vite', 'preview', '--port', '4179', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const started0 = Date.now();
const results = {};

function runOne(t) {
  return new Promise((resolve) => {
    const started = Date.now();
    let text = '';
    const child = spawn('node', [path.join(__dirname, t), dist], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { text += d; });
    child.stderr.on('data', (d) => { text += d; });
    // 時間の上限:ふつうは600秒。長い年月を進めるテストは、ファイルの先頭に「// 時間の上限:1500秒」のように書けば延ばせる(劉裕の北伐の長期テスト)
    const head = fs.readFileSync(path.join(__dirname, t), 'utf8').split('\n').slice(0, 5).join('\n');
    const limit = Number((/時間の上限:(\d+)秒/.exec(head) ?? [])[1] ?? 600);
    const timer = setTimeout(() => { text += `\n(時間切れ:${limit}秒)`; child.kill('SIGKILL'); }, limit * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(out, t.replace('.cjs', '.log')), text);
      const ok = code === 0 && /errors: \[\]/.test(text) && !/errors: \[\s*['"]/.test(text);
      const sec = Math.round((Date.now() - started) / 1000);
      times[t] = sec;
      results[t] = ok;
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${t} (${sec}秒)`);
      if (!ok) console.log(text.split('\n').slice(-12).join('\n'));
      resolve();
    });
  });
}

(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const queue = [...order];
  const workers = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await runOne(queue.shift());
  });
  await Promise.all(workers);
  server.kill();
  fs.writeFileSync(timesFile, JSON.stringify(times, null, 1));
  const failed = tests.filter((t) => !results[t]).length;
  const total = Math.round((Date.now() - started0) / 1000);
  console.log(failed === 0 ? `すべて通りました(${tests.length}本・${Math.floor(total / 60)}分${total % 60}秒・同時に${jobs}本)` : `${failed}本が失敗しました`);
  process.exit(failed === 0 ? 0 : 1);
})();
