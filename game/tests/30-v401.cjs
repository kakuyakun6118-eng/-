// Version 40.1:300年開始の膠着の解消・西域への自主的な遠征・反乱の条件別の起こりやすさ・損失の内訳(二重計上なし)・
// 歴史イベント57件の手動/自動の競合と、自由歴史の早い発動で未来の人物・国が現れないこと・肖像の表示・FPSの表示
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const open = async (sc) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => { window.__run = (days) => { const g = window.__goko, c = g.campaign, h = c.history; const d0 = c.day; let n = 0;
      while (c.day - d0 < days && n++ < 6000000 && !c.gameOver) {
        const aw = h.awaiting; if (aw) { const roles = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => c.playerFactionId === null ? roles[k] : roles[k] === c.playerFactionId); h.choose(aw.id, aw.choices[role][0].id); }
        h.queue = h.queue.filter(q => q.mode === 'decide');
        if (c.speed === 0) { for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
        c.update(0.25); } }; });
    return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1200)); if (!ok) problems.push(label); };

  // 1. 300年開始:20年を過ぎても、AIが出兵・会戦・外交を続ける(膠着で全員が待機しない)
  let p = await open('s300');
  const r1 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'silla', difficulty: 'normal' }); c.speed = 0;
    window.__run(360 * 20); const a = c.strategy.totals(); const pa = c.diplo.counts.peaces + c.diplo.counts.vassals;
    window.__run(360 * 8); const b2 = c.strategy.totals(); const pb = c.diplo.counts.peaces + c.diplo.counts.vassals;
    return { date: c.dateText(), late: { dispatched: b2.dispatched - a.dispatched, battles: b2.fieldBattles + b2.sieges - a.fieldBattles - a.sieges, captures: b2.captures - a.captures, posture: b2.postureChanges - a.postureChanges, diplomacy: pb - pa, annexed: b2.annexed - a.annexed, peaceTries: b2.peaceTries - a.peaceTries, reorganized: b2.reorganized - a.reorganized, blockades: b2.blockades - a.blockades } }; });
  check('1 300年開始:20〜28年目も、AIが出兵・戦い・外交・方針の見直しを続ける', r1.late.dispatched + r1.late.battles + r1.late.diplomacy + r1.late.annexed >= 3 && r1.late.posture >= 1, r1);
  await p.close();

  // 2. 西域への自主的な遠征(383年・前秦):計画 → 出発 → 到着 → 戦いか外交で決着
  p = await open('s383');
  const r2 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'silla', difficulty: 'normal' }); c.speed = 0;
    window.__run(360 * 12); const st = c.strategy.stats.qianqin ?? {}; const ws = Object.fromEntries(Object.entries(st).filter(([k]) => k.startsWith('west')));
    const logs = c.strategy.log.filter(l => /西域/.test(l.text)).slice(-6).map(l => l.date + ' ' + l.text);
    return { ws, logs }; });
  check('2 西域への自主的な遠征が、計画・出発・決着(占領・失敗・外交)まで進む', r2.ws.westPlans >= 1 && r2.ws.westDispatched + r2.ws.westVassals >= 1 && r2.ws.westWon + r2.ws.westFailed + r2.ws.westDiplomatic + r2.ws.westVassals >= 1, r2);
  // 3. 損失の内訳:兵糧不足の消耗の合計は、従来の消耗の数と一致する(二重に数えていない)。補給の範囲内では飢えで兵を失わない
  const r3 = await p.evaluate(() => { const c = window.__goko.campaign; const L = c.logistics.losses ?? {}; const bad = []; let supplied = 0;
    for (const [f, by] of Object.entries(L)) { const starve = Object.entries(by).filter(([k]) => !k.startsWith('会戦')).reduce((s, [, v]) => s + v, 0); if (starve !== (c.logistics.attrition[f] ?? 0)) bad.push(`${f}:${starve}≠${c.logistics.attrition[f]}`); supplied += Object.entries(by).filter(([k]) => k.includes('補給範囲内')).reduce((s, [, v]) => s + v, 0); }
    return { bad, supplied, qin: L.qianqin }; });
  check('3 損失の内訳:兵糧不足の消耗は二重に数えておらず、補給の範囲内の軍団は飢えで兵を失わない', r3.bad.length === 0 && r3.supplied === 0 && !!r3.qin, r3);
  await p.close();

  // 4. 反乱:安定した国では起きにくく、危機が重なった国では起きやすい(同じ条件で5回 × 24か月)
  p = await open('s317');
  const r4 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; c.speed = 0; g.changeSettings({ playerFactionId: 'jin', difficulty: 'normal' }); const F = 'jin';
    const base = JSON.parse(JSON.stringify(g.buildSave()));
    const trial = (apply) => { let events = 0, low = 0, n = 0;
      for (let t = 0; t < 5; t++) { g.applySave(JSON.parse(JSON.stringify(base))); c.speed = 0; c.day += t * 7;
        const before = c.loyalty.counts.rebellions + c.loyalty.counts.defections;
        for (let m = 0; m < 24; m++) { apply(); c.day += 30; c.loyalty.monthly(); }
        for (const x of D.persons.filter(x => x.factionId === F && x.role !== 'ruler' && c.postOf(x.id))) { n++; if ((c.loyalty.loyalty[x.id] ?? 100) < 45) low++; }
        events += c.loyalty.counts.rebellions + c.loyalty.counts.defections - before; }
      return { events: events / 5, lowPct: Math.round(low / Math.max(1, n) * 100) }; };
    const stable = trial(() => {});
    const crisis = trial(() => { c.economy.arrears[F] = 3; c.loyalty.noteDefeat(F); c.loyalty.noteRulerChange(F); c.loyalty.noteDispute(F); c.court.stability[F] = 20; });
    const why = c.loyalty.target(D.persons.find(x => x.factionId === F && x.role === 'general')).parts.join('・');
    return { stable, crisis, why }; });
  check('4 反乱:安定した国では起きにくく、危機(未払い・大敗・君主の交代・継承争い・不安定)が重なると明確に起きやすい', r4.stable.events <= 0.4 && r4.crisis.events >= r4.stable.events + 1 && r4.crisis.lowPct > r4.stable.lowPct, r4);
  await p.close();

  // 5. 歴史イベント:自由歴史・観賞編集モードで、いま発動できる事件をすべて発動しても、未来の人物・国が現れず、自動の発生と重ならない
  const r5 = {};
  for (const sc of ['s300', 's304', 's311', 's317', 's319', 's329', 's357', 's383']) {
    p = await open(sc);
    r5[sc] = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData, h = c.history; c.speed = 0; g.changeSettings({ playerFactionId: null, historyMode: 'free' });
      const year = c.calendar().year; const before = new Set(D.persons.map(x => x.id)); const facs0 = new Set(D.scenario.factions.map(f => f.id));
      let fired = 0; const bad = [];
      for (const d of h.defs) { if (!h.listState(d).can) continue; h.fire(d.id); fired++;
        const aw = h.awaiting; if (aw) { const roles = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => roles[k]); h.choose(aw.id, aw.choices[role][0].id); } h.queue = []; }
      for (const x of D.persons.filter(x => !before.has(x.id))) { if (x.born !== null && x.born > year - 14 && !x.fictional) bad.push(`${x.name}(生${x.born})`); }
      for (const f of D.scenario.factions.filter(f => !facs0.has(f.id))) { const r = D.persons.find(x => x.factionId === f.id && x.role === 'ruler'); if (r && r.born !== null && r.born > year - 14) bad.push(`国:${f.name}の君主${r.name}(生${r.born})`); }
      // そのあと時間を進めても、同じ事件は二度起きない(この間に史実の年月で自動に起きる国は、その時点の年齢で見る)
      const facs1 = new Set(D.scenario.factions.map(f => f.id));
      const seen = new Map(); const tick = () => { for (const f of D.scenario.factions) if (!facs1.has(f.id) && !seen.has(f.id)) seen.set(f.id, c.calendar().year); };
      const d0 = c.day; while (c.day - d0 < 720) { window.__run(30); tick(); }
      for (const [fid, y] of seen) { const r = D.persons.find(x => x.factionId === fid && x.role === 'ruler'); if (r && r.born !== null && r.born > y - 14 && !r.fictional) bad.push(`国(自動):${fid}の君主${r.name}(生${r.born}・${y}年)`); }
      const dup = h.defs.filter(d => h.timeline.filter(t => t.eventId === d.id && t.kind === 'choice').length > 1).map(d => d.id);
      return { year, fired, bad, dup }; });
    await p.close();
  }
  check('5 自由歴史の早い発動でも、未来の人物・国は現れず(全8シナリオ)、手動と自動で同じ事件が二度起きない', Object.values(r5).every(x => x.bad.length === 0 && x.dup.length === 0) && Object.values(r5).some(x => x.fired > 0), r5);

  // 6. 肖像:ゲームの画面で表示できる人数と、シルエットのままの人数
  p = await open('s317');
  const r6 = await p.evaluate(() => { const g = window.__goko, D = window.__gokoData; document.querySelector('#persons-open').click();
    const sel = document.querySelector('.persons-faction'); sel.value = ''; sel.dispatchEvent(new Event('change'));
    const imgs = [...document.querySelectorAll('#persons .person-row img')]; const real = imgs.filter(i => i.dataset.real === 'true').length;
    document.querySelector('#persons .persons-close').click();
    return { rows: imgs.length, real, silhouette: imgs.length - real }; });
  check('6 肖像:317年の人物一覧で、全員に肖像が表示される(シルエットのままの人がいない)', r6.rows > 0 && r6.silhouette === 0, r6);
  // 7. FPSの表示(実機テスト用)
  const r7 = await p.evaluate(async () => { document.querySelector('#menu-open').click(); const box = document.querySelector('#menu-fps'); box.click(); document.querySelector('#menu-close').click(); await new Promise(r => setTimeout(r, 2200)); const t = document.querySelector('#fps-meter').textContent; const shown = !document.querySelector('#fps-meter').hidden; window.__goko.setFpsMeter(false); return { shown, t }; });
  check('7 FPSの表示を出せる', r7.shown && /FPS \d/.test(r7.t), r7);
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
