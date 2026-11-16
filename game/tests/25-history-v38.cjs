// 歴史の事件の拡充(Version 38):予定年月の提示・人物の登場・生まれていない人や故人を出さない・選択による違い・
// 3D会戦との連動・AIの集結・戦争を止めない・連鎖・二重発生の防止・保存と互換・既存の仕組み・戦略マップ表示・事件の一覧
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  const open = async (sc) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 900)); if (!ok) problems.push(label); };
  const advance = `(until) => { const c = window.__goko.campaign; let n = 0; while (n++ < 600) { const { year, month } = c.calendar(); if (year * 12 + month >= until) break; c.day += 30; c.history.monthly(); } }`;
  const sim = `(days) => { const c = window.__goko.campaign; c.speed = 8; const d0 = c.day; let n = 0; while (c.day - d0 < days && n++ < 300000) { if (c.speed === 0) { const ev = c.events.find(e => e.status === 'pending'); if (ev) c.setEventStatus(ev.battleId, 'cancelled'); for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; c.speed = 8; } c.update(0.25); } c.speed = 0; }`;

  // 1. 事件の数と、予定年月の提示(317年開始・330年まで)
  let p = await open('s317');
  const r1 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    (${advance})(330 * 12 + 1);
    const due = h.defs.filter(d => d.year * 12 + d.month <= 330 * 12 && d.year * 12 + d.month >= 317 * 12 + 3);
    const bad = due.filter(d => h.records[d.id].status === 'pending' || !String(h.records[d.id].date).startsWith(d.year + '年' + d.month + '月'));
    const three = h.defs.filter(d => Object.values(d.choices).some(cs => cs.length < 3)).map(d => d.id);
    return { total: h.defs.length, due: due.length, bad: bad.map(d => d.id + ':' + h.records[d.id].date), three }; })()`);
  check('1 主要な事件が予定の年月に示される(50件以上・選択肢は3つ以上)', r1.total >= 50 && r1.due >= 10 && r1.bad.length === 0 && r1.three.length === 0, r1);
  await p.close();

  // 2・4. 304年開始:石勒・王弥が史実の年に漢に加わり、永嘉の乱に登場する。故人は戻らない
  p = await open('s304');
  const r2 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    c.dieNaturally('liu_yao');
    (${advance})(309 * 12 + 1);
    const le = D.persons.find(x => x.id === 'shi_le'), mi = D.persons.find(x => x.id === 'wang_mi');
    const yaoCount = D.persons.filter(x => x.id === 'liu_yao').length;
    const leArmy = c.armies.find(s => s.army.commanderId === 'shi_le');
    const tl = h.timeline.filter(t => /加わる/.test(t.text)).map(t => t.date + ' ' + t.text.slice(0, 30));
    return { le: le && le.factionId, mi: mi && mi.factionId, han: c.history.ctx().c.rulerOf(le?.factionId)?.name, leArmy: leArmy && leArmy.army.name, yaoCount, yaoState: c.personStatus('liu_yao'), tl }; })()`);
  check('2 関係人物が史実の年に登場する(石勒・王弥が漢へ)', r2.le === 'han_zhao' && r2.mi === 'han_zhao' && !!r2.leArmy && r2.tl.length >= 2, r2);
  check('4 亡くなった人物は戻らない', r2.yaoCount === 1 && r2.yaoState === 'dead', r2);

  // 3. 生まれていない人物が出ない(8つのシナリオの開始時と、304年開始で15年進めたあと)
  const r3 = await p.evaluate(`(() => { const c = window.__goko.campaign, D = window.__gokoData; (${advance})(320 * 12 + 1);
    const y = c.calendar().year; const unborn = D.persons.filter(x => !x.fictional && x.born !== null && x.born > y).map(x => x.id);
    const fromJoins = D.persons.filter(x => c.court.added.includes(x) && !x.fictional && x.born !== null && (y - x.born) < 0).map(x => x.id);
    return { y, unborn, fromJoins }; })()`);
  await p.close();
  const starts = [];
  for (const sc of ['s300', 's311', 's319', 's329', 's357', 's383']) {
    p = await open(sc);
    starts.push(await p.evaluate(() => { const D = window.__gokoData; const y = D.scenario.year; return { sc: D.scenario.id, unborn: D.persons.filter(x => !x.fictional && x.born !== null && x.born > y).map(x => x.id), dead: D.persons.filter(x => x.died !== null && x.died < y).map(x => x.id) }; }));
    await p.close();
  }
  check('3 生まれていない人物・開始前の故人が出ない', r3.unborn.length === 0 && starts.every(s => s.unborn.length === 0 && s.dead.length === 0), { r3, starts });

  // 5. 選択で結果が変わる(318年 東晋の成立:即位と王氏の抑制)
  const outcome = async (choice) => { const q = await open('s317'); const r = await q.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'jin' }); c.speed = 0; const L = c.loyalty;
      const before = { dun: Math.round(L.loyalty.wang_dun), rank: c.court.rankOf('jin') }; (${advance})(318 * 12 + 3); const t = h.choose('dongjin318', '${choice}');
      return { t, before, after: { dun: Math.round(L.loyalty.wang_dun), rank: c.court.rankOf('jin'), stab: Math.round(c.court.stability.jin) } }; })()`); await q.close(); return r; };
  const c5a = await outcome('crown'); const c5b = await outcome('curb');
  check('5 選択によって結果が変わる', c5a.after.rank === 'emperor' && c5b.after.rank !== 'emperor' && c5b.after.dun < c5a.after.dun - 20, { c5a, c5b });

  // 6. 重要な会戦が3Dの会戦と連動する(永嘉の乱:西晋を操作。漢が総攻撃すれば洛陽の攻城戦)
  p = await open('s304');
  const r6 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'jin' }); c.speed = 0; c.setRelation('jin', 'han_zhao', 'war');
    let n = 0; while (n++ < 200) { (${advance})(311 * 12 + 6); const a = h.awaiting; if (!a || a.id === 'yongjia311') break; const roles0 = a.roles(h.ctx()); const role0 = Object.keys(a.choices).find(k => roles0[k] === 'jin'); h.choose(a.id, a.choices[role0][1].id); }
    (${advance})(311 * 12 + 6);
    const aw = h.awaiting && h.awaiting.id; const def = h.def('yongjia311'); const roles = def.roles(h.ctx());
    h.aiPick = (d, rr, role) => role === 'han' ? 'storm' : d.choices[role][0].id;
    const ha = h.largestArmy(roles.han); if (ha) { ha.army.lon = 112.4; ha.army.lat = 34.8; }
    const text = h.choose('yongjia311', 'stay');
    const ev = c.events.find(e => e.histId === 'yongjia311'); const setup = ev ? window.__gokoSetup(ev) : null;
    return { aw, text, ev: ev && { type: ev.battleType, status: ev.status, city: ev.defenderCityId }, setup: setup && { att: setup.attacker.name, def: setup.defender.name, wall: !!setup.defender.fortification }, tags: h.tags.length, prep: !document.querySelector('#event-open').hidden }; })()`);
  check('6 重要な会戦が3Dの会戦と連動する(洛陽の攻城戦)', r6.aw === 'yongjia311' && ((r6.ev && r6.ev.type === 'siege_battle' && r6.ev.city === 'luoyang' && r6.setup && r6.prep) || r6.tags > 0), r6);
  await p.close();

  // 7・8. AIは事件の前に主力を集結させ、戦争は止めない(383年:淝水の前)
  p = await open('s383');
  const r7 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    const st = h.stagingFor('qianqin'); const top = () => c.armies.filter(s => s.army.factionId === 'qianqin').sort((a, b) => (b.army.troops.infantry + b.army.troops.cavalry + b.army.troops.archer) - (a.army.troops.infantry + a.army.troops.cavalry + a.army.troops.archer)).slice(0, 2);
    const dist = () => top().map(s => Math.round(Math.hypot(s.army.lon - st.lon, s.army.lat - st.lat) * 100) / 100);
    const d0 = dist(); (${sim})(70); const d1 = dist();
    const fights = c.events.filter(e => e.status === 'completed' && [e.attackerFactionId, e.defenderFactionId].includes('qianqin') && [e.attackerFactionId, e.defenderFactionId].includes('jin')).length;
    const marching = c.armies.filter(s => s.army.factionId === 'qianqin' && s.targetCityId && window.__gokoData.scenario.cityOwners[s.targetCityId] === 'jin').length;
    return { stage: st && st.city, d0, d1, prep: h.prep['feishui383|qianqin'], prepJin: h.prep['feishui383|jin'], fights, marching, restrained: typeof h.restrained, atWar: c.atWar('qianqin', 'jin') }; })()`);
  check('7 AIが事件の前に軍団を集結させる(兵糧・防備・偵察も)', !!r7.stage && (r7.d1[0] < r7.d0[0] || r7.d1[0] < 1) && (r7.prep || []).some(t => /集結/.test(t)) && (r7.prep || []).some(t => /偵察|防備/.test(t)), r7);
  check('8 AIが戦争を止めない', r7.restrained === 'undefined' && r7.atWar && (r7.fights > 0 || r7.marching > 0), r7);
  await p.close();

  // 9. 史実と違う結果が後の事件に反映される(慕容垂が前燕に留まれば、384年の後燕は生まれない)
  p = await open('s357');
  const r9 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    const d = h.def('chui369'); const x = h.ctx(); const roles = d.roles(x); const t = d.apply(x, roles, { yan: 'trust' });
    const s = h.def('split384'); const qin = s.roles(x); h.flags.feishui_winner = 'jin'; const ready = s.ready(x, qin);
    return { t, flag: h.flags.chui_stayed, ready, chui: window.__gokoData.persons.find(p => p.id === 'murong_chui').factionId }; })()`);
  check('9 史実と違う結果が後の事件に反映される', r9.flag === '1' && typeof r9.ready === 'string' && /369年の選択|前秦にいない|身を寄せて/.test(r9.ready), r9);
  await p.close();

  // 10. 同じ事件を二重に起こさない(劉聡がすでに即位していれば310年の政変は起こさない。宮廷の表と事件の重複も防ぐ)
  p = await open('s304');
  const r10 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    const r = c.rulerOf('han_zhao'); c.usurp('han_zhao', r, D.persons.find(x => x.id === 'liu_cong'));
    (${advance})(310 * 12 + 8);
    return { liucong: h.records.liucong310.status, covered: ['liu_cong', 'zhang_zuo', 'huan_xuan2', 'shi_hu'].every(id => h.coveredUsurpers.has(id)), dup: h.records.liucong310.result }; })()`);
  check('10 同じ事件を二重に起こさない', r10.liucong === 'duplicate' && r10.covered, r10);

  // 11・12. 保存と互換(事件の状態・準備行動・進軍中の印)
  const r11 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const s = JSON.parse(JSON.stringify(g.buildSave())); c.history.tags.push({ a: 'x', histId: 'zuti319', until: 99999 }); const s2 = JSON.parse(JSON.stringify(g.buildSave())); const a = JSON.stringify(c.history.serialize());
    c.history.flags = {}; c.history.tags = []; c.history.records.liucong310.status = 'pending'; g.applySave(s2); const b2 = JSON.stringify(c.history.serialize());
    const old = JSON.parse(JSON.stringify(s)); delete old.campaign.history.tags; delete old.campaign.history.prep; let err = null; try { g.applySave(old); } catch (e) { err = String(e); }
    return { same: a === b2, err, liucong: c.history.records.liucong310.status }; });
  check('11 セーブ・ロードで事件の状態が戻る', r11.same, r11);
  check('12 古いセーブとの互換', !r11.err && r11.liucong === 'duplicate', r11);

  // 13. 既存の滅亡・独立・宮廷・外交・経済
  const r13 = await p.evaluate(() => { const c = window.__goko.campaign, D = window.__gokoData; const rep = c.economy.report('jin');
    const f = D.scenario.factions.find(x => !x.passive && !x.fallen && x.id !== 'jin' && x.id !== 'han_zhao' && c.rulerOf(x.id)); const n0 = D.scenario.factions.filter(x => x.fallen).length; c.fallFaction(f.id, c.rulerOf(f.id), 'jin');
    const gen = D.persons.find(x => x.factionId === 'jin' && x.role === 'general' && c.personStatus(x.id) === 'active' && c.postOf(x.id)?.kind === 'city'); const sec = gen ? c.secede(gen.id) : false;
    return { income: rep.income.total, fallen: D.scenario.factions.filter(x => x.fallen).length - n0, sec, order: c.court.successionOrder('jin').length, odds: c.diplo.odds('jin', 'han_zhao', 'peace').p }; });
  check('13 既存の滅亡・独立・宮廷・外交・経済が動く', r13.income > 0 && r13.fallen === 1 && r13.order > 0 && r13.odds >= 0, r13);
  await p.close();

  // PC:戦略マップでの位置表示(淝水:東晋を操作)と、事件の一覧
  p = await open('s383');
  const ui = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'jin' }); c.speed = 0;
    (${advance})(383 * 12 + 11);
    document.querySelector('.hist-focus').click();
    const box = document.querySelector('#history-event'); const legend = box.querySelector('.hist-legend')?.textContent ?? '';
    return { mapmode: box.classList.contains('hist-mapmode'), legend: legend.slice(0, 160), routes: g.histRoutes.filter(r => r.group.visible).length, marks: g.histMarks.children.length }; })()`);
  await p.screenshot({ path: out + '/pc-history-map.png' });
  check('PC 戦略マップに戦場・関係都市・進軍経路を出す', ui.mapmode && ui.routes >= 1 && ui.marks >= 4 && /戦場/.test(ui.legend), ui);
  const list = await p.evaluate(() => { document.querySelector('.hist-back').click(); document.querySelector('#history-event').hidden = true; document.querySelector('#timeline-open').click(); document.querySelector('.tl-tab[data-tab="list"]').click();
    const rows = document.querySelectorAll('#timeline .ev-table tr').length - 1; const heads = [...document.querySelectorAll('#timeline .ev-table th')].map(x => x.textContent);
    const tiny = [...document.querySelectorAll('#timeline *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10.5).length;
    return { rows, heads, sum: document.querySelector('.ev-sum').textContent, tiny }; });
  await p.screenshot({ path: out + '/pc-event-list.png' });
  check('PC 歴史の事件の一覧', list.rows >= 50 && ['年月', '事件', '発生の条件', '関係人物', '史実の結果', 'このゲームの結果', '状態'].every(h => list.heads.includes(h)) && list.tiny === 0, list);
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
