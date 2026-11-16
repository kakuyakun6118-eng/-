// 人物データの検査:人数、IDの重複、所属、生没年、太守の配置、能力値の範囲、肖像の読み込み口
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..', 'src', 'data');
  const persons = JSON.parse(fs.readFileSync(path.join(root, 'scenarios', 's317.persons.json'), 'utf8')).persons;
  const sc = JSON.parse(fs.readFileSync(path.join(root, 'scenarios', 's317.json'), 'utf8'));
  const problems = [];
  const ids = new Set();
  const factions = new Set(sc.factions.map(f => f.id));
  for (const p of persons) {
    if (ids.has(p.id)) problems.push('IDの重複: ' + p.id);
    ids.add(p.id);
    if (!/^[a-z0-9_]+$/.test(p.id)) problems.push('IDの文字: ' + p.id);
    if (!factions.has(p.factionId)) problems.push('勢力が無い: ' + p.id);
    if (p.died !== null && p.died < sc.year) problems.push(`開始(${sc.year}年)より前に死亡: ${p.name} ${p.died}`);
    if (p.born !== null && p.born > sc.year - 12) problems.push(`開始時に12歳未満: ${p.name} ${p.born}`);
    if (p.born !== null && p.died !== null && p.died - p.born > 100) problems.push('生没年が不自然: ' + p.name);
    for (const k of ['leadership', 'war', 'intelligence', 'politics', 'charisma']) if (!(p[k] >= 1 && p[k] <= 100)) problems.push(`能力値の範囲: ${p.name} ${k}`);
    if (!p.name || !p.reading || !p.bio || !['ruler', 'general', 'strategist', 'minister'].includes(p.role)) problems.push('項目の不足: ' + p.id);
  }
  const names = new Map();
  for (const p of persons) { if (names.has(p.name)) problems.push('名前の重複: ' + p.name); names.set(p.name, p.id); }
  for (const f of sc.factions) if (persons.filter(p => p.factionId === f.id && p.role === 'ruler').length !== 1) problems.push('君主が1人でない: ' + f.name);
  const used = new Set();
  for (const [place, pid] of Object.entries(sc.governors)) {
    const p = persons.find(x => x.id === pid);
    const owner = sc.cityOwners[place] ?? sc.passOwners[place];
    if (!p) problems.push('太守の人物が無い: ' + place);
    else if (p.factionId !== owner) problems.push(`太守の勢力が都市と違う: ${place} ${p.name}`);
    if (used.has(pid)) problems.push('太守の兼任: ' + pid);
    used.add(pid);
  }
  const armies = JSON.parse(fs.readFileSync(path.join(root, 'scenarios', 's317.armies.json'), 'utf8'));
  for (const a of armies) { if (!ids.has(a.commanderId)) problems.push('指揮官の人物が無い: ' + a.id); if (used.has(a.commanderId)) problems.push('指揮官が太守を兼任: ' + a.commanderId); }
  const count = {};
  for (const p of persons) count[p.factionId] = (count[p.factionId] || 0) + 1;
  console.log('人物数:', persons.length, '(注記つき', persons.filter(p => p.note).length, '人)');
  for (const f of sc.factions) console.log(`  ${f.name}: ${count[f.id] || 0}人`);
  if (persons.length < 150) problems.push('150人に足りない: ' + persons.length);

  // 画面:一覧に全員が出るか、注記が出るか、任命とセーブが動くか
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const page = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5 })).newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await page.goto('file://' + process.argv[2]);
  await page.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  const ui = await page.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 0; document.querySelector('#persons-open').click();
    const rows = document.querySelectorAll('.person-row').length; const t0 = performance.now(); const f = document.querySelector('.persons-role'); f.value = 'minister'; f.dispatchEvent(new Event('change')); const ministers = document.querySelectorAll('.person-row').length; f.value = ''; f.dispatchEvent(new Event('change')); const renderMs = Math.round(performance.now() - t0);
    document.querySelector('.person-row[data-id="pu_hong"]').click(); const note = document.querySelector('.person-uncertain').textContent;
    const err = c.appoint('yu_liang', { kind: 'city', id: 'kuaiji' }); const s = JSON.parse(JSON.stringify(g.buildSave())); c.appoint('yu_liang', null); g.applySave(s);
    return { rows, added: c.court.added.length, ministers, renderMs, note, appoint: err, afterLoad: c.postOf('yu_liang')?.label, governors: g.allCities.filter(k => c.postOf && k.governorId).length }; });
  console.log('画面:', JSON.stringify(ui));
  // 317年の一覧:台帳の200人と、名簿で置いた女性(womenRoster)と、名簿にいない幼い子女(石弘など。Version 35)
  const women317 = Object.keys(sc.womenRoster ?? {}).length;
  if (ui.rows !== persons.length + women317 + ui.added) problems.push('一覧の人数が違う: ' + ui.rows);
  if (!ui.note || ui.afterLoad !== '会稽 太守') problems.push('注記または任命の保存が動かない');
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(__dirname, 'out', 'persons.png') });
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
