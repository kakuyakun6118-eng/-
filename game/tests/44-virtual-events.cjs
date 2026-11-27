// 仮想シナリオ「炎漢再興」:条件で起こる9件の事件(一覧・条件・選択)、楚王の挙兵(進軍。瞬間移動しない)、
// 大漢皇帝即位(国号・旗・位・官職・皇室・外交を改め、人物・軍団・領土・財政・家系は維持)、皇帝生活との連動、見送りと再発動、
// 難易度で劉皓の能力が下がらないこと、セーブ互換。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1600)); if (!ok) problems.push(label); };
  const open = async (sc) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); p.on('pageerror', e => errs.push(sc + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => { window.__ly = { maxJump: 0, start: new Map(), maxFrom: 0 };
      window.__runDays = (days, pick = {}) => { const g = window.__goko, c = g.campaign, h = c.history; const d0 = c.day; let n = 0; const last = new Map();
        while (c.day - d0 < days && n++ < 3e6) {
          const aw = h.awaiting; if (aw) { const ro = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => ro[k] === c.playerFactionId) ?? Object.keys(aw.choices).find(k => ro[k]); const want = pick[aw.id]; h.choose(aw.id, (aw.choices[role].find(x => x.id === want) ?? aw.choices[role][0]).id); }
          h.queue = h.queue.filter(q => q.mode === 'decide');
          if (c.speed === 0) { for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
          c.update(0.25); const day = Math.floor(c.day);
          for (const s of c.armies) { const l = last.get(s.army.id); if (l && day > l[2]) { const km = Math.hypot((s.army.lon - l[0]) * 92, (s.army.lat - l[1]) * 111) / (day - l[2]); if (km > window.__ly.maxJump) window.__ly.maxJump = km; } if (!l || day > l[2]) last.set(s.army.id, [s.army.lon, s.army.lat, day]);
            if (s.army.factionId === 'chu') { const o = window.__ly.start.get(s.army.id) ?? [s.army.lon, s.army.lat]; window.__ly.start.set(s.army.id, o); window.__ly.maxFrom = Math.max(window.__ly.maxFrom, Math.hypot((s.army.lon - o[0]) * 92, (s.army.lat - o[1]) * 111)); } } } }; });
    return p; };
  const IDS = ['vh_sandai', 'vh_chuwang', 'vh_yingjie', 'vh_twohan', 'vh_luoyang', 'vh_changan', 'vh_emperor', 'vh_unify', 'vh_wanguo'];
  let p = await open('s304v');

  // ---------- 1. 一覧と条件 ----------
  const r1 = await p.evaluate((IDS) => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'chu' }); c.speed = 0;
    const st = Object.fromEntries(IDS.map(id => { const d = h.def(id); const s = d ? h.listState(d) : null; return [id, d ? { cond: !!d.conditional, state: s.state, why: s.reasons.slice(0, 1).join('').slice(0, 60) } : null]; }));
    // 一覧の画面に出る
    document.querySelector('#events-open')?.click();
    const rows = [...document.querySelectorAll('#events [data-id], #events .hist-row')].map(x => x.textContent).filter(t => /三代|楚王|英傑|二つの漢|洛陽奪還|長安入城|大漢皇帝|天下統一|万国来朝/.test(t)).length;
    document.querySelector('#events .events-close, #events .close')?.click();
    return { st, rows }; }, IDS);
  check('1 9件の専用事件が事件の一覧にあり、年月ではなく条件で起こる。開始時は「三代の集結」と「二つの漢」(劉淵の漢が700km以内にある)が条件を満たし、ほかは理由つきで条件未達',
    IDS.every(id => r1.st[id] && r1.st[id].cond) && r1.st.vh_sandai.state === 'available' && IDS.slice(1).filter(id => id !== 'vh_twohan').every(id => r1.st[id].state === 'unmet') && /洛陽と長安/.test(r1.st.vh_emperor.why) && r1.rows >= 9, r1);

  // ---------- 2. 三代の集結 → 楚王の挙兵(プレイヤーが選ぶ)。北上は進軍(瞬間移動しない) ----------
  const r2 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData;
    const a0 = c.armies.filter(s => s.army.factionId === 'chu').map(s => [s.army.id, s.army.lon, s.army.lat]);
    window.__runDays(110, { vh_sandai: 'oath', vh_chuwang: 'north', vh_twohan: 'ally' });
    const moved = c.armies.filter(s => s.army.factionId === 'chu').map(s => { const o = a0.find(x => x[0] === s.army.id); return o ? Math.round(Math.hypot((s.army.lon - o[1]) * 92, (s.army.lat - o[2]) * 111)) : 0; });
    return { sandai: h.records.vh_sandai.status, picks: h.records.vh_sandai.picks, chuwang: h.records.vh_chuwang.status, cp: h.records.vh_chuwang.picks, war: c.relationOf('chu', 'jin'), target: h.flags.han_target, maxMoved: Math.round(window.__ly.maxFrom), result: (h.records.vh_chuwang.result ?? '').slice(0, 60), maxJump: Math.round(window.__ly.maxJump), stab: Math.round(c.court.stability.chu) };
  });
  check('2 劉氏三代の集結(プレイヤーが「大計を定める」)→ 楚王の挙兵(「北上」)。晋と戦争になり、主力が洛陽へ進軍する(1日100km以内、瞬間移動しない)',
    r2.sandai === 'occurred' && r2.picks.f.by === 'player' && r2.chuwang === 'occurred' && r2.cp.f.choice === 'north' && r2.war === 'war' && r2.target === 'luoyang' && /洛陽へ向かった/.test(r2.result) && r2.maxMoved > 50 && r2.maxJump <= 100, r2);

  // ---------- 3. 皇帝生活は即位の前は入れない ----------
  const r3 = await p.evaluate(() => window.__goko.enterPalace());
  check('3 即位の前は、劉皓の国は皇帝生活に入れない(理由が出る)', typeof r3 === 'string' && /即位/.test(r3), r3);

  // ---------- 4. 大漢皇帝即位 ----------
  const r4 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData;
    // 条件を作る:洛陽・長安と、15都市以上を楚のものにする(テストの準備)
    for (const id of ['luoyang', 'changan', 'fengyi', 'hongnong', 'xuchang', 'xingyang', 'runan', 'shouchun', 'hefei', 'changsha', 'shangyong']) if (D.scenario.cityOwners[id] !== 'chu') { c.transferCity(id, 'chu'); g.setCityOwner(id, 'chu'); }
    c.loyalty.fame.vh_liu_hao = 100;
    const snap = () => ({ cities: c.cities.filter(k => D.scenario.cityOwners[k.id] === 'chu').length, armies: c.armies.filter(s => s.army.factionId === 'chu').length, troops: c.armies.filter(s => s.army.factionId === 'chu').reduce((n, s) => n + s.army.troops.infantry + s.army.troops.cavalry + s.army.troops.archer, 0),
      gold: Math.round(c.factionStates.chu.gold), grain: Math.round(c.factionStates.chu.grain), persons: D.persons.filter(x => x.factionId === 'chu' && c.personStatus(x.id) !== 'dead').length, family: [c.court.fatherOf('vh_liu_hao'), c.court.fatherOf('vh_liu_hao_f')].join('>') });
    const st = h.listState(h.def('vh_emperor'));
    const before = snap();
    const fired = h.fire('vh_emperor'); const res = h.choose('vh_emperor', 'crown');
    const f = D.scenario.factions.find(x => x.id === 'chu');
    const out = { can: st.can, why: st.reasons, fired, res: String(res).slice(0, 120), name: f.name, color: f.color, title: f.title, rank: c.court.rankOf('chu'), ruler: c.rulerOf('chu')?.name, haoTitle: D.persons.find(x => x.id === 'vh_liu_hao').title,
      father: D.persons.find(x => x.id === 'vh_liu_hao_f').title, office: c.economy.officeOf('vh_xun_jingming')?.name, jin: c.relationOf('chu', 'jin'), before, after: snap() };
    const sv = JSON.parse(JSON.stringify(g.buildSave())); g.applySave(sv);
    const f2 = D.scenario.factions.find(x => x.id === 'chu'); out.reload = [f2.name, f2.color, c.court.rankOf('chu'), c.rulerOf('chu')?.name];
    return out; });
  check('4a 大漢皇帝即位:洛陽・長安・15都市以上・威信の条件がそろうと選べる。国号を楚から「漢」へ、旗・皇帝の位・称号・官職(尚書令)・皇室(太上皇)・外交(晋と戦争)を改める',
    r4.can && r4.name === '漢' && r4.color === '#b3201b' && r4.rank === 'emperor' && r4.title === '皇帝' && r4.ruler === '劉皓' && r4.haoTitle === '大漢皇帝' && r4.father === '太上皇' && r4.office === '尚書令' && r4.jin === 'war', r4);
  check('4b 即位のあとも、人物・軍団・兵・領土・財政・家系はそのまま。セーブ・ロードで国号・旗・位が残る',
    JSON.stringify(r4.before) === JSON.stringify(r4.after) && r4.reload.join() === ['漢', '#b3201b', 'emperor', '劉皓'].join(), { before: r4.before, after: r4.after, reload: r4.reload });

  // ---------- 5. 皇帝生活の解禁と政治の委任 ----------
  const r5 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace; const err = g.enterPalace(); const ruler = P.ruler();
    g.palaceAdvance(4 * 30 * 2); const s = g.palace?.screen;
    return { err, ruler: ruler?.name, present: P.present().length, minors: P.present().filter(n => P.ageOf(n) < 18).length, posture: c.strategy.posture.chu?.posture, ops: c.strategy.ops.filter(o => o.factionId === 'chu').length, charm: P.charm(), screen: !!s }; });
  check('5 即位すると皇帝生活2Dモードに入れる(君主は劉皓)。政治を任された戦略AIは動き続ける。絶世の英姿で後宮の好感の上がり方1.5倍。未成年は後宮に出ない',
    r5.err === null && r5.ruler === '劉皓' && r5.present > 0 && r5.minors === 0 && !!r5.posture && r5.charm === 1.5 && r5.screen, r5);
  await p.close();

  // ---------- 6. 見送り(楚王のまま)と1年後の再発動 ----------
  p = await open('s304v');
  const r6 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; g.changeSettings({ playerFactionId: 'chu', historyMode: 'free' }); c.speed = 0;
    for (const id of ['luoyang', 'changan', 'fengyi', 'hongnong', 'xuchang', 'xingyang', 'runan', 'shouchun', 'hefei', 'changsha', 'shangyong']) if (D.scenario.cityOwners[id] !== 'chu') { c.transferCity(id, 'chu'); g.setCityOwner(id, 'chu'); }
    c.loyalty.fame.vh_liu_hao = 100;
    h.fire('vh_emperor'); h.choose('vh_emperor', 'wait');
    const s1 = h.records.vh_emperor.status, name1 = D.scenario.factions.find(x => x.id === 'chu').name;
    window.__runDays(60, { vh_sandai: 'oath', vh_chuwang: 'east' }); const s2 = h.records.vh_emperor.status;
    window.__runDays(330, { vh_sandai: 'oath', vh_chuwang: 'east', vh_emperor: 'crown', vh_yingjie: 'school' }); const s3 = h.records.vh_emperor.status;
    return { s1, name1, s2, s3, name3: D.scenario.factions.find(x => x.id === 'chu').name, own: [D.scenario.cityOwners.luoyang, D.scenario.cityOwners.changan] }; });
  check('6 「楚王のまま」を選ぶと即位は見送られ(国号は楚のまま)、1年のあいだは起きない。1年後に条件がそろっていれば、また選べる',
    r6.s1 === 'pending' && r6.name1 === '楚' && r6.s2 === 'pending' && (r6.own.every(o => o === 'chu') ? ['occurred', 'awaiting', 'branched'].includes(r6.s3) : true), r6);

  // ---------- 7. 難易度で劉皓の能力は下がらない ----------
  const r7 = await p.evaluate(() => { const g = window.__goko, D = window.__gokoData; const out = {};
    for (const d of ['easy', 'normal', 'hard']) { g.changeSettings({ difficulty: d }); const h = D.persons.find(x => x.id === 'vh_liu_hao'); out[d] = [h.leadership, h.war, h.intelligence, h.politics, h.charisma].join('/'); }
    return out; });
  check('7 難易度(やさしい・ふつう・むずかしい)を変えても、劉皓の能力値は120/115/118/115/120のまま', Object.values(r7).every(v => v === '120/115/118/115/120'), r7);

  // ---------- 8. セーブ互換(この版より前の形のセーブ) ----------
  const r8 = await p.evaluate((IDS) => { const g = window.__goko, c = g.campaign, h = c.history; const sv = JSON.parse(JSON.stringify(g.buildSave()));
    for (const id of IDS) delete sv.campaign.history.records[id];
    if (sv.campaign.dynasty) delete sv.campaign.dynasty.colors;
    let err = ''; try { g.applySave(sv); } catch (e) { err = String(e).slice(0, 200); }
    window.__runDays(30);
    return { err, recs: IDS.map(id => h.records[id]?.status) }; }, IDS);
  check('8 事件の記録や旗の色のない、前の形のセーブを読み込んでもエラーなく続けられ、専用事件は未発生として扱われる(条件の事件は過去扱いにしない)', !r8.err && r8.recs.every(s => !!s && s !== 'past'), r8);
  await p.close();

  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
})();
