// Version 42:遠い国への不自然な遠征をしない(戦略的な関心と実際の道のり)・出兵の判断の記録・
// 攻城戦の救援軍(手動と自動で同じ決まり:到着の時刻・途中からの参加・妨害・別々の到着)・首都の防衛(君主の退避・遷都)・
// 移動中の捕縛・戦場の道と浅瀬・地域ごとの城郭の様式と景観・乱数の種のセーブ
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sc, vp = { width: 1280, height: 800 }) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + (sc ? '#s=' + sc : '')); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => { window.__run = (days) => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; const d0 = c.day; let n = 0;
      while (c.day - d0 < days && n++ < 9000000) {
        if (c.gameOver) { const nx = D.scenario.factions.filter(f => !f.fallen && c.cities.some(k => D.scenario.cityOwners[k.id] === f.id))[0]; if (!nx) break; c.gameOver = false; g.changeSettings({ playerFactionId: nx.id }); }
        const aw = h.awaiting; if (aw) { const roles = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => roles[k] === c.playerFactionId) ?? Object.keys(aw.choices).find(k => roles[k]); h.choose(aw.id, aw.choices[role][0].id); }
        h.queue = h.queue.filter(q => q.mode === 'decide');
        if (c.speed === 0) { for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
        c.update(0.25); } }; });
    return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1400)); if (!ok) problems.push(label); };

  // 1. 300年開始・15年:西晋が朝鮮半島(金城・漢城・楽浪のそば)へ遠征しない。出兵の判断が記録される
  let p = await open('s300');
  const r1 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla', difficulty: 'normal' }); c.speed = 0; window.__run(360 * 15);
    const dec = c.strategy.decisions; const korea = dec.filter(d => d.faction === 'jin' && /金城|漢城/.test(d.target) && d.nearestMine > 300);
    // (Version 51:判定を「300km以内に自国の都市がないのに、朝鮮半島を目標にする出兵」に絞った。V42で直した不具合は、近くに自国の都市が
    //  ない西晋の、遠い金城への遠征だった。自国の国境の郡(楽浪)の隣国への出兵は、その不具合とは別なので数えない。数えなかった分は koreaNear に示す)
    const koreaNear = dec.filter(d => d.faction === 'jin' && /金城|漢城/.test(d.target) && d.nearestMine <= 300).map(d => `${d.date} ${d.from}→${d.target}(自国の都市まで${d.nearestMine}km)`);
    const far = dec.filter(d => d.routeKm > 2000);
    const fields = dec[0] ? Object.keys(dec[0]) : [];
    return { date: c.dateText(), decisions: dec.length, korea: korea.map(d => `${d.date} ${d.from}→${d.target}`), koreaNear, far: far.map(d => `${d.faction}:${d.from}→${d.target} ${d.routeKm}km`), silla: !D.scenario.factions.find(f => f.id === 'silla').fallen, fields, sample: dec.slice(-1) }; });
  check('1 西晋が朝鮮半島へ不自然な遠征をしない。2,000km超の遠征もない。判断(出発・目標・道のり・兵糧・価値・守り・ほかの候補)が記録される',
    r1.korea.length === 0 && r1.far.length === 0 && r1.decisions > 5 && ['from', 'target', 'routeKm', 'foodNeed', 'value', 'homeGuards', 'others'].every(k => r1.fields.includes(k)), r1);
  // 1b. 関心:本拠の近くの都市は関心が高く、遠い飛び地のそばの小国は低い
  const r1b = await p.evaluate(() => { const c = window.__goko.campaign; const near = c.cities.find(k => k.id === 'luoyang'); const far = c.cities.find(k => k.id === 'geumseong');
    return { luoyang: +c.strategy.interest('jin', near).toFixed(2), geumseong: +c.strategy.interest('jin', far).toFixed(2) }; });
  check('1b 戦略的な関心:西晋にとって洛陽は高く、金城は低い', r1b.luoyang > 0.6 && r1b.geumseong < 0.3, r1b);
  await p.close();

  // 2. 救援軍:手動と自動で同じ到着の時刻。着く前に決着すれば加わらない。途中から加わる。道を阻まれる。別々の時刻に着く
  p = await open(null);
  const r2 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; c.speed = 0; g.changeSettings({ playerFactionId: null });
    const att = c.stateOf('army_liu_yao'); const a = att.army;
    const city = g.allCities.filter(k => k.kind !== 'pass' && D.scenario.cityOwners[k.id] && D.scenario.cityOwners[k.id] !== a.factionId).sort((x, y) => Math.hypot(x.lon - a.lon, x.lat - a.lat) - Math.hypot(y.lon - a.lon, y.lat - a.lat))[0];
    const own = D.scenario.cityOwners[city.id]; c.setRelation(a.factionId, own, 'war');
    const save = g.buildSave();
    const mk = (dLon, dLat, troops) => { c.cityStates[city.id] = { ...c.cityState(city), garrison: c.cityState(city).garrison + troops + 3000 }; const r = c.raiseArmy(city.id, troops); if (typeof r === 'string') return null; r.army.lon = city.lon + dLon; r.army.lat = city.lat + dLat; r.status = 'camping'; r.route = null; return r; };
    const siege = (strong) => { a.lon = city.lon + 0.05; a.lat = city.lat - 0.25; if (strong) { a.troops = { infantry: 60000, cavalry: 20000, archer: 15000 }; a.morale = 90; } const n = c.events.length; c.startEvent(att, 'siege_battle', null, city); return c.events[n]; };
    const out = {};
    // (a) 遠い救援軍(到着が遅い)+ 強い攻め手:着く前に落城し、救援軍は加わらず兵を失わない
    const h1 = mk(0.7, 0.2, 4000); const ev1 = siege(true); const st1 = window.__gokoSetup(ev1); const res1 = window.__gokoAuto(st1);
    out.a = { arriveSec: ev1.supporters?.[0]?.arriveSec, days: res1.siege.days, captured: res1.siege.captured, joined: res1.reliefJoined, after: res1.relief?.[h1?.army.id]?.after, before: h1 && { ...h1.army.troops } };
    // (b) すぐそばの救援軍:途中から加わり、兵を失う
    g.applySave(save); c.speed = 0; const h2 = mk(0.15, 0.05, 6000); const ev2 = siege(false); const st2 = window.__gokoSetup(ev2); const res2 = window.__gokoAuto(st2);
    out.b = { arriveSec: ev2.supporters?.[0]?.arriveSec, days: res2.siege.days, joined: res2.reliefJoined, lost: h2 ? (h2.army.troops.infantry + h2.army.troops.cavalry + h2.army.troops.archer) - Object.values(res2.relief?.[h2.army.id]?.after ?? {}).reduce((x, y) => x + y, 0) : null };
    // (c) 道を阻まれる:救援軍と都市のあいだに、攻める側の別の軍団がいる
    g.applySave(save); c.speed = 0; const h3 = mk(0.6, 0, 4000);
    // 攻める側の別の軍団を、救援軍と都市のあいだに置く(なければ、攻める側の都市から出す)
    let block = c.armies.find(x => x.army.factionId === a.factionId && x !== att);
    if (!block) { const home = g.allCities.find(k => k.kind !== 'pass' && D.scenario.cityOwners[k.id] === a.factionId); c.cityStates[home.id] = { ...c.cityState(home), garrison: c.cityState(home).garrison + 8000 }; const r = c.raiseArmy(home.id, 5000); block = typeof r === 'string' ? undefined : r; }
    if (block) { block.army.lon = city.lon + 0.32; block.army.lat = city.lat; block.status = 'camping'; block.route = null; }
    const ev3 = siege(false); out.c = { blocker: !!block, blocked: ev3.reliefBlocked ?? [], relief: (ev3.supporters ?? []).filter(x => x.relief).length };
    // (d) 2つの救援軍が別々の時刻に着く。手動の3Dの攻城戦の部隊も、同じ時刻に現れる
    g.applySave(save); c.speed = 0; mk(0.12, 0, 3000); mk(0.5, 0.3, 3000); const ev4 = siege(false); const st4 = window.__gokoSetup(ev4);
    out.d = { secs: (ev4.supporters ?? []).filter(x => x.relief).map(x => x.arriveSec), setupSecs: (st4.defender.supporters ?? []).map(x => x.relief?.arriveSec) };
    window.__ev4 = ev4.battleId; g.openBattleId = ev4.battleId;
    return out; });
  await p.evaluate(() => window.__goko.startBattle('defender')); await p.waitForFunction(() => window.__goko.battle, null, { timeout: 90000 });
  const r2m = await p.evaluate(() => { const s = window.__goko.battle.sim; return [...new Set(s.units.filter(u => u.reliefOf).map(u => u.arriveAt))].sort((x, y) => x - y); });
  const same = JSON.stringify([...r2.d.secs].sort((x, y) => x - y)) === JSON.stringify(r2m);
  check('2 救援軍:着く前に決着すれば加わらず兵も失わない/途中から加わる/道を阻まれる/別々の時刻に着く/手動と自動で同じ到着の時刻',
    r2.a.joined?.length === 0 && JSON.stringify(r2.a.after) === JSON.stringify(r2.a.before) && (r2.b.joined?.length ?? 0) >= 1 && r2.b.lost > 0 && r2.c.blocker && r2.c.blocked.length >= 1 && r2.c.relief === 0 && r2.d.secs.length === 2 && r2.d.secs[0] !== r2.d.secs[1] && same, { ...r2, manualArrive: r2m });
  await p.close();

  // 3. 首都の防衛:首都に大軍が迫ると、君主が(道に沿って日数をかけて)退避する。包囲されて救えなければ遷都する
  p = await open('s357');
  const r3 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; c.speed = 0; g.changeSettings({ playerFactionId: 'jin' });
    const F = 'qianyan', E = 'qianqin'; c.setRelation(F, E, 'war');
    const cap = c.capitalCityOf(F); const ruler = c.rulerOf(F); c.placement.moveTo(ruler.id, cap.id, 'court', 't');
    if (c.postOf(ruler.id)?.id === cap.id) c.cityStates[cap.id] = { ...c.cityState(cap), governorId: null };
    // 前秦の軍団を、首都の南東40kmと南西40kmへ(首都へ向かう敵)
    const qs = c.armies.filter(x => x.army.factionId === E).slice(0, 3);
    qs.forEach((x, i) => { x.army.lon = cap.lon + (i - 1) * 0.3; x.army.lat = cap.lat - 0.35; x.army.troops = { infantry: 40000, cavalry: 15000, archer: 10000 }; x.status = 'camping'; x.route = null; x.targetCityId = cap.id; });
    c.cityStates[cap.id] = { ...c.cityState(cap), garrison: 3000 };
    const before = c.strategy.totals();
    c.strategy.daily(Math.floor(c.day) + 0); c.strategy.daily(Math.floor(c.day) + 1); c.strategy.daily(Math.floor(c.day) + 2);
    const evac = !!c.placement.travels[ruler.id]; const loc0 = c.placement.locationOf(ruler.id).label;
    const t = c.strategy.totals();
    // 遷都:包囲(60km以内)され、救えない見込み
    qs.forEach((x, i) => { x.army.lon = cap.lon + (i - 1) * 0.15; x.army.lat = cap.lat - 0.2; });
    const p0 = c.strategy.profile(); c.strategy.military(F, p0, c.strategy.citiesOf(F), c.strategy.enemyCitiesOf(F));
    const cap2 = c.capitalCityOf(F);
    // 移動を進めて、着くか
    const dest = c.placement.travels[ruler.id]?.to; for (let i = 0; i < 40 && c.placement.travels[ruler.id]; i++) { c.day += 1; c.tickTravels(); }
    return { cap: cap.name, evac, loc0, evacCount: t.rulerEvacuations - before.rulerEvacuations, recruit: t.capitalReinforce - before.capitalReinforce, newCapital: cap2?.name, moves: c.strategy.totals().capitalMoves, dest: dest && c.cities.find(k => k.id === dest)?.name, after: c.placement.locationOf(ruler.id).label, status: c.personStatus(ruler.id) }; });
  check('3 首都の防衛:大軍が迫ると君主が道に沿って退避を始め(瞬間移動しない)、包囲されて救えなければ遷都する', r3.evac && /移動中/.test(r3.loc0) && r3.evacCount >= 1 && r3.newCapital !== r3.cap && r3.moves >= 1, r3);
  await p.close();

  // 4. 移動中の捕縛:敵の軍団のそばを通ると、捕まることがある(1日ごとに4割)。種を変えて10回
  p = await open('s357');
  const r4 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); const save = g.buildSave(); let caught = 0, arrived = 0;
    for (let i = 0; i < 10; i++) { g.applySave(save); window.__gokoSeed('t' + i); c.setRelation('qianyan', 'qianqin', 'war');
      const ruler = c.rulerOf('qianyan'); const from = c.capitalCityOf('qianyan'); const to = c.cities.find(k => k.id === 'ye');
      const path = c.pathBetween(from, to); c.placement.startTravel(ruler.id, from.id, to.id, path.points, path.km, '試験');
      const mid = path.points[Math.floor(path.points.length / 2)]; const foe = c.armies.find(x => x.army.factionId === 'qianqin'); foe.army.lon = mid.lon; foe.army.lat = mid.lat;
      for (let d = 0; d < 40 && c.placement.travels[ruler.id]; d++) { c.day += 1; c.tickTravels(); }
      if (c.personStatus(ruler.id) === 'captured') caught++; else arrived++; }
    window.__gokoSeed(''); return { caught, arrived }; });
  check('4 移動中の捕縛:敵のそばを通ると、捕まることも、抜けられることもある', r4.caught >= 1 && r4.caught <= 9, r4);
  await p.close();

  // 5. 戦場:孟津のそばの野戦に、道と浅瀬(孟津)がある。西域の亀茲の攻城戦は、オアシスの城郭と景観
  p = await open('s311');
  await p.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 0; const a = c.armies[0], d = c.armies.find(x => x.army.factionId !== a.army.factionId);
    const e2 = { battleId: 'f_mj', battleType: 'field_battle', attackerArmyId: a.army.id, defenderArmyId: d.army.id, location: { lon: 112.6, lat: 34.8, name: '孟津' }, terrain: 'plain', attackerFactionId: a.army.factionId, defenderFactionId: d.army.factionId, status: 'pending', createdAt: { day: 0, text: '' } };
    c.events.push(e2); g.openBattleId = e2.battleId; g.startBattle('attacker'); });
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 90000 });
  const r5 = await p.evaluate(() => { const f = window.__goko.battle.field; let road = 0; for (const v of f.road) road += v; let ford = 0; for (const v of f.ford) ford += v;
    // 浅瀬は渡れる(深い水ではない)、道の上は通れる
    const fd = f.fords[0]; return { fords: f.fords.length, named: f.fords.filter(x => x.name).map(x => x.name), road, ford, fordPassable: fd ? !f.blocked(fd.x, fd.z, false) : null, text: document.querySelector('.hud-terrain').textContent.slice(-40) }; });
  check('5 野戦の戦場:道と、渡れる浅瀬(史料の渡し「孟津」を含む)がある', r5.fords >= 1 && r5.named.includes('孟津') && r5.road > 50 && r5.fordPassable === true, r5);
  await p.close();
  p = await open('s383');
  await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; c.speed = 0; const city = g.allCities.find(k => k.id === 'qiuci'); const own = D.scenario.cityOwners.qiuci; const att = c.armies.find(x => x.army.factionId !== own);
    att.army.lon = city.lon + 0.05; att.army.lat = city.lat - 0.25; c.setRelation(att.army.factionId, own, 'war');
    const ev = { battleId: 's_qc', battleType: 'siege_battle', attackerArmyId: att.army.id, defenderArmyId: null, defenderCityId: city.id, location: { lon: city.lon, lat: city.lat, name: city.name }, terrain: 'plain', attackerFactionId: att.army.factionId, defenderFactionId: own, status: 'pending', createdAt: { day: 0, text: '' } };
    c.events.push(ev); g.openBattleId = ev.battleId; g.startBattle('defender'); });
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 90000 });
  const r5b = await p.evaluate(() => { const bt = window.__goko.battle; return { landscape: bt.battlefield.landscape.name, wall: bt.siegeModel.pal.wall, flat: bt.siegeModel.pal.flatRoof }; });
  check('5b 西域の攻城戦:オアシスの城郭(明るい日干し煉瓦・平屋根)と、西域の景観', r5b.flat === true && /西域/.test(r5b.landscape), r5b);
  await p.close();

  // 6. 乱数の種:セーブに残り、ロードで戻る。種を変えると展開が変わる
  p = await open('s317');
  const r6 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; window.__gokoSeed('abc'); const s1 = g.buildSave(); window.__gokoSeed(''); g.applySave(s1); const s2 = g.buildSave(); window.__gokoSeed(''); return { saved: s1.campaign.seed, restored: s2.campaign.seed }; });
  check('6 乱数の種がセーブに残り、ロードで戻る', r6.saved === 'abc' && r6.restored === 'abc', r6);
  await p.close();

  // 7. セーブ・ロード:君主の移動の途中と、AIどうしの攻城戦の包囲の途中が、ロードのあとも続く
  p = await open('s357');
  const r7 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; c.speed = 0; g.changeSettings({ playerFactionId: 'jin' });
    const ruler = c.rulerOf('qianyan'); const from = c.capitalCityOf('qianyan'); const to = c.cities.find(k => k.id === 'ye'); const path = c.pathBetween(from, to);
    c.placement.startTravel(ruler.id, from.id, to.id, path.points, path.km, '試験');
    // AIどうし(前秦が前燕の都市を攻める)の攻城戦を始め、包囲の途中にする
    c.setRelation('qianyan', 'qianqin', 'war'); const city = c.cities.find(k => D.scenario.cityOwners[k.id] === 'qianyan' && k.id !== from.id && k.kind !== 'pass');
    const att = c.armies.find(x => x.army.factionId === 'qianqin'); att.army.lon = city.lon + 0.05; att.army.lat = city.lat - 0.2;
    c.startSiegeAt(att, city, 'test'); const ev = c.events[c.events.length - 1];
    const before = { travel: !!c.placement.travels[ruler.id], until: ev.autoSiegeUntil, status: ev.status };
    const s1 = g.buildSave(); g.applySave(JSON.parse(JSON.stringify(s1)));
    const ev2 = c.eventOf(ev.battleId);
    return { before, after: { travel: c.placement.travels[ruler.id]?.to, label: c.placement.locationOf(ruler.id).label, until: ev2?.autoSiegeUntil, status: ev2?.status } }; });
  check('7 セーブ・ロード:君主の移動の途中と、自動の攻城戦の包囲の途中が、ロードのあとも続く', r7.before.travel && r7.after.travel === 'ye' && /移動中/.test(r7.after.label) && r7.before.until !== undefined && r7.after.until === r7.before.until && r7.after.status === 'in_progress', r7);
  await p.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
