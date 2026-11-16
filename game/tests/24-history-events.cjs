// 歴史の重大事件(Version 37):提示の保証・史実の発生・分岐・選択・影響・後続への反映・永嘉の乱・淝水の戦いと3D会戦・
// 前秦の勝利・二重発生の防止・年表・保存と互換・既存の仕組み・PCの事件画面と年表
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  const open = async (sc) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 900)); if (!ok) problems.push(label); };
  // 月を進めて、歴史の事件だけを調べる(ほかの仕組みは動かさない)
  const advance = `(until) => { const c = window.__goko.campaign; let n = 0; while (n++ < 400) { const { year, month } = c.calendar(); if (year * 12 + month >= until) break; c.day += 30; c.history.monthly(); } }`;

  // 1・2. 317年:318年3月の東晋の成立が必ず示され、条件がそろって史実として起こる(プレイヤーは関係しない国)
  let p = await open('s317');
  const r1 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    (${advance})(320 * 12 + 1);
    const now = c.calendar(); const due = h.defs.filter(d => d.year * 12 + d.month <= now.year * 12 + now.month);
    const r = h.records.dongjin318;
    return { date: c.dateText(), due: due.map(d => d.id + ':' + h.records[d.id].status), pendingDue: due.filter(d => h.records[d.id].status === 'pending').length, dongjin: r, queued: h.queue.map(q => q.id + ':' + q.mode), rank: c.court.rankOf('jin') }; })()`);
  check('1 重大事件が該当年に必ず示される', r1.pendingDue === 0 && r1.due.length >= 3 && r1.queued.some(q => q.startsWith('dongjin318')), r1);
  check('2 史実の条件がそろえば起こる', r1.dongjin.ready === true && Object.keys(r1.dongjin.picks).length === 1 && ['occurred', 'branched'].includes(r1.dongjin.status), r1.dongjin);

  // 11. 二重発生の防止:石虎がすでに即位していれば334年の簒奪は再実行しない。宮廷の簒奪の表も、事件の扱う人物は起こさない
  const r11 = await p.evaluate(`(() => { const c = window.__goko.campaign, h = c.history, D = window.__gokoData;
    const shi = D.persons.find(x => x.id === 'shi_le').factionId; const le = c.rulerOf(shi); c.usurp(shi, le, D.persons.find(x => x.id === 'shi_hu'));
    (${advance})(335 * 12 + 1);
    const covered = c.history.coveredUsurpers.has('shi_hu');
    return { shihu: h.records.shihu334.status, result: h.records.shihu334.result, ruler: c.rulerOf(shi)?.name, covered, usurpCount: c.court.counts.usurpations }; })()`);
  check('11 簒奪・滅亡を二重に起こさない', r11.shihu === 'duplicate' && r11.ruler === '石虎' && r11.covered, r11);
  await p.close();

  // 7. 永嘉の乱が311年に示される(304年開始)/ 6. 史実と違う選択が後続の事件に反映される
  p = await open('s304');
  const r7 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    (${advance})(311 * 12 + 6);
    const r = h.records.yongjia311;
    const d = h.def('changan316'); const x = h.ctx(); h.flags.luoyang_held = '1'; const ready = d.ready(x, d.roles(x));
    delete h.flags.luoyang_held;
    return { date: c.dateText(), status: r.status, recDate: r.date, picks: r.picks, result: r.result, han304: h.records.han304.status, ready316: ready }; })()`);
  check('7 永嘉の乱が311年に示される', r7.status !== 'pending' && /311年6月/.test(r7.recDate) && r7.han304 === 'past', r7);
  check('6 史実と違う選択が後続の事件に反映される', typeof r7.ready316 === 'string' && /洛陽を守り切った/.test(r7.ready316), r7.ready316);
  await p.close();

  // 3. 条件がそろわなければ「歴史の分岐」として示す(383年:前秦と東晋を和平させてから11月を迎える)
  p = await open('s383');
  const r3 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    c.setRelation('qianqin', 'jin', 'neutral'); const armies = c.armies.length; (${advance})(383 * 12 + 11);
    const r = h.records.feishui383; return { status: r.status, ready: r.ready, result: r.result, armies: [armies, c.armies.length], battles: c.events.filter(e => e.histId === 'feishui383').length }; })()`);
  check('3 条件がそろわなければ歴史の分岐として示す(軍団を出現させない)', r3.status === 'branched' && r3.ready === false && /史実では/.test(r3.result) && r3.armies[0] === r3.armies[1] && r3.battles === 0, r3);
  await p.close();

  // 4・5・8・9. 東晋を操作:淝水の戦いが383年11月に示され、選択でき、謝玄が指揮して、3D会戦の準備に進める
  p = await open('s383');
  const r4 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'jin' }); c.speed = 0;
    (${advance})(383 * 12 + 11);
    const aw = h.awaiting; const shown = !document.querySelector('#history-event').hidden; const box = document.querySelector('#history-event .hist-inner');
    const ui = { critical: box.classList.contains('hist-critical'), choices: [...document.querySelectorAll('#history-event .hist-choice')].map(x => x.dataset.kind), persons: document.querySelectorAll('#history-event .hist-person img').length, map: !!document.querySelector('#history-event .hist-map'), focus: !!document.querySelector('.hist-focus'), history: document.querySelector('.hist-history')?.textContent.slice(0, 20) };
    const ja = h.largestArmy('jin', h.def('feishui383').place, 900); const m0 = ja?.army.morale;
    document.querySelector('#history-event .hist-choice[data-id="decisive"]').click();
    const r = h.records.feishui383; const ev = c.events.find(e => e.histId === 'feishui383');
    const setup = ev ? window.__gokoSetup(ev) : null;
    return { awaiting: aw && aw.id, shown, ui, picks: r.picks, status: r.status, result: r.result, cmd: ja && ja.army.commanderId, morale: [m0, ja && ja.army.morale], ev: ev && { status: ev.status, place: ev.location.name, att: ev.attackerFactionId, def: ev.defenderFactionId }, setup: setup && { att: setup.attacker.name, def: setup.defender.name, troops: setup.attacker.troops.infantry + setup.defender.troops.infantry }, prep: !document.querySelector('#event-open').hidden, resultShown: document.querySelector('#history-event .hist-result')?.textContent.slice(0, 40) }; })()`);
  await p.screenshot({ path: out + '/pc-history-feishui.png' });
  check('8 淝水の戦いが383年に示される(最重要の演出)', r4.awaiting === 'feishui383' && r4.shown && r4.ui.critical && r4.ui.choices.join() === 'historic,alt,bold' && r4.ui.persons === 7 && r4.ui.map && r4.ui.focus, r4.ui);
  check('4 プレイヤーが選択肢を選べる', r4.picks.jin?.by === 'player' && r4.picks.jin.choice === 'decisive' && r4.picks.qin?.by === 'ai', r4.picks);
  check('5 選択が軍団・人物に影響する(謝玄が指揮・士気)', r4.cmd === 'xie_xuan' && r4.morale[1] > r4.morale[0] - 1, r4);
  check('9 淝水の戦いが3D会戦と連動する', !!r4.ev && r4.ev.status === 'pending' && !!r4.setup && r4.prep, r4);

  // 10. 前秦が勝てば、敗北も分裂も強制しない
  const r10 = await p.evaluate(`(() => { const c = window.__goko.campaign, h = c.history; const ev = c.events.find(e => e.histId === 'feishui383');
    const qa = c.stateOf(ev.attackerFactionId === 'qianqin' ? ev.attackerArmyId : ev.defenderArmyId); for (const k of ['infantry', 'cavalry', 'archer']) qa.army.troops[k] *= 4; qa.army.morale = 100;
    const res = window.__gokoAuto(window.__gokoSetup(ev)); c.applyBattleResult(res);
    (${advance})(384 * 12 + 2);
    return { winner: res.winner, flag: h.flags.feishui_winner, qinFallen: !!window.__gokoData.scenario.factions.find(f => f.id === 'qianqin').fallen, split: h.records.split384.status, splitResult: h.records.split384.result, timeline: h.timeline.filter(t => t.eventId === 'feishui383').map(t => t.kind) }; })()`);
  check('10 前秦が勝てば、敗北も分裂も強制しない', r10.flag === 'qianqin' && !r10.qinFallen && r10.split === 'branched' && /淝水で勝ち/.test(r10.splitResult), r10);

  // 12. 年表:開始前の史実・選択・結果・会戦が残り、画面で史実と比べられる
  const r12 = await p.evaluate(() => { const h = window.__goko.campaign.history; document.querySelector('#history-event').hidden = true; document.querySelector('#timeline-open').click();
    const kinds = {}; for (const t of h.timeline) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
    return { kinds, rowsHist: document.querySelectorAll('#timeline .tl-col:first-child .tl-row').length, rowsGame: document.querySelectorAll('#timeline .tl-col:last-child .tl-row').length, diff: document.querySelectorAll('#timeline .tl-diff').length }; });
  await p.screenshot({ path: out + '/pc-timeline.png' });
  check('12 歴史年表が正しく記録される', r12.kinds.past === 13 && r12.kinds.choice >= 1 && r12.kinds.battle >= 1 && r12.rowsHist === 17 && r12.rowsGame >= 15, r12);

  // 13・14. 保存と互換
  const r13 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const s = JSON.parse(JSON.stringify(g.buildSave())); const a = JSON.stringify(c.history.serialize());
    c.history.records.split384.status = 'pending'; c.history.flags = {}; c.history.timeline.length = 0; g.applySave(s); const b2 = JSON.stringify(c.history.serialize());
    const old = JSON.parse(JSON.stringify(s)); delete old.campaign.history; let err = null; try { g.applySave(old); } catch (e) { err = String(e); }
    return { same: a === b2, err, afterOld: c.history.records.feishui383.status, past: c.history.records.yongjia311.status }; });
  check('13 セーブ・ロードで事件の状態が戻る', r13.same, r13);
  check('14 古いセーブとの互換(過ぎた事件は遅れて起こさない)', !r13.err && r13.past === 'past' && r13.afterOld === 'past', r13);

  // 15. 既存の外交・宮廷・経済・会戦が動く
  const r15 = await p.evaluate(() => { const c = window.__goko.campaign; const rep = c.economy.report('jin'); const odds = c.diplo.odds('jin', 'goguryeo', 'goodwill').p; const order = c.court.successionOrder('qianqin').length;
    const a = c.armies.find(s => s.army.factionId === 'qianqin' && s.status !== 'fighting'); const d = c.armies.find(s => s.army.factionId === 'jin' && s.status !== 'fighting'); let battle = 'none';
    if (a && d) { d.army.lon = a.army.lon + 0.2; d.army.lat = a.army.lat; c.startEvent(a, 'field_battle', d, null); const ev = c.events[c.events.length - 1]; c.applyBattleResult(window.__gokoAuto(window.__gokoSetup(ev))); battle = ev.status; }
    return { income: rep.income.total, odds, order, battle }; });
  check('15 既存の外交・宮廷・経済・会戦が動く', r15.income > 0 && r15.odds > 0 && r15.order > 0 && ['completed', 'none'].includes(r15.battle), r15);
  await p.close();

  // PC:永嘉の乱の画面(西晋を操作。最重要の演出・3つの選択肢・影響の予想)
  p = await open('s304');
  const ui = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'jin' }); c.speed = 0; c.setRelation('jin', 'han_zhao', 'war');
    (${advance})(311 * 12 + 6);
    const aw = h.awaiting; const box = document.querySelector('#history-event .hist-inner'); const r = box.getBoundingClientRect();
    const tiny = [...document.querySelectorAll('#history-event *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10.5).length;
    return { aw: aw && aw.id, critical: box.classList.contains('hist-critical'), title: box.querySelector('h2').textContent, choices: [...document.querySelectorAll('.hist-choice b')].map(x => x.textContent), previews: document.querySelectorAll('.hist-choice em').length, out: r.right > innerWidth + 1 || r.bottom > innerHeight + 1, tiny }; })()`);
  await p.screenshot({ path: out + '/pc-history-yongjia.png' });
  check('PC 永嘉の乱の画面(西晋の選択肢)', ui.aw === 'yongjia311' && ui.critical && ui.choices.length === 3 && ui.choices.includes('長安へ遷都する') && ui.previews === 3 && !ui.out && ui.tiny === 0, ui);
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
