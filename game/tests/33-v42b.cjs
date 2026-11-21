// Version 42 追加修正:プレイヤーの戦う側(攻城側・守城側・野戦の攻撃側・防衛側)・戦闘のスキップ(開始前・途中)・
// 永嘉の乱(洛陽の陥落と懐帝の捕縛、守り切った場合・懐帝がいない場合の分岐、西晋の存続、セーブ・ロード)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sc, vp = { width: 1280, height: 800 }) => { const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + (sc ? '#s=' + sc : '')); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1400)); if (!ok) problems.push(label); };
  // 共通の道具:都市を攻める・野戦をしかける(プレイヤーの国が関わるので、準備画面が開く)
  const helpers = () => { window.__h = {
    city: (f) => window.__goko.allCities.find(k => k.kind !== 'pass' && window.__gokoData.scenario.cityOwners[k.id] === f),
    army: (f) => window.__goko.campaign.armies.find(x => x.army.factionId === f && x.status !== 'fighting'),
    near: (s, k, d = 0.05) => { s.army.lon = k.lon + d; s.army.lat = k.lat - 0.25; s.status = 'camping'; s.route = null; },
    siege: (att, city) => { const c = window.__goko.campaign; const n = c.events.length; c.startSiegeAt(att, city, ''); return c.events[n]; },
    field: (a, d) => { const c = window.__goko.campaign; d.army.lon = a.army.lon + 0.1; d.army.lat = a.army.lat; d.status = 'camping'; d.route = null; const n = c.events.length; c.startEvent(a, 'field_battle', d, null); return c.events[n]; },
  }; };

  // 1. 戦う側:東晋でプレイ。前趙が東晋の都市を攻める → 守城側。東晋が攻める → 攻城側。野戦の攻撃側・防衛側。AIどうしは自動
  let p = await open('s317');
  await p.evaluate(helpers);
  const r1 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, H = window.__h; c.speed = 0; g.changeSettings({ playerFactionId: 'jin' });
    c.setRelation('jin', 'han_zhao', 'war'); const out = {};
    const roleOf = () => ({ roles: document.querySelector('.battle-roles').textContent, cmd: document.querySelector('.battle-command').textContent, locked: document.querySelector('.battle-command').disabled });
    const tryCase = (key, mk) => { const ev = mk(); if (!ev) { out[key] = 'no event'; return; } g.openBattlePrep(ev.battleId); const v = roleOf(); g.closeBattlePrep?.(); g['closeBattlePrep'](); out[key] = { ...v, ev: ev.battleId }; ev.status = 'cancelled'; for (const s of c.armies) if (s.status === 'fighting') s.status = 'camping'; };
    // (a) 前趙が東晋の都市を攻める
    tryCase('a', () => { const k = H.city('jin'); const s = H.army('han_zhao'); H.near(s, k); return H.siege(s, k); });
    // (b) 東晋が前趙の都市を攻める
    tryCase('b', () => { const k = H.city('han_zhao'); const s = H.army('jin'); H.near(s, k); return H.siege(s, k); });
    // (c) 東晋が野戦をしかける / (d) 前趙が東晋に野戦をしかける
    tryCase('c', () => H.field(H.army('jin'), H.army('han_zhao')));
    tryCase('d', () => H.field(H.army('han_zhao'), H.army('jin')));
    // (e) AIどうし(前趙と石勒)の攻城戦:準備画面は開かず、自動で処理される
    c.setRelation('shile', 'han_zhao', 'war'); const k5 = H.city('shile'); const s5 = H.army('han_zhao'); H.near(s5, k5); const before = c.events.length; c.startSiegeAt(s5, k5, ''); const ev5 = c.events[before];
    out.e = { prepOpen: !document.querySelector('#battle').hidden, status: ev5?.status, auto: ev5?.autoSiegeUntil !== undefined || ev5?.status === 'completed' };
    return out; });
  check('1 戦う側:前趙が東晋の都市を攻めると守城側、東晋が攻めると攻城側、野戦は仕掛けた側が攻撃側。通常は敵の側に切り替えられない。AIどうしは自動',
    /防衛側:晋\(東晋\)\(プレイヤー\)/.test(r1.a.roles) && /守城側/.test(r1.a.cmd) && r1.a.locked && /攻撃側:晋\(東晋\)\(プレイヤー\)/.test(r1.b.roles) && /攻城側/.test(r1.b.cmd) && /攻撃側:晋\(東晋\)\(プレイヤー\)/.test(r1.c.roles) && /防衛側:晋\(東晋\)\(プレイヤー\)/.test(r1.d.roles) && /防衛側/.test(r1.d.cmd) && !r1.e.prepOpen && r1.e.auto, r1);

  // 1b. 守城側で3Dの攻城戦を始める:防衛側を指揮し、前趙の部隊は選べない。直接「攻撃側で」と頼んでも、守城側になる
  const r1b = await p.evaluate(() => { const g = window.__goko, c = g.campaign, H = window.__h; const k = H.city('jin'); const s = c.armies.find(x => x.army.factionId === 'han_zhao'); H.near(s, k); const ev = H.siege(s, k); window.__ev1b = ev.battleId; g.openBattlePrep(ev.battleId); g.startBattle('attacker'); return ev.battleId; });
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 90000 }); await p.waitForTimeout(500);
  const r1c = await p.evaluate(() => { const g = window.__goko, bt = g.battle, s = bt.sim; const enemy = s.units.find(u => u.side === 'attacker'); bt.tapOwnUnit?.(enemy.id); const selEnemy = (bt.selectedIds ?? []).includes(enemy.id);
    const names = [...document.querySelectorAll('.hud-side-name')].map(x => x.textContent); const chipsDisabled = [...document.querySelectorAll('.hud-list.attacker .hud-chip')].every(x => x.disabled);
    const siegeDef = [...document.querySelectorAll('.siege-def')].filter(x => !x.hidden).length;
    return { side: s.playerSide, selEnemy, names, chipsDisabled, siegeDef }; });
  check('1b 守城側の攻城戦:防衛側を指揮し(守る側の命令が出る)、前趙(攻撃側)の部隊は選べない。名前に(あなた)と(AI)', r1c.side === 'defender' && !r1c.selEnemy && r1c.chipsDisabled && r1c.siegeDef === 4 && r1c.names.some(n => /あなた/.test(n)), r1c);

  // 2. 途中のスキップ:30秒戦ってから「残りをスキップ」。続きから計算し(開始時に戻さない)、結果は一度だけ反映される
  const r2 = await p.evaluate(async () => { const g = window.__goko, bt = g.battle, s = bt.sim; for (let i = 0; i < 300; i++) s.update(0.1);
    const t0 = s.time; const men0 = s.units.reduce((a, u) => a + u.men, 0); const hp0 = s.siege.layout.segments.reduce((a, k) => a + k.hp, 0);
    document.querySelector('.hud-skip').click(); const confirmShown = !document.querySelector('.hud-confirm').hidden; document.querySelector('.hud-confirm-yes').click();
    const res = s.result; const t1 = s.time; const men1 = s.units.reduce((a, u) => a + u.men, 0);
    const ev = g.campaign.eventOf(window.__ev1b); g.finishBattle(res); const st1 = ev.status;
    const owner1 = window.__gokoData.scenario.cityOwners[ev.defenderCityId];
    const att = g.campaign.stateOf(ev.attackerArmyId); const troops1 = att ? JSON.stringify(att.army.troops) : 'none';
    g.campaign.applyBattleResult(res); const troops2 = att && g.campaign.stateOf(ev.attackerArmyId) ? JSON.stringify(g.campaign.stateOf(ev.attackerArmyId).army.troops) : 'none';
    return { confirmShown, hasResult: !!res, t0: Math.round(t0), t1: Math.round(t1), men0: Math.round(men0), men1: Math.round(men1), hp0: Math.round(hp0), status: st1, owner1, twice: troops1 === troops2, inBattle: !!document.querySelector('.in-battle') }; });
  check('2 戦闘の途中のスキップ:確認ののち、いまの状態から続けて決着し(時刻は進み、兵は開始時より少ない)、結果は一度だけ反映される', r2.confirmShown && r2.hasResult && r2.t1 > r2.t0 && r2.men1 <= r2.men0 && r2.status === 'completed' && r2.twice && !r2.inBattle, r2);
  await p.close();

  // 3. 開始前のスキップと自動戦闘:野戦・攻城戦・救援軍あり・首都の攻城戦。結果が軍団・都市に反映され、二重に反映されない。セーブ・ロード後も残る
  p = await open('s317');
  await p.evaluate(helpers);
  const r3 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, H = window.__h, D = window.__gokoData; c.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); c.setRelation('jin', 'han_zhao', 'war');
    const out = {};
    // (a) 野戦の開始前スキップ
    const a = H.army('jin'), d = H.army('han_zhao'); const ta = JSON.stringify(a.army.troops); const ev = H.field(a, d); g.openBattlePrep(ev.battleId); document.querySelector('.battle-skip').click();
    out.a = { status: ev.status, changed: !c.stateOf(a.army.id) || JSON.stringify(c.stateOf(a.army.id).army.troops) !== ta, prepHidden: document.querySelector('#battle').hidden };
    // (b) 首都の攻城戦を自動戦闘で(救援軍つき)
    const cap = c.capitalCityOf('jin'); c.cityStates[cap.id] = { ...c.cityState(cap), garrison: 800 };
    const r = c.raiseArmy(cap.id, 400); const relief = typeof r === 'string' ? null : r; if (relief) { relief.army.lon = cap.lon + 0.3; relief.army.lat = cap.lat; relief.status = 'camping'; }
    c.cityStates[cap.id] = { ...c.cityState(cap), garrison: 600 };
    const s2 = c.armies.find(x => x.army.factionId === 'han_zhao' && x.status !== 'fighting') ?? d; s2.army.troops = { infantry: 60000, cavalry: 20000, archer: 15000 }; H.near(s2, cap);
    const ev2 = H.siege(s2, cap); g.openBattlePrep(ev2.battleId); document.querySelector('.battle-auto').click();
    out.b = { status: ev2.status, owner: D.scenario.cityOwners[cap.id], relief: (ev2.supporters ?? []).filter(x => x.relief).length, notice: document.querySelector('#event-text').textContent.slice(0, 80), capLog: c.capitalLog.filter(l => l.battleId === ev2.battleId).length };
    // (c) 二重に反映されない:同じ結果をもう一度
    const owners = JSON.stringify(D.scenario.cityOwners); c.applyBattleResult({ ...ev2.record, battleId: ev2.battleId, sides: { attacker: {}, defender: {} } }); out.c = { same: JSON.stringify(D.scenario.cityOwners) === owners };
    // (d) セーブ・ロード後も
    const sv = g.buildSave(); g.applySave(JSON.parse(JSON.stringify(sv))); out.d = { owner: D.scenario.cityOwners[cap.id], status: c.eventOf(ev2.battleId)?.status };
    return out; });
  check('3 開始前のスキップ・自動戦闘:野戦と首都の攻城戦(救援軍つき)の結果が反映され、二重に反映されず、セーブ・ロード後も残る', r3.a.status === 'completed' && r3.a.changed && r3.a.prepHidden && r3.b.status === 'completed' && /自動戦闘の結果/.test(r3.b.notice) && r3.c.same && r3.d.owner === r3.b.owner && r3.d.status === 'completed', r3);
  // 3b. セーブ・ロード:戦闘の準備中に保存して読み込むと、準備画面に戻り、陣営は正しい(東晋が残っている新しいページで)
  await p.close();
  p = await open('s317');
  await p.evaluate(helpers);
  const r3b = await p.evaluate(() => { window.__goko.changeSettings({ playerFactionId: 'jin' }); window.__goko.campaign.setRelation('jin', 'han_zhao', 'war'); const g = window.__goko, c = g.campaign, H = window.__h; for (const e of c.events) if (e.status === 'pending' || e.status === 'in_progress') e.status = 'cancelled'; for (const x of c.armies) if (x.status === 'fighting') x.status = 'camping';
    if (!c.armies.some(x => x.army.factionId === 'han_zhao')) { const hk = H.city('han_zhao'); c.cityStates[hk.id] = { ...c.cityState(hk), garrison: c.cityState(hk).garrison + 8000 }; c.raiseArmy(hk.id, 5000); }
    const k = H.city('jin'); const s = c.armies.find(x => x.army.factionId === 'han_zhao' && x.status !== 'fighting'); if (!k || !s) return { skip: true, k: !!k, s: !!s, han: c.armies.filter(x => x.army.factionId === 'han_zhao').map(x => x.status), jinCities: c.cities.filter(x => window.__gokoData.scenario.cityOwners[x.id] === 'jin').length }; H.near(s, k); const ev = H.siege(s, k); g.openBattlePrep(ev.battleId);
    const sv = g.buildSave(); g.applySave(JSON.parse(JSON.stringify(sv))); return { open: !document.querySelector('#battle').hidden, cmd: document.querySelector('.battle-command').textContent, active: sv.activeBattle }; });
  check('3b セーブ・ロード:戦闘の準備中に保存して読み込んでも、守城側のまま', !r3b.skip && r3b.open && /守城側/.test(r3b.cmd), r3b);
  await p.close();

  // 4. 永嘉の乱:懐帝(司馬熾)が洛陽にいるとき、漢が洛陽を落とす → 洛陽は漢のもの・懐帝は捕虜・西晋は後継者が継いで続く・年表と地図
  const yongjia = async (variant) => {
    const pg = await open('s304');
    const r = await pg.evaluate((variant) => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; c.speed = 0; g.changeSettings({ playerFactionId: null, historyMode: 'free' });
      // 304年の状態から、恵帝が退き懐帝が洛陽で即位した311年の状況を作る
      const hui = c.rulerOf('jin'); const chi = D.persons.find(x => x.id === 'sima_chi'); c.replaceRuler('jin', hui, chi);
      const lu = c.cities.find(k => k.id === 'luoyang'); c.moveCapital('jin', 'luoyang', '試験');
      c.placement.moveTo(chi.id, variant === 'absent' ? 'changan' : 'luoyang', 'court', '試験'); if (c.postOf(chi.id)) c.cityStates[c.postOf(chi.id).id] = { ...c.cityState(c.cities.find(k => k.id === c.postOf(chi.id).id)), governorId: null };
      c.setRelation('jin', 'han_zhao', 'war');
      const han = c.armies.filter(x => x.army.factionId === 'han_zhao').sort((x, y) => (y.army.troops.infantry + y.army.troops.cavalry) - (x.army.troops.infantry + x.army.troops.cavalry))[0];
      han.army.lon = lu.lon - 0.15; han.army.lat = lu.lat; han.status = 'camping'; han.route = null;
      han.army.troops = variant === 'held' ? { infantry: 800, cavalry: 0, archer: 0 } : { infantry: 70000, cavalry: 25000, archer: 15000 };
      if (variant === 'held') c.cityStates.luoyang = { ...c.cityState(lu), garrison: 40000 };
      const d = h.def('yongjia311'); const n = c.events.length;
      h.records[d.id].status = 'awaiting'; h['resolve'](d, { jin: 'stay', han: 'storm' });
      const ev = c.events.slice(n).find(e => e.histId === 'yongjia311');
      if (!ev) return { noBattle: true, result: h.records[d.id].result };
      g.openBattlePrep(ev.battleId); document.querySelector('.battle-skip').click();
      const rec = h.records[d.id];
      const jinF = D.scenario.factions.find(f => f.id === 'jin');
      const marker = g.cities.markers.find(m => m.city.id === 'luoyang');
      const out = { owner: D.scenario.cityOwners.luoyang, mapFaction: marker?.faction?.id, chi: c.personStatus('sima_chi'), chiLoc: c.placement.locationOf('sima_chi').label, holder: c.spoils.custodyOf?.('sima_chi')?.holder ?? c.spoils.custody.find(x => x.personId === 'sima_chi')?.holder,
        jinFallen: !!jinF.fallen, jinRuler: c.rulerOf('jin')?.name, chiCommands: c.armies.some(s => s.army.commanderId === 'sima_chi'), status: rec.status, result: (rec.result ?? '').slice(-140),
        timeline: h.timeline.filter(t => t.eventId === 'yongjia311').map(t => t.text.slice(0, 60)), capLog: c.capitalLog.filter(l => l.cityId === 'luoyang').map(l => ({ at: l.rulerAtCapital, cap: l.captured, fell: l.fell, surv: l.survived })), hanName: D.scenario.factions.find(f => f.id === 'han_zhao').name };
      const sv = g.buildSave(); g.applySave(JSON.parse(JSON.stringify(sv)));
      out.afterLoad = { owner: D.scenario.cityOwners.luoyang, chi: c.personStatus('sima_chi'), status: h.records.yongjia311.status };
      return out; }, variant);
    await pg.close(); return r; };
  const y1 = await yongjia('historic');
  check('4 永嘉の乱(史実):洛陽は漢のものになり(地図も)、懐帝は漢の捕虜、軍団を率いない。西晋は後継者が継いで続く。年表に残り、セーブ・ロード後も同じ',
    y1.owner === 'han_zhao' && y1.mapFaction === 'han_zhao' && y1.chi === 'captured' && y1.holder === 'han_zhao' && !y1.chiCommands && !y1.jinFallen && y1.jinRuler && y1.jinRuler !== '司馬熾' && y1.status === 'occurred' && y1.timeline.length >= 1 && y1.afterLoad.owner === 'han_zhao' && y1.afterLoad.chi === 'captured', y1);
  const y2 = await yongjia('held');
  check('4b 永嘉の乱(西晋が守り切る):洛陽は西晋のまま、懐帝は捕らえられず、事件は「分岐」として記録', y2.owner === 'jin' && y2.chi === 'active' && y2.status === 'branched' && /分岐/.test(y2.result), y2);
  const y3 = await yongjia('absent');
  check('4c 永嘉の乱(懐帝が長安にいた):洛陽は落ちても、懐帝を瞬間移動させて捕らえない。差は「分岐」として記録', y3.owner === 'han_zhao' && y3.chi === 'active' && /いなかった/.test(y3.result) && y3.status === 'branched', y3);

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
