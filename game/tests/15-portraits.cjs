// 肖像の検査:制作用の一覧が全人物を網羅しているか、置いてある画像に問題がないか、各画面に肖像の枠が出るか。
// (画像が足りないことは失敗にしない。全員ぶんそろったかは、python3 tools/portraits_check.py --strict で調べる)
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..'); const problems = [];
  spawnSync('python3', [path.join(root, 'tools', 'face_design.py')], { encoding: 'utf8' });
  const sheet = spawnSync('python3', [path.join(root, 'tools', 'portrait_sheet.py')], { encoding: 'utf8' });
  console.log(sheet.stdout.trim());
  const need = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'portraits', 'prompts.json'), 'utf8')).prompts;
  const ledger = [...JSON.parse(fs.readFileSync(path.join(root, 'src/data/scenarios/s317.persons.json'), 'utf8')).persons, ...JSON.parse(fs.readFileSync(path.join(root, 'src/data/scenarios/persons.extra.json'), 'utf8')).persons];
  for (const p of ledger) { if (!need[p.id + '.webp']) problems.push('制作の一覧に無い人物: ' + p.id); if (!p.people) problems.push('民族が入っていない: ' + p.id); }
  // 顔の設計データ:全員ぶんあり、どの2人も十分に違う
  const faces = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'portraits', 'faces.json'), 'utf8'));
  for (const p of ledger) if (!faces.faces[p.id]) problems.push('顔の設計が無い: ' + p.id);
  if (faces.min_distance < 6) problems.push('顔の設計が似すぎている組がある: ' + faces.min_distance);
  console.log('顔の設計:', faces.count, '人、どの2人でも違う項目の最小数', faces.min_distance);
  const texts = new Set(Object.values(need).map(x => x.person + x.face_fiction)); if (texts.size !== Object.keys(need).length) problems.push('同じ内容の制作指示がある');
  const check = spawnSync('python3', [path.join(root, 'tools', 'portraits_check.py')], { encoding: 'utf8' });
  console.log(check.stdout.trim()); if (check.status !== 0) problems.push('置いてある肖像に問題がある');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/data/portraits.manifest.json'), 'utf8')).files;
  const onDisk = fs.readdirSync(path.join(root, 'public', 'portraits')).filter(f => /\.(webp|png|jpe?g)$/i.test(f));
  if (manifest.length !== onDisk.length) problems.push(`画像の一覧(${manifest.length})と実際の画像(${onDisk.length})が合わない。npm run build をやり直す`);

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  const r = await p.evaluate(async () => { const g = window.__goko, c = g.campaign; c.speed = 0; const out = {};
    document.querySelector('#persons-open').click(); out.listFaces = document.querySelectorAll('.person-row img').length; out.rows = document.querySelectorAll('.person-row').length; out.detailFace = !!document.querySelector('.person-portrait').src; out.people = document.querySelector('.person-line').textContent; document.querySelector('.persons-close').click();
    document.querySelector('#diplomacy-open').click(); out.rulerFaces = document.querySelectorAll('.diplomacy-face').length; out.factions = document.querySelectorAll('.diplomacy-row').length; document.querySelector('.diplomacy-close').click();
    const a = c.stateOf('army_liu_yao').army, y = c.stateOf('army_zu_ti').army; a.lon = 115.5; a.lat = 34.0;
    const ev = { battleId: 'pt', battleType: 'field_battle', attackerArmyId: 'army_liu_yao', defenderArmyId: 'army_zu_ti', defenderCityId: null, location: { lon: 115.55, lat: 34.0, name: 't' }, terrain: 'plain', attackerFactionId: a.factionId, defenderFactionId: y.factionId, status: 'pending', createdAt: { day: 0, text: '' } };
    c.events.push(ev); g.noticeBattleId = ev.battleId; document.querySelector('#event-open').hidden = false; document.querySelector('#event-open').click(); await new Promise(res => setTimeout(res, 600));
    out.prepFaces = document.querySelectorAll('.battle-face').length; out.prepText = [...document.querySelectorAll('.battle-commander')].map(x => x.textContent).join(' / ');
    return out; });
  console.log('画面:', JSON.stringify(r));
  // 置いてある肖像が、どのシナリオでも本物の画像として出ること(ページに埋め込まれていること)。年齢差分は、その年以降で使われること
  const have = new Set(onDisk.map(f => f.replace(/\.[a-z]+$/i, '')));
  for (const sid of ['s300', 's317', 's329', 's357']) {
    const q = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
    await q.goto('file://' + process.argv[2] + '#s=' + sid); await q.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    const v = await q.evaluate(async () => { document.querySelector('#persons-open').click(); const imgs = [...document.querySelectorAll('.person-row img')]; await Promise.all(imgs.map(i => i.decode().catch(() => null)));
      return { year: Number(document.querySelector('.scenario').textContent.match(/\d+/)[0]), rows: imgs.map(i => ({ id: i.closest('.person-row').dataset.id, real: i.dataset.real === 'true', data: i.src.startsWith('data:image/'), w: i.naturalWidth, src: i.src.slice(-40) })) }; });
    const expect = v.rows.filter(x => have.has(x.id)).length;
    const shown = v.rows.filter(x => x.real && x.data && x.w === 256).length;
    console.log(`  ${sid}: 肖像あり ${shown}人 / 置いてある人 ${expect}人`);
    if (shown !== expect) problems.push(`${sid}: 置いてある肖像が出ない人がいる`);
    await q.close();
  }
  await p.screenshot({ path: path.join(__dirname, 'out', 'portraits-prep.png') });
  if (r.listFaces !== r.rows || !r.detailFace || r.rulerFaces !== r.factions || r.prepFaces !== 2) problems.push('肖像の枠が出ていない画面がある');
  await b.close();
  if (problems.length) { console.log('問題:', problems.slice(0, 20)); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
