// 人物の所在と歴史イベントの一覧(Version 40)
// 所在:全シナリオで、全員が有効な都市・関所・宮廷・軍団に紐づき、同じ人が2か所にいない。史実の確かさが付く。
// 都市の人物一覧・所在地への移動・任命での移動・出陣中の表示・保存。
// 歴史イベント:57件の一覧・条件の表示・発動できる/できない・二重に起きない・保存・自動と手動・モードの違い・瞬間移動しない。
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  const open = async (sc) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1200)); if (!ok) problems.push(label); };

  // 1. 全シナリオ:全員の所在が有効で、重複がない
  const report = {};
  for (const sc of ['s300', 's304', 's311', 's317', 's319', 's329', 's357', 's383']) {
    const p = await open(sc);
    const r = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
      const bad = [], kinds = {}, cert = {}; const govs = {}, cmds = {};
      for (const per of D.persons) { if (c.personStatus(per.id) !== 'active') continue;
        const l = c.placement.locationOf(per.id); kinds[l.kind] = (kinds[l.kind] || 0) + 1; cert[l.certainty] = (cert[l.certainty] || 0) + 1;
        const okCity = l.cityId && g.allCities.some(k => k.id === l.cityId); const okArmy = l.armyId && c.stateOf(l.armyId);
        if (!(((l.kind === 'city' || l.kind === 'pass' || l.kind === 'court') && okCity) || ((l.kind === 'army' || l.kind === 'moving') && okArmy) || l.kind === 'captive')) bad.push(per.id + ':' + l.kind + ':' + l.label);
        if (!l.certainty) bad.push(per.id + ':確かさなし'); }
      for (const k of g.allCities) { const gid = c.cityState(k).governorId ?? null; if (gid) (govs[gid] ||= []).push(k.id); }
      for (const s of c.armies) { for (const id of [s.army.commanderId, s.army.deputyId]) if (id) (cmds[id] ||= []).push(s.army.id); }
      const dup = [...Object.entries(govs).filter(([, v]) => v.length > 1), ...Object.entries(cmds).filter(([, v]) => v.length > 1), ...Object.keys(govs).filter(id => cmds[id]).map(id => [id, 'gov+army'])];
      const pri = {}; for (const id of ['liu_yuan', 'liu_cong', 'liu_yao', 'shi_le', 'shi_hu', 'zhang_bin', 'wang_mi', 'sima_rui', 'wang_dao', 'zu_ti', 'tao_kan', 'murong_hui', 'murong_huang', 'murong_ke', 'murong_chui', 'fu_jian', 'wang_meng', 'huan_wen', 'xie_an', 'xie_xuan', 'liu_laozhi', 'tuoba_gui', 'lv_guang']) { if (!D.persons.some(x => x.id === id) || c.personStatus(id) !== 'active') continue; const l = c.placement.locationOf(id); pri[id] = `${l.label}[${l.certainty}]`; }
      return { n: D.persons.filter(x => c.personStatus(x.id) === 'active').length, bad, dup, kinds, cert, pri }; });
    report[sc] = r;
    check(`1 ${sc}:全員(${r.n}人)の所在が有効な拠点・軍団・宮廷に紐づき、重複がなく、確かさが付く`, r.bad.length === 0 && r.dup.length === 0, { bad: r.bad.slice(0, 8), dup: r.dup.slice(0, 5), kinds: r.kinds, cert: r.cert });
    console.log('   主要人物', sc, JSON.stringify(r.pri));
    await p.close();
  }
  check('2 史実の所在:317年の石虎は鄴・劉曜は長安、383年の謝安は建康の宮廷、357年の謝安は会稽', /鄴/.test(report.s317.pri.shi_hu) && /長安/.test(report.s317.pri.liu_yao) && /建康/.test(report.s383.pri.xie_an) && /会稽/.test(report.s357.pri.xie_an), { s317: report.s317.pri, s357: report.s357.pri.xie_an, s383: report.s383.pri.xie_an });

  // 3〜6. 都市の人物一覧・出陣中・任命・所在地へ・保存(383年)
  let p = await open('s383');
  const r3 = await p.evaluate(async () => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'jin' }); c.speed = 0;
    // 出陣中の軍団長は、都市にいることにしない
    const s = c.armies.find(x => x.army.factionId === 'jin' && x.army.commanderId); const cmd = s.army.commanderId;
    const k = g.allCities.find(k => D.scenario.cityOwners[k.id] === 'jin' && Math.hypot(k.lon - s.army.lon, k.lat - s.army.lat) > 2);
    c.orderMove(s.army.id, c.planRoute(s.army.id, k)); const moving = c.placement.locationOf(cmd);
    const inCity = g.allCities.some(k => c.placement.peopleAt(k.id).includes(cmd));
    // 任命で所在が移る
    const who = D.persons.find(x => x.factionId === 'jin' && x.role === 'general' && !c.postOf(x.id) && c.personStatus(x.id) === 'active');
    const city = g.allCities.find(k => D.scenario.cityOwners[k.id] === 'jin' && k.id !== 'jiankang' && k.kind !== 'pass');
    c.appoint(who.id, { kind: 'city', id: city.id }); const after = c.placement.locationOf(who.id);
    // 保存と読み込み
    const save = JSON.parse(JSON.stringify(g.buildSave())); c.placement.homes = {}; g.applySave(save); const back = c.placement.locationOf(who.id);
    return { cmd, moving: moving.kind + ':' + moving.label, inCity, who: who.name, city: city.name, after: after.label, back: back.label }; });
  check('3 出陣中の軍団長は都市に常駐していることにならず、任命で所在が移り、保存で戻る', r3.moving.startsWith('moving') && !r3.inCity && r3.after.includes(r3.city) && r3.back.includes(r3.city), r3);
  const r4 = await p.evaluate(async () => { const g = window.__goko; const m = g.cities.markers.find(x => x.city.id === 'jiankang'); g.selectCity ? g.selectCity(m) : null;
    const btn = document.querySelector('.info-staff'); const label = btn?.textContent; btn?.click(); await new Promise(r => setTimeout(r, 200));
    const rows = document.querySelectorAll('#persons .person-row').length; const place = document.querySelector('.persons-place').value;
    document.querySelector('#persons .person-row')?.click(); const where = document.querySelector('.person-where')?.textContent;
    document.querySelector('.person-where-go')?.click(); await new Promise(r => setTimeout(r, 200)); const selected = g.selected?.city?.id;
    return { label, rows, place, where, selected, peopleAt: g.campaign.placement.peopleAt('jiankang').length }; });
  check('4 都市を選ぶと所属の人物一覧が開き(肖像・年齢・所在)、人物から所在地へ移動できる', r4.place === 'jiankang' && r4.rows === r4.peopleAt && r4.rows > 0 && /所在/.test(r4.where ?? '') && r4.selected === 'jiankang', r4);
  await p.screenshot({ path: out + '/pc-city-people.png' });

  // 7〜. 歴史イベントの一覧
  const r7 = await p.evaluate(async () => { document.querySelector('#persons .persons-close')?.click(); document.querySelector('#events-open').click(); await new Promise(r => setTimeout(r, 300));
    const rows = document.querySelectorAll('#events .ev-row').length; const sel = document.querySelector('#events .ev-filter'); const counts = {};
    for (const o of sel.options) { sel.value = o.value; sel.dispatchEvent(new Event('change')); counts[o.value] = document.querySelectorAll('#events .ev-row').length; }
    sel.value = 'all'; sel.dispatchEvent(new Event('change'));
    [...document.querySelectorAll('#events .ev-row')].find(r => r.dataset.id === 'feishui383')?.click();
    const conds = [...document.querySelectorAll('#events .ev-conds li')].map(li => li.textContent);
    const btn = document.querySelector('#events .ev-fire'); return { rows, counts, conds, disabled: btn.disabled, why: document.querySelector('#events .ev-why')?.textContent }; });
  await p.screenshot({ path: out + '/pc-history-events.png' });
  // 劉裕の北伐で13件を足し、57件から70件になった(数を70に直した)
  check('7 70件(57件+劉裕の北伐13件)すべてを一覧表示でき、絞り込み(10種)が働く', r7.rows === 70 && r7.counts.all === 70 && Object.keys(r7.counts).length === 10 && r7.counts.military + r7.counts.politics + r7.counts.diplomacy + r7.counts.founding >= 70 && r7.counts.diplomacy >= 3 && r7.counts.mine < 70, r7.counts);
  check('8 淝水の戦いの発動条件が、満たしているか・理由とともに分かる', r7.conds.length >= 6 && r7.conds.some(t => /前秦/.test(t)) && r7.conds.some(t => /東晋/.test(t)) && r7.conds.some(t => /軍団/.test(t)) && r7.conds.some(t => /まだ発生していない/.test(t)), r7.conds);
  check('9 条件未達のイベントは発動できない(通常・史実重視では史実の年月より前は不可)', r7.disabled && /年月/.test(r7.why ?? ''), { why: r7.why });
  const r10 = await p.evaluate(async () => { const g = window.__goko, c = g.campaign, h = c.history; document.querySelector('#events .events-close').click();
    const refuse = h.fire('feishui383'); const st0 = h.records.feishui383.status;
    g.changeSettings({ historyMode: 'free' }); const ls = h.listState(h.def('feishui383'));
    const pos0 = c.armies.filter(s => ['jin', 'qianqin'].includes(s.army.factionId)).map(s => [s.army.id, s.army.lon, s.army.lat]);
    const res = h.fire('feishui383'); const awaiting = h.records.feishui383.status;
    const aw = h.awaiting; let chosen = null; if (aw) { const roles = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => roles[k] === c.playerFactionId); chosen = h.choose(aw.id, aw.choices[role][0].id); }
    const jump = pos0.map(([id, lon, lat]) => { const s = c.stateOf(id); return s ? Math.hypot(s.army.lon - lon, s.army.lat - lat) : 0; });
    const again = h.fire('feishui383');
    // 史実の年月が来ても、もう一度は起きない
    const before = h.records.feishui383.status; for (let i = 0; i < 6; i++) { c.day += 30; h.monthly(); } const later = h.records.feishui383.status;
    const save = JSON.parse(JSON.stringify(g.buildSave())); g.applySave(save); const kept = h.records.feishui383;
    return { refuse: refuse.slice(0, 60), st0, can: ls.can, res, awaiting, chosen: (chosen ?? '').slice(0, 120), maxJump: Math.max(...jump), again: again.slice(0, 60), before, later, keptManual: kept.manual, keptStatus: kept.status, result: (kept.result ?? '').slice(0, 100) }; });
  check('10 自由歴史では、条件を満たす淝水の戦いを史実より早く発動でき、3つの選択肢から選ぶと実際に反映される', r10.st0 === 'pending' && r10.can && r10.awaiting === 'awaiting' && r10.chosen.length > 0 && r10.result.length > 0, r10);
  check('11 発動しても軍団は瞬間移動せず(戦場へ進軍)、同じイベントは二重に起きず、保存・読み込み後も状態が残る', r10.maxJump < 0.5 && /発動できません/.test(r10.again) && r10.before === r10.later && r10.keptManual === true && r10.keptStatus === r10.later, { maxJump: r10.maxJump, again: r10.again, before: r10.before, later: r10.later, kept: [r10.keptManual, r10.keptStatus] });
  await p.close();

  // 12. 関係しない国のイベントは、通常はAIが判断(観賞・編集モードでは発動できる)。史実重視では早い発動は不可
  p = await open('s383');
  const r12 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history; c.speed = 0;
    g.changeSettings({ playerFactionId: 'silla', historyMode: 'free' }); const d = h.def('feishui383'); const notMine = h.listState(d);
    g.changeSettings({ playerFactionId: null }); const watch = h.listState(d);
    g.changeSettings({ historyMode: 'historic' }); const hist = h.listState(d);
    g.changeSettings({ historyMode: 'free' }); const fired = h.fire('feishui383'); const st = h.records.feishui383.status;
    return { notMine: [notMine.can, notMine.reasons.join('/').slice(0, 80)], watch: watch.can, hist: [hist.can, hist.reasons.join('/').slice(0, 60)], fired, st }; });
  check('12 関係しない国の事件は通常AIが判断し、観賞・編集モードでは発動でき、史実重視では早い発動ができない', r12.notMine[0] === false && /AI/.test(r12.notMine[1]) && r12.watch === true && r12.hist[0] === false && r12.st === 'awaiting', r12);
  await p.close();

  // 13. 自動と手動が競合しない:史実の年月が来た事件を、その月のうちに手動で発動しても1回だけ
  p = await open('s317');
  const r13 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: null, historyMode: 'normal' }); c.speed = 0;
    const d = h.defs.filter(x => h.records[x.id].status === 'pending').sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))[0];
    while (c.calendar().year * 12 + c.calendar().month < d.year * 12 + d.month) c.day += 30;
    const st = h.listState(d); let fired = null; if (st.can) fired = h.fire(d.id);
    const after = h.records[d.id].status; h.monthly(); const after2 = h.records[d.id].status; const logs = h.timeline.filter(t => t.eventId === d.id && t.kind === 'choice').length;
    return { id: d.id, can: st.can, reasons: st.reasons.slice(0, 2), fired, after, after2, logs }; });
  check('13 自動の発生と手動の発動が競合しない(1回だけ起きる)', r13.after === r13.after2 && r13.logs <= 1, r13);
  await p.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
