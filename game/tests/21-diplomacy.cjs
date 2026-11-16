// 外交(Version 34):関係・友好度・条約・停戦・使者・援軍・共同作戦・婚姻同盟・AIの外交・遺産の分配・保存と互換・PCの外交画面
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2] + '#s=s317');
  await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info)); if (!ok) problems.push(label); };

  // 1. 開始時の関係は史料(または推定)にもとづく
  const r1 = await p.evaluate(() => { const c = window.__goko.campaign, d = c.diplo; c.speed = 0;
    return { jinShile: c.relationOf('jin', 'shile'), jinDuan: c.relationOf('jin', 'duan'), caoYi: c.relationOf('cao_yi', 'jin'), cuiMurong: c.relationOf('cui_bi', 'murong'), silTie: c.relationOf('silla', 'tiefu'),
      amWar: d.amityOf('jin', 'shile'), amAlly: d.amityOf('jin', 'duan'), recorded: d.isRecorded('cao_yi', 'jin'), unrecorded: d.isRecorded('silla', 'tiefu'), marriages: d.marriages.length, historic: d.marriages.every(m => m.historic) }; });
  check('1 開始時の関係(戦争・同盟・友好・敵対・推定の中立)', r1.jinShile === 'war' && r1.jinDuan === 'alliance' && r1.caoYi === 'friendly' && r1.cuiMurong === 'hostile' && r1.silTie === 'neutral' && r1.amWar < 0 && r1.amAlly > 30 && r1.recorded && !r1.unrecorded && r1.marriages > 0 && r1.historic, r1);

  // 2. 親善・贈答で友好度が上がる
  const r2 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, d = c.diplo; g.changeSettings({ playerFactionId: 'jin', difficulty: 'normal' }); c.speed = 0;
    c.factionStates.jin.gold = 50000; c.factionStates.jin.grain = 50000;
    const a0 = d.amityOf('jin', 'qianliang'); const gift = c.diplomacy('qianliang', 'gift', { gold: 1200, envoyId: 'wang_dao' }); const a1 = d.amityOf('jin', 'qianliang');
    let gw = ''; let a2 = a1; for (let i = 0; i < 20 && a2 === a1; i++) { c.day += 1; gw = c.diplomacy('qianliang', 'goodwill', { envoyId: 'wang_dao' }); a2 = d.amityOf('jin', 'qianliang'); }
    return { a0, a1, a2, gift, gw, gold: Math.round(c.factionStates.qianliang.gold) }; });
  check('2 親善・贈答で友好度が上がる', r2.a1 > r2.a0 && r2.a2 > r2.a1, r2);

  // 3. 同盟・不可侵条約が働く(同盟国とは戦闘にならない・関所を通れる・期限で切れる)
  const r3 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, d = c.diplo;
    c.setRelation('jin', 'cui_bi', 'friendly'); c.setRelation('jin', 'chenghan', 'neutral'); c.relationSince['chenghan|jin'] = -999; d.amity['chenghan|jin'] = 70;
    let al = ''; for (let i = 0; i < 40 && c.relationOf('jin', 'chenghan') !== 'alliance'; i++) { c.day += 1; al = c.diplomacy('chenghan', 'alliance', { envoyId: 'wang_dao' }); }
    const army = c.armies.find(s => s.army.factionId === 'jin'); const hostileAlly = c.hostileTo(army.army, 'chenghan');
    const treaty = d.treaties['chenghan|jin'];
    d.amity['jin|qianliang'] = 70; c.setRelation('jin', 'qianliang', 'neutral'); let na = ''; for (let i = 0; i < 40 && c.relationOf('jin', 'qianliang') !== 'nonaggression'; i++) { c.day += 1; na = c.diplomacy('qianliang', 'nonaggression', { envoyId: 'wang_dao' }); }
    const hostileNa = c.hostileTo(army.army, 'qianliang');
    // 期限:不可侵の期限を今日にして、月の処理で切れること
    d.treaties['jin|qianliang'].until = Math.floor(c.day); d.monthly(); const after = c.relationOf('jin', 'qianliang');
    return { al, rel: c.relationOf('jin', 'chenghan'), hostileAlly, treaty, na, hostileNa, after, counts: d.counts }; });
  check('3 同盟・不可侵(攻撃できない・期限で切れる)', r3.rel === 'alliance' && !r3.hostileAlly && r3.treaty && r3.treaty.until > 0 && !r3.hostileNa && ['friendly', 'neutral'].includes(r3.after), r3);

  // 4. 停戦・和平で戦争が終わる
  const r4 = await p.evaluate(() => { const c = window.__goko.campaign, d = c.diplo; c.setRelation('jin', 'sima_bao', 'war'); const tooSoon = c.diplomacy('sima_bao', 'peace', { envoyId: 'wang_dao' });
    c.relationSince['jin|sima_bao'] = Math.floor(c.day) - 400; const p0 = d.counts.peaces; let t = '';
    for (let i = 0; i < 60 && c.atWar('jin', 'sima_bao'); i++) { c.day += 1; t = c.diplomacy('sima_bao', i % 2 ? 'peace' : 'ceasefire', { envoyId: 'wang_dao' }); }
    return { tooSoon, t, rel: c.relationOf('jin', 'sima_bao'), atWar: c.atWar('jin', 'sima_bao'), peaces: d.counts.peaces - p0 }; });
  check('4 停戦・和平で戦争が終わる', r4.tooSoon.includes('開戦したばかり') && !r4.atWar && r4.peaces === 1, r4);

  // 5. 使者の能力が成功率に効く。ただし敵対する相手との同盟は、能力だけでは結べない
  const r5 = await p.evaluate(() => { const c = window.__goko.campaign, d = c.diplo, D = window.__gokoData;
    const jin = D.persons.filter(x => x.factionId === 'jin' && c.personStatus(x.id) === 'active').sort((a, b) => (b.intelligence + b.politics + b.charisma) - (a.intelligence + a.politics + a.charisma));
    const best = jin[0], worst = jin[jin.length - 1];
    const pb = d.odds('jin', 'goguryeo', 'nonaggression', best.id).p, pw = d.odds('jin', 'goguryeo', 'nonaggression', worst.id).p;
    d.amity['cui_bi|jin'] = -70; c.setRelation('jin', 'cui_bi', 'hostile'); const hostileAlly = d.odds('jin', 'cui_bi', 'alliance', best.id);
    const warAlly = d.odds('jin', 'shile', 'alliance', best.id).p;
    return { best: best.name, worst: worst.name, pb, pw, hostileAlly: hostileAlly.p, parts: hostileAlly.parts, warAlly }; });
  check('5 使者の能力が成功率に効く(敵対国とは結びにくい)', r5.pb > r5.pw && r5.hostileAlly < 0.15 && r5.warAlly === 0, r5);

  // 6. 援軍は実際の軍団として地図を進む(瞬間移動しない)
  const r6 = await p.evaluate(() => { const c = window.__goko.campaign, d = c.diplo;
    c.factionStates.duan.gold = 20000; c.factionStates.duan.grain = 20000; d.amity['duan|jin'] = 80; for (const f of ['han_zhao', 'shile']) c.setRelation('duan', f, 'neutral');
    const n0 = c.armies.length; const res = d.dispatchAid('duan', 'jin'); const m = d.aid.find(x => x.from === 'duan');
    const s = m && c.stateOf(m.armyId); const p0 = s ? { lon: s.army.lon, lat: s.army.lat } : null;
    c.speed = 4; for (let i = 0; i < 8; i++) c.update(0.25); c.speed = 0;
    const p1 = s ? { lon: s.army.lon, lat: s.army.lat } : null; const step = p0 && p1 ? Math.hypot(p1.lon - p0.lon, p1.lat - p0.lat) : -1;
    const toTarget = s ? Math.hypot(s.army.lon - m.target.lon, s.army.lat - m.target.lat) : -1;
    return { res, n0, n1: c.armies.length, owner: s && s.army.factionId, name: s && s.army.name, status: s && s.status, step, toTarget, aidCount: d.counts.aids }; });
  check('6 援軍が実際の軍団として移動する', r6.res.ok && r6.owner === 'duan' && r6.status === 'marching' && r6.step > 0 && r6.step < 3 && r6.toTarget > 0.3 && /援軍/.test(r6.name), r6);

  // 7. 援軍が近くの戦いに加勢する(共同作戦)。損害は兵の割合で分ける
  const r7 = await p.evaluate(() => { const c = window.__goko.campaign, d = c.diplo;
    const m = d.aid.find(x => x.from === 'duan'); const sup = c.stateOf(m.armyId);
    const mine = c.armies.find(s => s.army.factionId === 'jin' && s.status !== 'fighting'); const foe = c.armies.find(s => s.army.factionId === 'shile' && s.status !== 'fighting');
    foe.army.lon = mine.army.lon + 0.2; foe.army.lat = mine.army.lat; sup.army.lon = mine.army.lon + 0.1; sup.army.lat = mine.army.lat + 0.2; sup.route = null; sup.status = 'camping';
    const tm = mine.army.troops.infantry + mine.army.troops.cavalry + mine.army.troops.archer, ts = sup.army.troops.infantry + sup.army.troops.cavalry + sup.army.troops.archer;
    c.startEvent(mine, 'field_battle', foe, null);
    const ev = c.events[c.events.length - 1]; const setup = window.__gokoSetup(ev);
    const side = setup.attacker; const merged = side.troops.infantry + side.troops.cavalry + side.troops.archer;
    const result = window.__gokoAuto(setup); c.applyBattleResult(result);
    const ts2 = sup.army.troops.infantry + sup.army.troops.cavalry + sup.army.troops.archer; const tm2 = mine.army.troops.infantry + mine.army.troops.cavalry + mine.army.troops.archer;
    return { supporters: ev.supporters, merged, tm, ts, sum: tm + ts, winner: result.winner, ts2, tm2, supStatus: sup.status, alive: c.armies.includes(sup), hist: (d.history['duan|jin'] || []).slice(-1)[0] }; });
  check('7 援軍が共同作戦で戦いに加わる', r7.supporters && r7.supporters.length === 1 && r7.merged === r7.sum && r7.supporters[0].efficiency >= 0.5 && r7.supporters[0].efficiency <= 1 && (!r7.alive || (r7.ts2 <= r7.ts && r7.supStatus !== 'fighting')), r7);

  // 8. 援軍は作戦が終われば引き揚げ、帰り着けばふつうの軍団に戻る
  const r8 = await p.evaluate(() => { const c = window.__goko.campaign, d = c.diplo;
    let m = d.aid.find(x => x.from === 'duan'); if (!m) { d.dispatchAid('duan', 'jin'); m = d.aid.find(x => x.from === 'duan'); }
    if (!m) return { none: true };
    const id = m.armyId; m.until = Math.floor(c.day); const s = c.stateOf(id); if (s.status === 'fighting') s.status = 'camping'; d.daily(); const returning = m.returning; const st = s.status;
    c.speed = 8; let n = 0; while (d.aid.some(x => x.armyId === id) && n++ < 6000) { if (c.speed === 0) { const ev = c.events.find(e => e.status === 'pending'); if (ev) c.setEventStatus(ev.battleId, 'cancelled'); for (const a of c.armies) if (a.status === 'fighting' && !c.openEventOfArmy(a.army.id)) a.status = 'camping'; c.speed = 8; } c.update(0.25); } c.speed = 0;
    const s2 = c.stateOf(id); return { returning, st, done: !d.aid.some(x => x.armyId === id), name: s2 && s2.army.name, owner: s2 && s2.army.factionId }; });
  check('8 援軍が引き揚げる', r8.returning && r8.st === 'marching' && r8.done && (!r8.name || !/援軍/.test(r8.name)), r8);

  // 9. 婚姻同盟は人物IDで記録され、再婚・一族・年齢を確かめる
  const r9 = await p.evaluate(() => { const c = window.__goko.campaign, d = c.diplo, D = window.__gokoData;
    const pair = (() => { for (const t of ['qianliang', 'murong', 'duan', 'chenghan', 'dai', 'goguryeo', 'cui_bi']) { const x = d.marriagePair('jin', t); if (x.husbandId) return { t, ...x }; } return null; })();
    if (!pair) return { none: true };
    d.amity[['jin', pair.t].sort().join('|')] = 90; c.setRelation('jin', pair.t, 'friendly'); let text = '';
    for (let i = 0; i < 60 && !d.marriages.some(m => m.wife === pair.wifeId); i++) { c.day += 1; c.factionStates.jin.gold = 50000; text = c.diplomacy(pair.t, 'marriage', { envoyId: 'wang_dao', husbandId: pair.husbandId, wifeId: pair.wifeId }); }
    const m = d.marriages.find(x => x.wife === pair.wifeId); const h = D.persons.find(x => x.id === pair.husbandId), w = D.persons.find(x => x.id === pair.wifeId);
    const again = d.canMarry(h, w); const kin = (() => { const r = c.rulerOf('jin'); const k = D.persons.find(x => x.factionId === 'jin' && x.gender === 'female' && x.id !== r.id && window.__gokoAffinity && x.name[0] === r.name[0] && x.name.slice(0, 2) === r.name.slice(0, 2)); return k ? d.canMarry(r, k) : 'no-kin-sample'; })();
    const save = window.__goko.buildSave().campaign.diplomacy.marriages.find(x => x.wife === pair.wifeId);
    return { pair, text, m, wifeFaction: w.factionId, husbandFaction: h.factionId, again, kin, saved: !!save, rel: c.relationOf('jin', pair.t), treaty: d.treaties[['jin', pair.t].sort().join('|')] }; });
  check('9 婚姻同盟(人物IDで記録・再婚の防止・同盟)', !r9.none && r9.m && !r9.m.historic && r9.m.husband && r9.m.wife && r9.wifeFaction === r9.husbandFaction && r9.again && r9.saved && r9.rel === 'alliance', r9);

  // 10. AIの外交:劣勢なら和平を求め、財政難なら贈り物や親善をしない
  const r10 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, d = c.diplo;
    g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    c.setRelation('chenghan', 'han_zhao', 'war'); c.relationSince['chenghan|han_zhao'] = Math.floor(c.day) - 500; c.day = Math.max(c.day, 600);
    const before = (d.history['chenghan|han_zhao'] || []).length;
    c.factionStates.tiefu.gold = 0; const tieBefore = Object.entries(d.history).filter(([k]) => k.includes('tiefu')).reduce((s, [, v]) => s + v.filter(h => /親善|贈答/.test(h.text)).length, 0);
    for (let i = 0; i < 6; i++) { c.day += 90; c.factionStates.tiefu.gold = 0; d.aiQuarter(0.3, 1.5); }
    const after = (d.history['chenghan|han_zhao'] || []).slice(before).map(h => h.text);
    const tieAfter = Object.entries(d.history).filter(([k]) => k.includes('tiefu')).reduce((s, [, v]) => s + v.filter(h => /親善|贈答/.test(h.text) && h.text.includes('鉄弗')).length, 0);
    return { power: [d.power('chenghan'), d.power('han_zhao')], after, rel: c.relationOf('chenghan', 'han_zhao'), tieBefore, tieAfter }; });
  const askedPeace = r10.after.some(t => /停戦|和平/.test(t)) || r10.rel !== 'war';
  check('10 AIの外交(劣勢なら和平・財政難なら贈らない)', askedPeace && r10.tieAfter === r10.tieBefore, r10);

  // 11. 滅亡したときの金の分配:人口に応じ、収入の1年半分まで(残りは散逸)
  const r11 = await p.evaluate(() => { const c = window.__goko.campaign, D = window.__gokoData;
    const f = 'han_zhao'; const r = c.rulerOf(f); c.factionStates[f].gold = 200000; c.fallFaction(f, r, 'jin');
    const succ = D.scenario.factions.filter(x => x.founded && x.founded.from === f).map(x => ({ id: x.id, name: x.name, gold: Math.round(c.factionStates[x.id].gold), cap: Math.max(1500, c.economy.report(x.id).income.total * 18) }));
    return { succ, scattered: c.dynasty.scattered, fallen: !!D.scenario.factions.find(x => x.id === f).fallen }; });
  check('11 後継国家の資産分配(抱え込みを防ぐ)', r11.fallen && r11.succ.every(s => s.gold <= s.cap + 1) && (r11.succ.length === 0 || r11.scattered > 0), r11);

  // 12. セーブ・ロードで外交が戻る
  const r12 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, d = c.diplo; const s = JSON.parse(JSON.stringify(g.buildSave())); const a = JSON.stringify(d.serialize());
    d.amity['jin|qianliang'] = -99; d.marriages.length = 0; d.treaties = {}; d.counts.alliances = 999; g.applySave(s); const b2 = JSON.stringify(c.diplo.serialize());
    return { same: a === b2, len: a.length, rel: c.relationOf('chenghan', 'jin') }; });
  check('12 セーブ・ロードで外交が戻る', r12.same && r12.rel === 'alliance', r12);

  // 13. 古いセーブ(外交の記録なし・関係が "peace")も読める
  const r13 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const s = JSON.parse(JSON.stringify(g.buildSave())); delete s.campaign.diplomacy; s.campaign.relations['jin|qianliang'] = 'peace';
    let err = null; try { g.applySave(s); } catch (e) { err = String(e); }
    return { err, rel: c.relationOf('jin', 'qianliang'), marriages: c.diplo.marriages.length, amity: c.diplo.amityOf('jin', 'shile') }; });
  check('13 古いセーブとの互換', !r13.err && r13.rel === 'neutral' && r13.marriages > 0 && typeof r13.amity === 'number', r13);

  // 14. 滅亡・独立・反乱の仕組みが動く(詳しくは 18・19・20 のテスト)
  const r14 = await p.evaluate(() => { const c = window.__goko.campaign, D = window.__gokoData;
    const f = D.scenario.factions.find(x => !x.fallen && !x.passive && x.id === 'chenghan'); const r = c.rulerOf('chenghan'); c.fallFaction('chenghan', r, 'jin');
    return { fallen: !!f.fallen, news: c.news.slice(-1)[0].text, hasSecede: typeof c.secede === 'function', rebellions: typeof c.loyalty.counts.rebellions }; });
  check('14 滅亡・独立・反乱が動く', r14.fallen && r14.hasSecede && r14.rebellions === 'number', r14);

  // PCの外交画面(1920×1200):一覧・詳細・交渉・結果と理由
  await p.reload(); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.__goko; g.changeSettings({ playerFactionId: 'jin' }); g.campaign.speed = 0; g.campaign.factionStates.jin.gold = 9000; document.querySelector('#diplomacy-open').click(); });
  await p.waitForTimeout(400);
  const ui = await p.evaluate(() => { const row = [...document.querySelectorAll('.diplomacy-row')].find(r => r.querySelector('.diplomacy-name').textContent.startsWith('前涼')); row.click();
    const labels = [...document.querySelectorAll('.dd-stats dt')].map(x => x.textContent);
    const sel = document.querySelector('.dd-command'); sel.value = 'gift'; sel.dispatchEvent(new Event('change'));
    const fields = { gold: !!document.querySelector('.dd-gold'), envoy: document.querySelectorAll('.dd-envoy option').length, odds: document.querySelector('.dd-odds').textContent };
    document.querySelector('.dd-run').click();
    const result = document.querySelector('.dd-result') && document.querySelector('.dd-result').textContent;
    const s2 = document.querySelector('.dd-command'); s2.value = 'aid'; s2.dispatchEvent(new Event('change')); document.querySelector('.dd-run').click();
    const result2 = document.querySelector('.dd-result').textContent;
    const inner = document.querySelector('#diplomacy > div').getBoundingClientRect(); const cols = ['.diplomacy-factions', '.diplomacy-detail', '.diplomacy-side'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().width));
    const tiny = [...document.querySelectorAll('#diplomacy *')].filter(e => e.offsetParent && e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10.5).length;
    return { labels, fields, result, result2, width: Math.round(inner.width), cols, tiny, scrollX: document.documentElement.scrollWidth > innerWidth + 1 }; });
  check('PC 外交画面(1920×1200)', ['国力', '兵力', '都市', '友好度', '関係', '条約の期限', '婚姻'].every(l => ui.labels.includes(l)) && ui.fields.gold && ui.fields.envoy > 3 && /見込み/.test(ui.fields.odds) && ui.result && /(断り|結び|援軍|か国まで)/.test(ui.result2) && ui.cols.every(w => w > 250) && !ui.scrollX && ui.tiny === 0, ui);
  await p.screenshot({ path: out + '/pc-diplomacy.png' });
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
