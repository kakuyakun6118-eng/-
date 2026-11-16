// 君主の捕縛・国の滅亡・後継国家の独立・君主の戦死・セーブ・プレイヤーの国の滅亡
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sid) => {
    const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(sid + ' ' + m.text().slice(0, 300)); });
    p.on('pageerror', e => errs.push(sid + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sid);
    await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => { window.__goko.campaign.speed = 0; });
    return p;
  };
  // 会戦の結果を作って渡す(防御側の指揮官の運命を指定)
  const fight = `(attackerArmyId, defenderArmyId, fate) => { const c = window.__goko.campaign; const A = c.stateOf(attackerArmyId).army, D = c.stateOf(defenderArmyId).army;
    const ev = { battleId: 'd_' + Math.random(), battleType: 'field_battle', attackerArmyId, defenderArmyId, defenderCityId: null, location: { lon: D.lon, lat: D.lat, name: 't' }, terrain: 'plain', attackerFactionId: A.factionId, defenderFactionId: D.factionId, status: 'pending', createdAt: { day: 0, text: '' } };
    c.events.push(ev); const t = (x) => ({ infantry: x, cavalry: 0, archer: 0 });
    const side = (armyId, out, fate, n) => ({ armyId, outcome: out, before: t(n), after: t(out === 'victory' ? n : Math.round(n * 0.4)), killed: 0, wounded: 0, captured: 0, scattered: 0, commander: fate, morale: 60, fatigue: 30 });
    c.applyBattleResult({ battleId: ev.battleId, winner: 'attacker', reason: 'routed', durationSeconds: 0, attackerLosses: 0, defenderLosses: 0, sides: { attacker: side(attackerArmyId, 'victory', 'healthy', 20000), defender: side(defenderArmyId, 'routed', fate, 20000) } }); }`;
  const audit = `() => { const g = window.__goko, c = g.campaign; const F = new Map(window.__gokoData.scenario.factions.map(f => [f.id, f])); const out = [];
    for (const k of g.allCities) { const o = window.__gokoData.scenario.cityOwners[k.id]; if (!F.has(o)) out.push('都市の勢力が無い ' + k.id); else if (F.get(o).fallen) out.push('滅んだ国の都市 ' + k.id); }
    for (const s of c.armies) { if (!F.has(s.army.factionId) || F.get(s.army.factionId).fallen) out.push('滅んだ国の軍団 ' + s.army.id); }
    for (const f of F.values()) { if (f.passive || f.fallen) continue; const has = g.allCities.some(k => window.__gokoData.scenario.cityOwners[k.id] === f.id) || c.armies.some(s => s.army.factionId === f.id); if (!has) continue;
      const r = window.__gokoData.persons.filter(p => p.factionId === f.id && p.role === 'ruler' && ['active', 'wounded'].includes(c.personStatus(p.id)) && !c.spoils.custodyOf(p.id)); if (r.length !== 1) out.push('君主が' + r.length + '人 ' + f.name + ' ' + r.map(x => x.name)); }
    const ids = new Set(); for (const x of c.spoils.custody) { if (ids.has(x.personId)) out.push('捕虜の重複 ' + x.personId); ids.add(x.personId); }
    for (const p of window.__gokoData.persons) { if (c.spoils.custodyOf(p.id) && c.personStatus(p.id) === 'active') out.push('捕虜なのに健在 ' + p.id); if (F.get(p.factionId)?.fallen && c.personStatus(p.id) === 'active' && !c.spoils.custodyOf(p.id) && p.id !== F.get(p.factionId).rulerId) out.push('滅んだ国に残った人物 ' + p.name); }
    return out; }`;

  // 1) 383年:淝水。苻堅が会戦で捕らえられる → 前秦は滅び、慕容垂・姚萇などが独立する
  let p = await open('s383');
  const r1 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'jin' });
    const before = window.__gokoData.scenario.factions.length; const gold = c.factionStates.qianqin.gold;
    (${fight})('army_xie_xuan', 'army_fu_jian', 'captured');
    const F = window.__gokoData.scenario.factions; const added = F.slice(before).map(f => ({ id: f.id, name: f.name, title: f.title, ruler: f.ruler, cities: g.allCities.filter(k => window.__gokoData.scenario.cityOwners[k.id] === f.id).length, armies: c.armies.filter(s => s.army.factionId === f.id).map(s => s.army.name).join('・'), gold: Math.round(c.factionStates[f.id]?.gold ?? 0) }));
    return { fallen: !!F.find(f => f.id === 'qianqin').fallen, fuJian: c.personStatus('fu_jian') + '@' + c.spoils.custodyOf('fu_jian')?.holder, added, gold, jinCities: g.allCities.filter(k => window.__gokoData.scenario.cityOwners[k.id] === 'jin').length, news: c.news.slice(-1)[0]?.text, audit: (${audit})() }; })()`);
  console.log('383年 苻堅の捕縛:', JSON.stringify(r1, null, 1));
  if (!r1.fallen || r1.added.length < 1 || r1.audit.length) problems.push('383年の滅亡と独立: ' + JSON.stringify(r1.audit));
  if (!r1.added.some(f => f.name.includes('後燕') || f.name.includes('後秦'))) problems.push('史実の独立者(慕容垂・姚萇)が独立していない');
  // セーブ→ロードで、後継国家と君主が戻る。前のセーブを読むと、後継国家は消える
  const r1b = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign; const s = JSON.parse(JSON.stringify(g.buildSave())); const n = window.__gokoData.scenario.factions.length;
    const snap = () => JSON.stringify([window.__gokoData.scenario.factions.map(f => f.id + ':' + f.ruler + ':' + !!f.fallen), window.__gokoData.persons.filter(p => p.role === 'ruler').map(p => p.id + ':' + p.factionId).sort(), Object.values(window.__gokoData.scenario.cityOwners).sort().join()]);
    const a = snap(); g.applySave(s); const b2 = snap(); return { same: a === b2, factions: n, after: window.__gokoData.scenario.factions.length, audit: (${audit})() }; })()`);
  console.log('セーブとロード:', JSON.stringify(r1b));
  if (!r1b.same || r1b.audit.length) problems.push('セーブとロードで戻らない');
  await p.screenshot({ path: path.join(__dirname, 'out', 'dynasty-383.png') });
  await p.close();

  // 2) 317年:石勒が会戦で討たれる → 国はそのままで、世子の石弘(史実の後継者)が君主になる(Version 35から)
  p = await open('s317');
  const r2 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'jin' }); const a = c.stateOf('army_shi_hu').army; a.commanderId = 'shi_le';
    (${fight})('army_zu_ti', 'army_shi_hu', 'killed'); const F = window.__gokoData.scenario.factions.find(f => f.id === 'shile');
    return { fallen: !!F.fallen, ruler: F.ruler, shiHuRole: window.__gokoData.persons.find(x => x.id === 'shi_hu').role, hongRole: window.__gokoData.persons.find(x => x.id === 'shi_hong').role, audit: (${audit})() }; })()`);
  console.log('317年 石勒の戦死:', JSON.stringify(r2));
  if (r2.fallen || r2.ruler !== '石弘' || r2.hongRole !== 'ruler' || r2.audit.length) problems.push('君主の戦死と後継');
  await p.close();

  // 3) プレイヤーの国が滅びる:ゲームオーバー / 後継国家で続ける
  for (const mode of ['gameover', 'continue']) {
    p = await open('s383');
    const r3 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'qianqin', onFall: '${mode}' });
      (${fight})('army_xie_xuan', 'army_fu_jian', 'captured');
      c.speed = 4; const d0 = c.day; c.update(0.25);
      return { overlay: !document.querySelector('#gameover').hidden, gameOver: c.gameOver, player: g.playerFactionId, timeMoved: c.day > d0, notice: document.querySelector('#event-text').textContent.slice(0, 60) }; })()`);
    console.log('プレイヤーの国の滅亡(' + mode + '):', JSON.stringify(r3));
    if (mode === 'gameover' && (!r3.overlay || !r3.gameOver || r3.timeMoved)) problems.push('ゲームオーバーにならない');
    if (mode === 'continue' && (r3.overlay || r3.gameOver || r3.player === 'qianqin')) problems.push('後継国家で続けられない');
    if (mode === 'gameover') { await p.waitForTimeout(300); await p.screenshot({ path: path.join(__dirname, 'out', 'gameover.png') }); }
    await p.close();
  }

  // 4) 都市の陥落で君主が捕らえられる(317年:平陽の劉聡)。独立できる者がいなければ、都市は捕らえた勢力へ
  p = await open('s317');
  const r4 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'cui_bi' }); const city = g.allCities.find(k => k.id === 'pingyang'); const A = c.stateOf('army_shi_hu').army;
    const ev = { battleId: 'cap_py', battleType: 'siege_battle', attackerArmyId: 'army_shi_hu', defenderArmyId: null, defenderCityId: 'pingyang', location: { lon: city.lon, lat: city.lat, name: city.name }, terrain: 'plain', attackerFactionId: 'shile', defenderFactionId: 'han_zhao', status: 'pending', createdAt: { day: 0, text: '' } };
    c.events.push(ev); const t = (x) => ({ infantry: x, cavalry: 0, archer: 0 });
    c.applyBattleResult({ battleId: 'cap_py', winner: 'attacker', reason: 'captured', durationSeconds: 0, attackerLosses: 0, defenderLosses: 0, siege: { cityId: 'pingyang', captured: true, days: 10, wallDamage: 0.2, gateDamage: 0.3, foodLeft: 5 }, sides: { attacker: { armyId: 'army_shi_hu', outcome: 'victory', before: t(9000), after: t(9000), killed: 0, wounded: 0, captured: 0, scattered: 0, commander: 'healthy', morale: 70, fatigue: 20 }, defender: { armyId: null, outcome: 'routed', before: t(5000), after: t(0), killed: 0, wounded: 0, captured: 0, scattered: 0, commander: 'captured', morale: 20, fatigue: 0 } } });
    const F = window.__gokoData.scenario.factions; return { liuCong: c.personStatus('liu_cong'), fallen: !!F.find(f => f.id === 'han_zhao').fallen, added: F.filter(f => f.founded).map(f => f.name + '/' + f.ruler + '/' + f.title), news: c.news.slice(-1)[0]?.text, audit: (${audit})() }; })()`);
  console.log('317年 平陽の陥落:', JSON.stringify(r4, null, 1));
  if (r4.liuCong !== 'captured' || !r4.fallen || r4.audit.length) problems.push('陥落による君主の捕縛');
  await p.close();
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
