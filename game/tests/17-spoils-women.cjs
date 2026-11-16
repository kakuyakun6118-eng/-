// 女性の人物、名品、都市が落ちたときの戦利品(捕虜・保護・略奪と保全)、セーブ、AIの攻略、全シナリオ
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sid, w = 844, h = 390) => {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(sid + ' ' + m.text().slice(0, 300)); });
    p.on('pageerror', e => errs.push(sid + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sid);
    await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => { window.__goko.campaign.speed = 0; });
    return p;
  };
  // 包囲して落とす(会戦の計算を省き、落城の結果だけを作って渡す)
  const conquer = `(cityId, attackerArmyId) => { const g = window.__goko, c = g.campaign; const city = g.allCities.find(k => k.id === cityId); const a = c.stateOf(attackerArmyId).army;
    const ev = { battleId: 'cap_' + cityId + '_' + Math.random(), battleType: 'siege_battle', attackerArmyId, defenderArmyId: null, defenderCityId: cityId, location: { lon: city.lon, lat: city.lat, name: city.name }, terrain: 'plain', attackerFactionId: a.factionId, defenderFactionId: window.__goko.territory.factionAt(city.lon, city.lat), status: 'pending', createdAt: { day: Math.floor(c.day), text: '' } };
    c.events.push(ev); const t = (x) => ({ infantry: x, cavalry: 0, archer: 0 });
    const side = (armyId, out) => ({ armyId, outcome: out, before: t(1000), after: t(out === 'victory' ? 900 : 0), killed: 0, wounded: 0, captured: 0, scattered: 0, commander: out === 'victory' ? 'healthy' : 'captured', morale: 70, fatigue: 30 });
    c.applyBattleResult({ battleId: ev.battleId, winner: 'attacker', reason: 'captured', durationSeconds: 0, attackerLosses: 100, defenderLosses: 1000, siege: { cityId, captured: true, days: 10, wallDamage: 0.2, gateDamage: 0.4, foodLeft: 10 }, sides: { attacker: side(attackerArmyId, 'victory'), defender: side(null, 'routed') } });
    return ev.battleId; }`;

  // 1) 女性の人物:一覧に出る・肖像の枠がある・都市の情報に出る
  let p = await open('s319');
  const w = await p.evaluate(() => { const g = window.__goko; document.querySelector('#persons-open').click(); const f = document.querySelector('.persons-role'); f.value = 'female'; f.dispatchEvent(new Event('change'));
    const rows = [...document.querySelectorAll('.person-row')]; rows[0].click(); const out = { women: rows.length, faces: rows.filter(r => r.querySelector('img').src).length, detail: document.querySelector('.person-bio').textContent.slice(0, 40) };
    document.querySelector('.persons-close').click(); g.selectCity(g.cities.markers.find(m => m.city.id === 'changan')); out.cityResidents = [...document.querySelectorAll('.info-resident')].map(x => x.textContent).join(' / '); return out; });
  console.log('女性(319年):', JSON.stringify(w));
  if (w.women < 5 || w.faces !== w.women || !w.detail.includes('女性') || !w.cityResidents.includes('羊献容')) problems.push('女性の人物の表示: ' + JSON.stringify(w));

  // 2) プレイヤーが長安を落とす → 処置の画面 → 略奪。羊献容は保護、劉雅(守将)は捕虜、名品は接収
  const r = await p.evaluate(`(async () => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'shile' });
    const before = { prosperity: c.cityState(g.allCities.find(k => k.id === 'changan')).prosperity ?? 100, gold: c.factionStates.shile.gold, items: c.spoils.inCity('changan').map(t => t.id) };
    (${conquer})('changan', 'army_shi_hu');
    const shown = !document.querySelector('#capture').hidden; const people = document.querySelector('.capture-people').textContent; const items = document.querySelector('.capture-items').textContent;
    document.querySelector('.capture-loot').click();
    const st = c.cityStates.changan; const after = { prosperity: st.prosperity, order: st.order, gold: c.factionStates.shile.gold, collection: c.spoils.collectionOf('shile').map(t => t.id), custody: c.spoils.custody.map(x => x.personId + ':' + x.kind), statusYang: c.personStatus('yang_xianrong') };
    return { before, shown, people, items, after, record: c.spoils.records.at(-1) }; })()`);
  console.log('長安を落として略奪:', JSON.stringify(r).slice(0, 900));
  if (!r.shown || !r.people.includes('羊献容') || r.after.statusYang !== 'protected' || !r.after.custody.some(x => x.startsWith('yang_xianrong:protected'))) problems.push('保護の処理');
  if (!(r.after.prosperity < r.before.prosperity - 20) || !(r.after.gold > r.before.gold)) problems.push('略奪で都市が荒れない、または金が増えない');
  if (r.after.collection.length === 0) problems.push('名品を得ていない');

  // 3) 保護・捕虜の処置:帰還/登用/身代金/宮廷に迎える。セーブ→ロードで保たれる
  const acts = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const out = {};
    document.querySelector('#spoils-open').click(); document.querySelector('.spoils-tab[data-tab="people"]').click();
    out.peopleRows = document.querySelectorAll('.spoils-person').length; out.buttons = [...document.querySelectorAll('.spoils-person .spoils-acts button')].map(x => x.textContent).slice(0, 8).join(',');
    const s = JSON.parse(JSON.stringify(g.buildSave())); out.savedCustody = s.campaign.spoils.custody.length; out.savedRecords = s.campaign.spoils.records.length;
    out.court = c.custodyAction('yang_xianrong', 'court'); out.again = c.custodyAction('yang_xianrong', 'court');
    g.applySave(s); out.afterLoad = { custody: c.spoils.custody.length, yang: c.personStatus('yang_xianrong'), prosperity: Math.round(c.cityStates.changan.prosperity), collection: c.spoils.collectionOf('shile').length, records: c.spoils.records.length };
    out.ret = c.custodyAction('yang_xianrong', 'return'); out.yangFaction = window.__goko.campaign.spoils.custodyOf('yang_xianrong') ? 'still' : (c.personStatus('yang_xianrong') + ':' + (window.__goko.allCities && 'ok'));
    return out; });
  console.log('処置とセーブ:', JSON.stringify(acts));
  if (acts.peopleRows < 1 || !acts.buttons.includes('旧勢力へ帰す') || acts.afterLoad.custody !== acts.savedCustody || acts.afterLoad.yang !== 'protected' || !acts.again.includes('最近')) problems.push('処置またはセーブ: ' + JSON.stringify(acts));

  // 4) 名品の装備:指揮官の能力が上がり、会戦の計算に入る。外すと戻る。保存される
  const eq = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const sp = c.spoils; const t = sp.treasures.find(x => x.equip && x.effects.war);
    if (sp.state[t.id].cityId) sp.state[t.id].cityId = null; sp.state[t.id].owner = 'shile';
    const before = g.battlePrepSetupForTest ? null : null; const cmd = () => { const ev = { battleId: 'eqt', battleType: 'field_battle', attackerArmyId: 'army_shi_hu', defenderArmyId: 'army_zu_ti', defenderCityId: null, location: { lon: 115, lat: 34, name: 't' }, terrain: 'plain', attackerFactionId: 'shile', defenderFactionId: 'jin', status: 'pending', createdAt: { day: 0, text: '' } };
      return window.__goko.createSetupForTest ? null : ev; };
    const err = sp.equip(t.id, 'shi_hu'); const s = JSON.parse(JSON.stringify(g.buildSave()));
    const boosted = sp.boosted(window.__goko.campaign.cities && { id: 'shi_hu', leadership: 80, war: 94, intelligence: 58, politics: 30, charisma: 40 });
    sp.equip(t.id, null); const off = sp.equippedBy('shi_hu').length; g.applySave(s);
    return { item: t.name, effects: t.effects, err, war: boosted.war, off, afterLoad: sp.equippedBy('shi_hu').map(x => x.name) }; });
  // 会戦の計算に入るか:会戦準備の指揮官の武力を見る
  const prepWar = await p.evaluate(async () => { const g = window.__goko, c = g.campaign; const a = c.stateOf('army_shi_hu').army; const y = c.stateOf('army_zu_ti').army; a.lon = y.lon + 0.2; a.lat = y.lat;
    const ev = { battleId: 'eqt', battleType: 'field_battle', attackerArmyId: 'army_shi_hu', defenderArmyId: 'army_zu_ti', defenderCityId: null, location: { lon: y.lon, lat: y.lat, name: 't' }, terrain: 'plain', attackerFactionId: 'shile', defenderFactionId: 'jin', status: 'pending', createdAt: { day: 0, text: '' } };
    c.events.push(ev); g.noticeBattleId = 'eqt'; g.showBattleEvent(ev); document.querySelector('#event-open').click(); await new Promise(r => setTimeout(r, 400));
    const war = g.battlePrep.setup?.attacker.commander?.war; document.querySelector('.battle-back').click(); c.setEventStatus('eqt', 'cancelled'); return war; });
  eq.prepWar = prepWar;
  console.log('装備:', JSON.stringify(eq));
  if (eq.err || eq.off !== 0 || eq.afterLoad[0] !== eq.item || !(eq.war > 94) || eq.prepWar !== eq.war) problems.push('装備: ' + JSON.stringify(eq));
  await p.evaluate(() => { document.querySelector('#spoils-open').click(); document.querySelector('.spoils-tab[data-tab="items"]').click(); });
  await p.waitForTimeout(300); await p.screenshot({ path: path.join(__dirname, 'out', 'spoils-items.png') });
  await p.close();

  // 5) 保全:都市はあまり荒れず、接収は希少以上の品だけ
  p = await open('s317');
  const pres = await p.evaluate(`(async () => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'han_zhao' });
    const items = c.spoils.inCity('luoyang').map(t => t.name + ':' + t.rarity);
    (${conquer})('luoyang', 'army_liu_yao'); const dialog = !document.querySelector('#capture').hidden;
    (${conquer}); c.resolveCapture('preserve', true); document.querySelector('#capture').hidden = true; const st = c.cityStates.luoyang;
    return { dialog, items, prosperity: st.prosperity, left: c.spoils.inCity('luoyang').map(t => t.name + ':' + t.rarity), taken: c.spoils.records.at(-1)?.treasures.length }; })()`);
  console.log('洛陽を保全(317年):', JSON.stringify(pres));
  if (!(pres.prosperity >= 90)) problems.push('保全で都市が荒れすぎる');
  if (pres.left.some(x => Number(x.split(':')[1]) >= 3)) problems.push('保全で希少以上の名品が残った');
  await p.close();

  // 6) AIの攻略:時間を止めずに、処置まで自動で行う。陥落ごとに名品の行き先が変わる
  p = await open('s317');
  const ai = await p.evaluate(`(async () => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'cui_bi' });
    (${conquer})('ye', 'army_liu_yao'); const pending = !!c.spoils.pending; const dialog = !document.querySelector('#capture').hidden;
    return { pending, dialog, record: c.spoils.records.at(-1), speed: c.speed, tao: c.personStatus('tao_bao'), custody: c.spoils.custody.map(x => x.personId + '@' + x.holder) }; })()`);
  console.log('AIの攻略(鄴):', JSON.stringify(ai).slice(0, 500));
  if (ai.pending || ai.dialog || !ai.record || ai.record.captor !== 'han_zhao') problems.push('AIの攻略の処理');

  // 7) 都市ごとに名品が違う・8シナリオすべてに名品と女性がいる
  const per = {};
  for (const sid of ['s300', 's304', 's311', 's317', 's319', 's329', 's357', 's383']) {
    const q = await open(sid);
    per[sid] = await q.evaluate(() => { const g = window.__goko, sp = g.campaign.spoils; const byCity = {}; for (const t of sp.treasures) { const cId = sp.state[t.id].cityId; (byCity[cId] ||= []).push(t.id); }
      const sets = Object.values(byCity).map(x => x.sort().join(',')); return { items: sp.treasures.length, cities: Object.keys(byCity).length, distinct: new Set(sets).size === sets.length, national: sp.treasures.filter(t => t.rarity >= 5).map(t => t.name).join('・'), women: window.__goko.campaign && document.querySelectorAll('.person-row').length >= 0 ? (() => { document.querySelector('#persons-open').click(); const f = document.querySelector('.persons-role'); f.value = 'female'; f.dispatchEvent(new Event('change')); return document.querySelectorAll('.person-row').length; })() : 0 }; });
    await q.close();
  }
  console.log('シナリオごと:', JSON.stringify(per));
  for (const [sid, v] of Object.entries(per)) if (!v.items || !v.distinct || !v.women) problems.push('シナリオ ' + sid + ': ' + JSON.stringify(v));

  // 8) iPhone横向きで、新しい画面がはみ出さない
  p = await open('s319', 844, 390);
  const fit = await p.evaluate(`(async () => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'shile' }); (${conquer})('changan', 'army_shi_hu');
    const box = (sel) => { const r = document.querySelector(sel + ' > div').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
    const cap = box('#capture'); document.querySelector('.capture-preserve').click(); document.querySelector('#spoils-open').click(); const sp = box('#spoils');
    const small = [...document.querySelectorAll('#spoils button, #capture button')].filter(x => x.offsetParent && x.getBoundingClientRect().height < 27).length; return { cap, sp, w: innerWidth, h: innerHeight, small }; })()`);
  console.log('横向きの大きさ:', JSON.stringify(fit));
  for (const k of ['cap', 'sp']) { const [l, t, rr, bb] = fit[k]; if (l < 0 || t < 0 || rr > fit.w || bb > fit.h) problems.push('はみ出し: ' + k); }
  if (fit.small) problems.push('小さすぎる釦');
  await p.evaluate(`(${conquer})('xiangguo', 'army_liu_yao')`).catch(() => {});
  await p.evaluate(() => { document.querySelector('#spoils').hidden = true; window.__goko.campaign.spoils.pending && window.__goko.spoilsScreen.showCapture(window.__goko.campaign.spoils.pending); });
  await p.waitForTimeout(300); await p.screenshot({ path: path.join(__dirname, 'out', 'capture.png') });
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
