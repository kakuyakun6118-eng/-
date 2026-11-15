// シナリオの検査:目録の8本、収録済みシナリオのデータの整合、各シナリオの起動・進行・セーブ、選択画面
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'src', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
(async () => {
  const problems = [];
  const catalog = read('scenarios/catalog.json').scenarios;
  if (catalog.length !== 8) problems.push('目録が8本でない');
  const ledger = new Map();
  for (const p of [...read('scenarios/s317.persons.json').persons, ...read('scenarios/persons.extra.json').persons]) { if (ledger.has(p.id)) problems.push('台帳のID重複: ' + p.id); ledger.set(p.id, p); }
  const cities = read('regions/north-china/cities.json'); const passes = read('regions/north-china/passes.json').passes;
  const cityIds = new Set(cities.map(c => c.id)); const passIds = new Set(passes.map(p => p.id));
  const ready = catalog.filter(e => e.status === 'ready');
  for (const e of ready) {
    const file = path.join(root, 'scenarios', e.id + '.json');
    if (!fs.existsSync(file)) { problems.push('ready なのにファイルが無い: ' + e.id); continue; }
    const s = read('scenarios/' + e.id + '.json'); const tag = `[${e.year}年] `;
    if (s.year !== e.year) problems.push(tag + '年が目録と違う');
    const factions = new Map(s.factions.map(f => [f.id, f]));
    const owners = {}; for (const c of cities) owners[c.id] = s.cityOwners[c.id] ?? s.defaultOwner;
    for (const p of passes) owners[p.id] = s.passOwners?.[p.id] ?? owners[p.between[0]];
    for (const [id, f] of Object.entries(s.cityOwners)) { if (!cityIds.has(id)) problems.push(tag + '都市が無い: ' + id); if (!factions.has(f)) problems.push(tag + '勢力が無い: ' + f); }
    for (const id of Object.keys(owners)) if (!factions.has(owners[id])) problems.push(tag + '所属の無い拠点: ' + id);
    for (const f of s.factions) if (!Object.values(owners).includes(f.id)) problems.push(tag + '拠点を持たない勢力: ' + f.name);
    for (const id of s.uncertainOwners ?? []) if (!cityIds.has(id) && !passIds.has(id)) problems.push(tag + '推定の印の対象が無い: ' + id);
    // 人物
    const entries = { ...(s.roster ?? {}), ...(s.womenRoster ?? {}) };
    const roster = [...(s.roster ? [] : read('scenarios/s317.persons.json').persons.map(p => ({ ...p, known: true }))),
      ...Object.entries(entries).map(([id, r]) => ({ id, ...ledger.get(id), factionId: r.factionId, role: r.role ?? ledger.get(id)?.role, known: ledger.has(id), cityId: r.cityId }))];
    for (const p of roster) if (p.cityId && owners[p.cityId] !== p.factionId) problems.push(`${tag}滞在の都市が、その人の勢力のものでない: ${p.name} ${p.cityId}`);
    for (const p of roster) {
      if (!p.known) { problems.push(tag + '台帳に無い人物: ' + p.id); continue; }
      if (!factions.has(p.factionId)) problems.push(tag + '人物の勢力が無い: ' + p.id);
      if (p.died !== null && p.died < s.year) problems.push(`${tag}開始より前に死亡: ${p.name} ${p.died}`);
      // 12歳未満は登場させない。ただし君主は、幼くても勢力が成り立つように例外とする(注記を付ける)
      if (p.born !== null && p.born > s.year - 12 && !(p.role === 'ruler' && (s.roster?.[p.id]?.note || p.note))) problems.push(`${tag}12歳未満: ${p.name} ${p.born}`);
    }
    for (const f of s.factions) { const n = roster.filter(p => p.factionId === f.id && p.role === 'ruler').length; if (n !== (f.passive ? 0 : 1)) problems.push(`${tag}君主が${n}人: ${f.name}`); }
    const byId = new Map(roster.map(p => [p.id, p])); const used = new Set();
    for (const [place, pid] of Object.entries(s.governors ?? {})) { const p = byId.get(pid);
      if (!p) problems.push(tag + '太守が名簿に無い: ' + place + ' ' + pid); else if (p.factionId !== owners[place]) problems.push(`${tag}太守の勢力が都市と違う: ${place} ${p.name}`);
      if (used.has(pid)) problems.push(tag + '太守の兼任: ' + pid); used.add(pid); }
    const armies = s.armies ?? read('scenarios/' + e.id + '.armies.json');
    for (const a of armies) { const p = byId.get(a.commanderId); if (!p) problems.push(tag + '指揮官が名簿に無い: ' + a.id); else if (p.factionId !== a.factionId) problems.push(tag + '指揮官の勢力が違う: ' + a.id); if (used.has(a.commanderId)) problems.push(tag + '指揮官が太守を兼任: ' + a.commanderId); if (!factions.has(a.factionId)) problems.push(tag + '軍団の勢力が無い: ' + a.id); }
    for (const k of Object.keys(s.relations ?? {})) for (const f of k.split('|')) if (!factions.has(f)) problems.push(tag + '外交の勢力が無い: ' + k);
    const count = {}; for (const p of roster) count[p.factionId] = (count[p.factionId] || 0) + 1;
    console.log(`${e.year}年 ${e.title}: 勢力${s.factions.length} 人物${roster.length}(女性${roster.filter(p => p.gender === 'female').length}) 軍団${armies.length} | ` + s.factions.map(f => `${f.name}${count[f.id] || 0}`).join(' '));
  }
  if (problems.length) { console.log('データの問題:', problems); process.exit(1); }

  // 画面と進行
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const saves = {};
  for (const e of ready) {
    const page = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5 })).newPage();
    page.on('console', m => { if (m.type() === 'error') errs.push(e.id + ' ' + m.text().slice(0, 300)); });
    page.on('pageerror', x => errs.push(e.id + ' ' + String(x).slice(0, 300)));
    await page.goto('file://' + process.argv[2] + '#s=' + e.id);
    await page.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    const r = await page.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 0;
      const first = { title: document.querySelector('.scenario').textContent, date: c.dateText(), persons: document.querySelectorAll('.person-row').length, armies: c.armies.length, markers: g.armies.markers.length,
        noOwner: g.allCities.filter(k => !g.territory.factionAt(k.lon, k.lat)).map(k => k.name), names: ['jiankang', 'pyongyang', 'guanggu'].map(id => g.allCities.find(k => k.id === id).name).join('/') };
      document.querySelector('#persons-open').click(); first.persons = document.querySelectorAll('.person-row').length; document.querySelector('.persons-close').click();
      const player = [...new Set(g.allCities.map(k => g.territory.factionAt(k.lon, k.lat)))].pop(); g.changeSettings({ playerFactionId: player, difficulty: 'hard' });
      const start = c.day; let n = 0; while (c.day - start < 720 && n++ < 200000) { if (c.speed === 0) { const ev = c.events.find(x => x.status === 'pending'); if (ev) c.setEventStatus(ev.battleId, 'cancelled'); c.speed = 8; } c.update(0.25); }
      const save = g.buildSave(); const text = JSON.stringify(save); g.applySave(JSON.parse(text));
      return { ...first, after2years: c.dateText(), battles: c.events.filter(x => x.status === 'completed').length, armiesAfter: c.armies.length, saveScenario: save.scenarioId, saveKB: Math.round(text.length / 1024), save: text }; });
    saves[e.id] = r.save; delete r.save;
    console.log(e.id, JSON.stringify(r));
    if (r.noOwner.length) problems.push(e.id + ' 領土の無い拠点: ' + r.noOwner);
    if (r.saveScenario !== e.id) problems.push(e.id + ' セーブのシナリオIDが違う');
    if (!r.title.includes(String(e.year))) problems.push(e.id + ' 画面の年が違う: ' + r.title);
    if (e.id === ready[0].id) { await page.evaluate(() => document.querySelector('#scenarios-open').click()); await page.waitForTimeout(400); await page.screenshot({ path: path.join(__dirname, 'out', 'scenarios.png') });
      const cards = await page.evaluate(() => [...document.querySelectorAll('.scenario-card')].map(c => ({ id: c.dataset.id, status: c.dataset.status, button: c.querySelector('button').textContent, disabled: c.querySelector('button').disabled })));
      console.log('選択画面:', JSON.stringify(cards));
      for (const c of cards) { const entry = catalog.find(x => x.id === c.id); if (entry.status === 'planned' && (!c.disabled || !c.button.includes('準備中'))) problems.push('準備中のシナリオが選べてしまう: ' + c.id); if (entry.status === 'ready' && c.status !== 'current' && c.disabled) problems.push('完成済みのシナリオが選べない: ' + c.id); }
      // 準備中のシナリオをアドレスで指定しても、始まらないこと
    }
    await page.close();
  }
  // 別のシナリオのセーブは読み込めない / 準備中のシナリオは始まらない
  const page = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  // 目録に無いシナリオや、準備中のシナリオをアドレスで指定しても、317年が始まること
  const planned = catalog.find(x => x.status === 'planned');
  await page.goto('file://' + process.argv[2] + '#s=' + (planned ? planned.id : 's999'));
  await page.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  const guard = await page.evaluate((other) => { const g = window.__goko; let msg = ''; try { g.applySave(JSON.parse(other)); } catch (x) { msg = String(x.message); } return { title: document.querySelector('.scenario').textContent, crossLoad: msg.slice(0, 60) }; }, saves[ready[0].id]);
  console.log('ガード:', JSON.stringify(guard));
  if (!guard.title.includes('317')) problems.push('存在しない・準備中のシナリオが始まってしまった');
  if (ready.length !== 8) problems.push('遊べるシナリオが8本でない: ' + ready.length);
  if (!guard.crossLoad.includes('別のシナリオ')) problems.push('別のシナリオのセーブを断らなかった');
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
