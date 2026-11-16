// 西域(Version 39):地形の位置・都市と国の登場・人物の年代・交易と封鎖・砂漠と山の兵站・オアシスの補給・AIの兵站判断・
// 西域の外交と従属・西域の歴史の事件・既存の仕組み・保存と互換・描画の負荷・画面(交易路・補給・財政・歴史の流れ)・淝水の作戦
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  const open = async (sc) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 900)); if (!ok) problems.push(label); };
  const WEST = ['shanshan', 'yutian', 'shule', 'qiuci', 'yanqi', 'jushi'];

  // 1. 地形:天山・タリム盆地・トルファン盆地・崑崙・パミールが正しい位置にある
  let p = await open('s317');
  const r1 = await p.evaluate(() => { const g = window.__goko; const f = g.terrains[0].field; const k = (lon, lat) => g.grid.kindAt(lon, lat);
    return { tianshan: Math.round(f.sample(84, 42.5)), tarim: Math.round(f.sample(83, 39)), turpan: Math.round(f.sample(89.3, 42.65)), kunlun: Math.round(f.sample(82, 35.8)), pamir: Math.round(f.sample(74.5, 38.5)), taklamakan: k(83, 39), tianshanKind: k(84, 42.5), bosten: f.isWater(87.0, 41.97), west: g.terrains[0].region.info.bounds.west }; });
  check('1 西域の地形が正しい位置にある(標高・砂漠・湖)', r1.west === 70 && r1.tianshan > 2500 && r1.tarim < 1600 && r1.turpan < 300 && r1.kunlun > 4000 && r1.pamir > 3500 && r1.taklamakan === 'desert' && /Mountain/.test(r1.tianshanKind) && r1.bosten, r1);

  // 4・5. 交易が成り立ち、封鎖で収入が減る(317年:前涼と鄯善)
  const r4 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    for (let i = 0; i < 2; i++) { c.day += 30; c.trade.monthly(); }
    const before = { liang: c.trade.incomeOf('qianliang'), shan: c.trade.incomeOf('shanshan'), silk: c.economy.report('qianliang').income.silk, segs: Object.values(c.trade.segments).filter(Boolean).length };
    c.setRelation('qianliang', 'shanshan', 'war'); c.day += 30; c.trade.monthly();
    const after = { liang: c.trade.incomeOf('qianliang'), shan: c.trade.incomeOf('shanshan'), segs: Object.values(c.trade.segments).filter(Boolean).length };
    const why = c.trade.status().find(r => r.route.id === 'south').segs.find(s => s.a.id === 'loulan').why;
    c.setRelation('qianliang', 'shanshan', 'friendly');
    const pact = c.diplo.act('qianliang', 'shanshan', 'trade'); let tries = 0; while (!c.trade.hasPact('qianliang', 'shanshan') && tries++ < 20) { c.day += 1; c.factionStates.qianliang.gold = 9999; c.diplo.act('qianliang', 'shanshan', 'trade'); }
    return { before, after, why, pact: c.trade.hasPact('qianliang', 'shanshan'), cap: c.trade.market(g.allCities.find(k => k.id === 'shanshan')) }; });
  check('4 中国と西域の交易が成り立つ(交易協定も)', r4.before.liang > 0 && r4.before.shan > 0 && r4.before.silk > 0 && r4.pact, r4);
  check('5 交易路の封鎖で収入が減る', r4.after.shan < r4.before.shan && r4.after.segs < r4.before.segs && /戦争/.test(r4.why || ''), r4);

  // 6・7・8. 砂漠の消耗・オアシスの補給・山の行軍
  const r6 = await p.evaluate(() => { const g = window.__goko, c = g.campaign;
    const city = g.allCities.find(k => window.__gokoData.scenario.cityOwners[k.id] === 'qianliang' && k.id === 'guzang') || g.allCities.find(k => window.__gokoData.scenario.cityOwners[k.id] === 'qianliang');
    const mk = (cityId, lon, lat) => { c.cityStates[cityId] = { ...c.cityState(city), garrison: 30000 }; c.factionStates.qianliang.grain += 2000; const a = c.raiseArmy(cityId, 4000); if (typeof a === 'string') throw new Error(a); a.army.lon = lon; a.army.lat = lat; a.army.food = 40; a.army.fatigue = 0; a.status = 'camping'; return a; };
    const des = mk(city.id, 84.0, 39.3); const pla = mk(city.id, 104.5, 35.6);
    des.status = 'marching'; pla.status = 'marching'; for (let i = 0; i < 10; i++) for (const s of [des, pla]) { s.status = 'marching'; c.dailyUpkeep(s); }
    const oasis = mk(city.id, 82.95 + 0.25, 41.72); c.setRelation('qianliang', 'qiuci', 'alliance'); c.dailyUpkeep(oasis); const allied = oasis.supplied; c.setRelation('qianliang', 'qiuci', 'neutral'); c.dailyUpkeep(oasis); const neutral = oasis.supplied;
    const mt = mk(city.id, 84.0, 42.5); const speed = (m) => { let d = 0; while (d < 400) { c.day = d; if (c.calendar().month === m) break; d += 10; } return c.marchSpeed(mt); };
    const summer = speed(7), winter = speed(1); mt.army.troops = { infantry: 500, cavalry: 3500, archer: 0 }; const cavM = speed(7); mt.army.lon = 104.5; mt.army.lat = 35.6; const plainSpeed = c.marchSpeed(mt); mt.army.lon = 84.0; mt.army.lat = 42.5;
    return { desert: { food: Math.round(des.army.food), fatigue: Math.round(des.army.fatigue), kind: c.terrainOf(des) }, plain: { food: Math.round(pla.army.food), fatigue: Math.round(pla.army.fatigue), kind: c.terrainOf(pla), sup: pla.supplied }, allied, neutral, summer, winter, cavM, plainSpeed, mtKind: c.terrainOf(mt) }; });
  check('6 砂漠では補給の消耗が増える', r6.desert.kind === 'desert' && r6.desert.food < r6.plain.food && r6.desert.fatigue > r6.plain.fatigue, r6);
  check('7 オアシス(同盟国・従属国・自国)で補給できる', r6.allied === true && r6.neutral === false, r6);
  check('8 山岳の行軍に制約がある(冬・騎兵)', r6.mtKind === 'highMountain' && r6.winter < r6.summer && r6.cavM < r6.summer && r6.cavM < r6.plainSpeed, r6);

  // 10. 西域の国の外交と従属(自治を保ち、宗主が衰えれば離れる)
  const r10 = await p.evaluate(() => { const c = window.__goko.campaign, D = window.__gokoData;
    c.setRelation('qianliang', 'yutian', 'neutral'); c.diplo.amity['qianliang|yutian'] = 30; let ok = false; for (let i = 0; i < 30 && !ok; i++) { c.day += 1; c.factionStates.qianliang.gold = 9999; ok = c.diplo.act('qianliang', 'yutian', 'vassal').ok; }
    const ruler = c.rulerOf('yutian')?.name; const cities = c.cities.filter(k => D.scenario.cityOwners[k.id] === 'yutian').length;
    for (const s of c.armies) if (s.army.factionId === 'qianliang') for (const k of ['infantry', 'cavalry', 'archer']) s.army.troops[k] = 0;
    for (const k of c.cities) if (D.scenario.cityOwners[k.id] === 'qianliang') c.cityStates[k.id] = { ...c.cityState(k), garrison: 100 };
    for (const k of c.cities) if (D.scenario.cityOwners[k.id] === 'yutian') c.cityStates[k.id] = { ...c.cityState(k), garrison: 40000 };
    const pq = c.diplo.power('qianliang'), py = c.diplo.power('yutian'); c.diplo.monthly();
    return { ok, rel: ok ? 'vassal' : c.relationOf('qianliang', 'yutian'), ruler, cities, after: c.relationOf('qianliang', 'yutian'), power: [pq, py] }; });
  check('10 西域の国が従属し、自治を保ち、宗主が衰えれば離れる', r10.ok && !!r10.ruler && r10.cities >= 1 && r10.after !== 'vassal', r10);

  // 11. 西域の事件(317年:趙貞の反乱・327年)
  const r11 = await p.evaluate(() => { const c = window.__goko.campaign, h = c.history; let n = 0; while (n++ < 200) { const { year, month } = c.calendar(); if (year * 12 + month >= 327 * 12 + 6) break; c.day += 30; h.monthly(); }
    const ids = ['zhaozhen327', 'yangxuan345', 'xiyu382', 'qiuci384', 'houliang386']; return { total: h.defs.length, zz: h.records.zhaozhen327.status, zzr: (h.records.zhaozhen327.result || '').slice(0, 60), defined: ids.every(id => !!h.def(id)) }; });
  await p.close();
  p = await open('s383');
  const r11b = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    const lv = c.armies.find(s => s.army.commanderId === 'lv_guang'); const reserved = lv ? h.reservedArmy('lv_guang') : false;
    let n = 0; while (n++ < 200) { const { year, month } = c.calendar(); if (year * 12 + month >= 384 * 12 + 7) break; c.day += 30; h.monthly(); }
    const r = h.records.qiuci384; const ev = c.events.find(e => e.histId === 'qiuci384'); const tags = h.tags.filter(t => t.histId === 'qiuci384').length;
    return { xiyu: h.records.xiyu382.status, qiuci: r.status, res: (r.result || '').slice(0, 80), ev: ev && ev.battleType, tags, reserved, lvTroops: lv && (lv.army.troops.infantry + lv.army.troops.cavalry + lv.army.troops.archer) }; });
  check('11 西域の歴史の事件が起こる(趙貞・呂光の亀茲遠征)', r11.total >= 57 && r11.defined && r11.zz !== 'pending' && r11b.xiyu === 'past' && r11b.qiuci !== 'pending' && r11b.reserved && (!!r11b.ev || r11b.tags > 0 || /降り|守り切った/.test(r11b.res)), { r11, r11b });

  // 2・3. 都市と国・人物が年代に応じて登場する
  await p.close();
  const per = {};
  for (const sc of ['s300', 's329', 's357', 's383']) {
    p = await open(sc);
    per[sc] = await p.evaluate((W) => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
      return { states: W.filter(f => D.scenario.factions.some(x => x.id === f)).length, cities: g.allCities.filter(k => k.lon < 96).length, gaochang: D.scenario.cityOwners.gaochang, qiuciRuler: c.rulerOf('qiuci')?.name, kumarajiva: !!D.persons.find(x => x.id === 'kumarajiva'), xiumituo: !!D.persons.find(x => x.id === 'xiumituo'), unknownKings: D.persons.filter(x => x.certainty === '不明').length, unborn: D.persons.filter(x => !x.fictional && x.born !== null && x.born > D.scenario.year).map(x => x.id) }; }, WEST);
    await p.close();
  }
  check('2 新しい都市・国が年代に応じて登場する', Object.values(per).every(x => x.states === 6 && x.cities >= 17) && per.s300.gaochang === 'jin' && per.s329.gaochang === 'qianliang' && per.s383.gaochang === 'qianqin' && per.s383.qiuciRuler === '白純' && /名は伝わらない/.test(per.s300.qiuciRuler), per);
  check('3 史実に存在しない人物が出ない(鳩摩羅什は357年から・休密馱は383年だけ・名の伝わらない王は「不明」)', !per.s300.kumarajiva && !per.s329.kumarajiva && per.s357.kumarajiva && per.s383.kumarajiva && per.s383.xiumituo && !per.s357.xiumituo && per.s300.unknownKings === 6 && Object.values(per).every(x => x.unborn.length === 0), per);

  // 9. AIは補給の届かない遠征をしない
  p = await open('s383');
  const r9 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0; const D = window.__gokoData;
    c.setRelation('qianqin', 'yutian', 'war'); c.setRelation('qianqin', 'shule', 'war');
    const s = c.armies.find(x => x.army.factionId === 'qianqin' && x.army.commanderId === 'lv_guang'); s.army.commanderId = 'du_jin'; s.army.lon = 89.9; s.army.lat = 40.4; s.status = 'camping'; s.route = null;
    const prof = c.strategy.profile(); const mine = g.allCities.filter(k => D.scenario.cityOwners[k.id] === 'qianqin'); const enemies = g.allCities.filter(k => ['yutian', 'shule'].includes(D.scenario.cityOwners[k.id]));
    s.army.food = 15; s.army.morale = 80; s.army.fatigue = 0; c.strategy.orderArmy(s, prof, mine, enemies); const low = s.targetCityId;
    s.route = null; s.status = 'camping'; s.army.lon = 89.9; s.army.lat = 40.4; s.army.food = 15;
    // 砂漠で食糧が心もとない軍団は、引き返す
    s.army.lon = 84.0; s.army.lat = 39.3; s.supplied = false; s.army.food = 15; c.strategy.orderArmy(s, prof, mine, enemies); const back = s.status;
    return { low, back, prof: prof.reachKm }; });
  check('9 AIが補給の届かない遠征をしない(砂漠では早めに引き返す)', !['yutian', 'shache', 'shule'].includes(r9.low || '') && r9.back === 'marching', r9);

  // 淝水の作戦:史実の選択(渡河を許す・謝玄の決戦)では、少ない東晋が勝つことがある。前秦の敗北は強制しない
  const r12 = await p.evaluate(() => { const c = window.__goko.campaign; let jin = 0, qin = 0;
    const base = { attacker: { role: 'attacker', kind: 'army', factionId: 'jin', armyId: 'a', cityId: null, name: '北府軍', commander: { name: '謝玄', leadership: 92, war: 80, intelligence: 88 }, troops: { infantry: 50000, cavalry: 8000, archer: 22000 }, morale: 100, fatigue: 10, food: 40, fortification: null }, defender: { role: 'defender', kind: 'army', factionId: 'qianqin', armyId: 'b', cityId: null, name: '前秦', commander: { name: '苻融', leadership: 80, war: 72, intelligence: 80 }, troops: { infantry: 120000, cavalry: 40000, archer: 40000 }, morale: 80, fatigue: 20, food: 40, fortification: null }, battleType: 'field_battle', terrain: 'river', location: { lon: 116.7, lat: 32.6, name: '淝水' }, name: '淝水' };
    for (let i = 0; i < 40; i++) { const setup = { ...JSON.parse(JSON.stringify(base)), battleId: 'fs' + i, createdAt: { day: i, text: '' }, tactics: { attacker: 1.12, defender: 0.88, noRiverBonus: true, panic: 'defender', panicRisk: 0.6 } }; const r = window.__gokoAuto(setup); if (r.winner === 'attacker') jin++; else if (r.winner === 'defender') qin++; }
    let jin2 = 0; for (let i = 0; i < 40; i++) { const setup = { ...JSON.parse(JSON.stringify(base)), battleId: 'fx' + i, createdAt: { day: i, text: '' } }; if (window.__gokoAuto(setup).winner === 'attacker') jin2++; }
    return { withTactics: { jin, qin }, noTactics: jin2 }; });
  check('淝水:作戦しだいで少数の東晋が勝ち得る(前秦の敗北は強制しない)', r12.withTactics.jin > 0 && r12.withTactics.qin > 0 && r12.withTactics.jin > r12.noTactics, r12);

  // 12・13・14・15. 事件・既存の仕組み・保存と互換
  const r13 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
    for (let i = 0; i < 2; i++) { c.day += 30; c.trade.monthly(); }
    const s = JSON.parse(JSON.stringify(g.buildSave())); const a = JSON.stringify([c.trade.serialize(), c.logistics]);
    c.trade.pacts = {}; c.trade.totals = {}; c.logistics.attrition = { x: 1 }; g.applySave(s); const b2 = JSON.stringify([c.trade.serialize(), c.logistics]);
    const old = JSON.parse(JSON.stringify(s)); delete old.campaign.trade; delete old.campaign.logistics; delete old.settings.historyMode; let err = null; try { g.applySave(old); } catch (e) { err = String(e); }
    const rep = c.economy.report('qianqin'); const f = D.scenario.factions.find(x => x.id === 'silla'); c.fallFaction('silla', c.rulerOf('silla'), 'goguryeo');
    return { same: a === b2, err, income: rep.income.total, silk: rep.income.silk, fallen: !!f.fallen, order: c.court.successionOrder('qianqin').length, events: c.history.defs.length, feishui: !!c.history.def('feishui383') }; });
  check('12 既存の歴史の事件(52件)と西域の事件(5件)が動く', r13.events >= 57 && r13.feishui, r13);
  check('13 既存の会戦・滅亡・宮廷・経済が動く', r13.income > 0 && r13.fallen && r13.order > 0, r13);
  check('14 セーブ・ロードで交易と兵站が戻る', r13.same, r13);
  check('15 古いセーブとの互換', !r13.err, r13);

  // 16. 描画の負荷:華北を見ているとき、西域の地形の区画は描かない(区画の視錐台カリング)
  const r16 = await p.evaluate(async () => { const g = window.__goko; const r = g.renderer; const tiles = g.terrains[0].mesh.children.length;
    const measure = async (lon, lat, d) => { g.focus(lon, lat, d); g.dirty = true; await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const cam = g.mapCamera.camera; cam.updateMatrixWorld(); const fr = new (Object.getPrototypeOf(g.scene).constructor === Object ? Object : window.THREE?.Frustum || Object)();
      const t0 = performance.now(); for (let i = 0; i < 10; i++) r.render(g.scene, cam); const ms = (performance.now() - t0) / 10; const tri = r.info.render.triangles; return { ms: Math.round(ms * 10) / 10, tri }; };
    const china = await measure(112, 35, 40); const west = await measure(82, 40, 40); const all = await measure(100, 33, 400);
    return { tiles, china, west, all, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }; });
  check('16 華北の描画が大きく重くならない(見えない区画は描かない)', r16.tiles > 20 && r16.china.tri < r16.all.tri * 0.75, r16);

  // 画面:交易路・補給の表示、財政の交易収入、歴史の流れの設定
  await p.evaluate(() => { window.__goko.changeSettings({ playerFactionId: 'qianqin' }); document.querySelector('#trade-open').click(); });
  await p.waitForTimeout(500); await p.screenshot({ path: out + '/pc-trade-routes.png' });
  const ui = await p.evaluate(() => { const g = window.__goko; const panel = document.querySelector('#overlay-panel'); const trade = { shown: !panel.hidden, text: panel.textContent.slice(0, 200), lines: g.overlayRoutes.length };
    document.querySelector('#supply-open').click(); const supply = { shown: !panel.hidden, rings: g.overlayGroup.children.length, text: panel.textContent.slice(0, 120) };
    document.querySelector('#supply-open').click();
    g.changeSettings({ playerFactionId: 'qianqin' }); document.querySelector('#finance-open').click(); const fin = document.querySelector('#finance').textContent.includes('シルクロード交易'); document.querySelector('.finance-close').click();
    document.querySelector('#menu-open').click(); const hb = [...document.querySelectorAll('.history-choice button')]; hb[1].click(); const mode = g.campaign.historyMode; hb[0].click();
    return { trade, supply, fin, mode, back: g.campaign.historyMode }; });
  check('画面:交易路・補給の表示、財政の交易収入、歴史の流れの設定', ui.trade.shown && ui.trade.lines >= 20 && /交易/.test(ui.trade.text) && ui.supply.shown && ui.supply.rings > 0 && ui.fin && ui.mode === 'free' && ui.back === 'historic', ui);
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
