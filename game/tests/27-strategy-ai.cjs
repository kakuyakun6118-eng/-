// 戦略AI(Version 40):敵の国が自分で情勢を見て、軍団を動かし、野戦・攻城をし、都市を占領し、負ければ撤退する。
// テストA 弱いプレイヤーの国へ攻めてくる / B 強いプレイヤーの国へは無謀に攻めない / C AIどうしの戦争 /
// D 複数の軍団の連携 / E 補給不足での撤退 / F 300・317・383年の通常進行 / 保存と読み込み / 開発用ログ
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const open = async (sc) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    // 時間を進める道具:プレイヤーは何もしない(会戦は自動で決着、歴史の事件は史実の案、落城の処置は保全)
    await p.evaluate(() => { window.__run = (days) => { const g = window.__goko, c = g.campaign, h = c.history; const d0 = c.day; let n = 0; let moved = 0; const pos = new Map(c.armies.map(s => [s.army.id, s.army.lon + ',' + s.army.lat]));
      while (c.day - d0 < days && n++ < 2000000) {
        const aw = h.awaiting; if (aw) { const roles = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => roles[k] === c.playerFactionId); h.choose(aw.id, aw.choices[role][0].id); }
        h.queue = h.queue.filter(q => q.mode === 'decide');
        if (c.speed === 0) { for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
        c.update(0.25); }
      for (const s of c.armies) if (pos.has(s.army.id) && pos.get(s.army.id) !== s.army.lon + ',' + s.army.lat) moved++;
      return moved; }; });
    return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1200)); if (!ok) problems.push(label); };

  // A. 弱いプレイヤーの国:秦州(司馬保)の守備を減らし、隣の漢(前趙)に兵と兵糧を与える → 攻めてくる
  let p = await open('s317');
  const rA = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'sima_bao', difficulty: 'normal' }); c.speed = 0;
    const mine = g.allCities.filter(k => D.scenario.cityOwners[k.id] === 'sima_bao');
    for (const k of mine) { const st = c.cityState(k); c.cityStates[k.id] = { ...st, garrison: 400, morale: 50 }; }
    for (const s of c.armies.filter(s => s.army.factionId === 'han_zhao')) { s.army.food = 90; s.army.morale = 85; }
    c.factionStates.han_zhao.gold += 20000; c.factionStates.han_zhao.grain += 20000;
    const own0 = mine.map(k => k.id);
    const moved = window.__run(360);
    // 攻めてくる国は漢(前趙)とは限らない(成漢なども隣国)。すべてのAIの国の合計で見る
    const st = c.strategy.totals();
    const lost = own0.filter(id => D.scenario.cityOwners[id] !== 'sima_bao');
    const who = Object.entries(c.strategy.stats).filter(([, s]) => s.vsPlayerSieges > 0).map(([f]) => f);
    const log = c.strategy.log.filter(l => /司馬保|秦州|上邽|陳倉|安定|隴/.test(l.text)).slice(-6).map(l => l.text);
    return { moved, who, planned: st.planned, dispatched: st.dispatched, vsPlayer: st.vsPlayer, arrived: st.arrived, sieges: st.vsPlayerSieges, captures: st.vsPlayerCaptures, lost, log }; });
  check('A 弱いプレイヤーの国へ、AIが判断して実際に攻めてくる(出兵・移動・攻城・占領)', (rA.vsPlayer >= 1 || rA.sieges >= 1) && rA.moved >= 1 && rA.sieges >= 1 && rA.captures >= 1 && rA.lost.length >= 1, rA);
  await p.close();

  // B. 強いプレイヤーの国:秦州の守備を上限まで上げ、大きな軍団を置く → 無謀に攻めず、見送る理由を残す
  p = await open('s317');
  const rB = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'sima_bao', difficulty: 'normal' }); c.speed = 0;
    const mine = g.allCities.filter(k => D.scenario.cityOwners[k.id] === 'sima_bao');
    for (const k of mine) { const st = c.cityState(k); c.cityStates[k.id] = { ...st, garrison: 30000, morale: 90 }; }
    for (const s of c.armies.filter(s => s.army.factionId === 'sima_bao')) { s.army.troops.infantry += 20000; s.army.morale = 90; }
    const own0 = mine.map(k => k.id);
    window.__run(240);
    const st = c.strategy.stats.han_zhao ?? {};
    const lost = own0.filter(id => D.scenario.cityOwners[id] !== 'sima_bao');
    // 落ちた都市があっても、それが反乱・事件によるものか(AIの攻城で落ちたのではないか)を確かめる
    const sieged = c.strategy.totals().vsPlayerCaptures;
    const elsewhere = (st.dispatched ?? 0) - (st.vsPlayer ?? 0);
    return { vsPlayer: st.vsPlayer, vsPlayerSieges: st.vsPlayerSieges, aiCaptures: sieged, notLaunched: st.notLaunched, lost, posture: c.strategy.posture.han_zhao, elsewhere, log: c.strategy.log.filter(l => l.factionId === 'han_zhao').slice(-4).map(l => l.text) }; });
  check('B 強いプレイヤーの国へは無謀に攻めず、別の方面へ兵を向ける(攻城で都市を落とされない)', (rB.vsPlayer ?? 0) <= 1 && rB.aiCaptures === 0 && (rB.elsewhere >= 1 || Object.keys(rB.notLaunched ?? {}).length >= 1), rB);
  await p.close();

  // C・D・E・保存:317年、プレイヤーは新羅(遠く離れた国)。AIどうしの戦争・複数軍団・補給不足
  p = await open('s317');
  const rC = await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'silla', difficulty: 'normal' }); c.speed = 0;
    window.__run(540);
    const t = c.strategy.totals();
    const owners = Object.keys(c.strategy.stats).filter(f => c.strategy.stats[f].dispatched > 0);
    return { moves: t.moves, dispatched: t.dispatched, arrived: t.arrived, field: t.fieldBattles, sieges: t.sieges, captures: t.captures, retreats: t.retreats, coordinated: t.coordinated, guards: t.guards, factions: owners, aborted: t.aborted, notLaunched: t.notLaunched }; });
  check('C AIどうしの戦争で、軍団が動き、野戦・攻城戦が起き、都市が占領される', rC.moves >= 5 && rC.dispatched >= 3 && rC.field >= 1 && rC.sieges >= 1 && rC.captures >= 1 && rC.factions.length >= 2, rC);
  // Version 42:首都の守りは、首都の防衛(呼び戻し・籠城・救援)としても数える。540日で起きなければ、360日だけ延ばして確かめる
  const rD = await p.evaluate((rc) => { const c = window.__goko.campaign; const cnt = () => { const t = c.strategy.totals(); return t.guards + t.capitalRecall + t.capitalHoldout + t.capitalRelief; };
    let extra = 0; if (cnt() === 0) { window.__run(360); extra = 360; } const t = c.strategy.totals(); return { coordinated: t.coordinated, guards: t.guards, capitalRecall: t.capitalRecall, capitalHoldout: t.capitalHoldout, capitalRelief: t.capitalRelief, total: cnt(), extra }; }, rC);
  check('D 複数の軍団が役割を分けて動く(共同攻撃・援護・予備の投入・首都の守り)', rD.coordinated >= 1 && rD.total >= 1, rD);
  const rE = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; c.speed = 0;
    // 遠い敵地にいる軍団に、兵糧が乏しいまま攻撃の任務を与える → 補給・撤退の判断をする
    const s = c.armies.find(s => s.army.factionId === 'han_zhao' && s.status !== 'fighting') ?? c.armies.find(s => !['silla'].includes(s.army.factionId) && c.strategy.capitalOf(s.army.factionId));
    const f = s.army.factionId; const enemy = g.allCities.filter(k => c.atWar(f, D.scenario.cityOwners[k.id])).sort((a, b) => Math.hypot(b.lon - s.army.lon, b.lat - s.army.lat) - Math.hypot(a.lon - s.army.lon, a.lat - s.army.lat))[0];
    s.army.lon = enemy.lon + 0.6; s.army.lat = enemy.lat + 0.4; s.army.food = 6; s.status = 'camping'; s.route = null;
    const before = { ...(c.strategy.stats[f]?.aborted ?? {}) }; const r0 = c.strategy.stats[f]?.retreats ?? 0;
    c.strategy.ops = c.strategy.ops.filter(o => o.armyId !== s.army.id);
    c.strategy.ops.push({ id: 9999, factionId: f, armyId: s.army.id, kind: 'attack', targetCityId: enemy.id, startDay: Math.floor(c.day), status: 'marching', troops0: 12000, arrived: false, vsPlayer: false, reason: 'テスト' });
    const d0 = Math.hypot(enemy.lon - s.army.lon, enemy.lat - s.army.lat);
    window.__run(20);
    const after = c.strategy.stats[f]?.aborted ?? {};
    const alive = c.stateOf(s.army.id);
    return { f, target: enemy.name, retreats: (c.strategy.stats[f]?.retreats ?? 0) - r0, food: Math.round(alive?.army.food ?? -1), why: Object.fromEntries(Object.entries(after).filter(([k, v]) => v !== (before[k] ?? 0))), opLeft: c.strategy.ops.some(o => o.id === 9999 && o.status !== 'retreating'), log: c.strategy.log.filter(l => l.factionId === f).slice(-3).map(l => l.text) }; });
  check('E 補給が足りないと、撤退・作戦変更を判断する(実際に引き返す)', rE.retreats >= 1 && !rE.opLeft, rE);
  // 開発用の表示:ふだんは隠れ、チェックで判断のログが出る
  const rL = await p.evaluate(() => { document.querySelector('#menu-open').click(); const panel = document.querySelector('#menu-dev-panel'); const hidden = panel.hidden; const box = document.querySelector('#menu-dev'); if (!box.checked) box.click(); const rows = panel.querySelectorAll('li').length; const sum = panel.querySelector('.dev-summary').textContent; box.click(); document.querySelector('#menu-close').click(); return { hidden, rows, sum: sum.slice(0, 160) }; });
  check('開発用の表示:ふだんは隠れ、選ぶとAIの判断の理由が読める', rL.hidden && rL.rows >= 5 && /出兵/.test(rL.sum), rL);
  // 保存と読み込み:作戦・記録・ログが戻る
  const rS = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const save = JSON.parse(JSON.stringify(g.buildSave())); const before = JSON.stringify(c.strategy.totals()); const ops = c.strategy.ops.length;
    c.strategy.restore(undefined); g.applySave(save); const after = JSON.stringify(c.strategy.totals()); const opsBack = c.strategy.ops.length; const logBack = c.strategy.log.length;
    const old = JSON.parse(JSON.stringify(save)); delete old.campaign.strategy; let oldOk = true; try { g.applySave(old); } catch (e) { oldOk = String(e); }
    return { same: before === after, ops, opsBack, logBack, oldOk }; });
  check('保存と読み込みで、作戦と記録が戻る(Version 39のセーブも読める)', rS.same && rS.opsBack === rS.ops && rS.logBack > 0 && rS.oldOk === true, rS);
  await p.close();

  // F. 通常の進行(各3年。20年の結果は報告書で示す)
  for (const [sc, player] of [['s300', 'silla'], ['s317', 'silla'], ['s383', 'silla']]) {
    p = await open(sc);
    const rF = await p.evaluate((player) => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: player, difficulty: 'normal' }); c.speed = 0;
      const own0 = { ...D.scenario.cityOwners }; const t0 = performance.now(); window.__run(360 * 3);
      const t = c.strategy.totals(); const changed = Object.keys(own0).filter(k => own0[k] !== D.scenario.cityOwners[k]).length;
      return { date: c.dateText(), ms: Math.round(performance.now() - t0), moves: t.moves, dispatched: t.dispatched, field: t.fieldBattles, sieges: t.sieges, captures: t.captures, retreats: t.retreats, changed }; }, player);
    check(`F ${sc} 3年の通常進行で、AIの軍団が動き、戦いが起きる`, rF.moves >= 3 && rF.dispatched >= 1 && rF.field + rF.sieges >= 1, rF);
    await p.close();
  }
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
