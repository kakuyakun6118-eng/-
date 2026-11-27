// 仮想シナリオ「炎漢再興」の長期の進行を1回走らせ、王朝の記録をJSONに書く(Version 67 の比較試験の道具)。
// どの版(Version 64・65・67)の公開版の index.html でも動くように、無い項目は飛ばす。
// 進め方:AIだけ。プレイヤーの国は新羅にし、プレイヤーの国が滅んだら、漢(楚)以外の生きている国へ移す
// (テスト45のように楚がプレイヤーの国になると、楚のAIが止まるため。Version 67 の第1工程の調査を参照)。
// node dynasty-batch.cjs <index.html> <years> <seed> <out.json>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [html, years, seed, outp] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const p = await (await b.newContext({ viewport: { width: 1024, height: 700 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + html + '#s=s304v'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  const t0 = Date.now();
  const res = await p.evaluate(({ years, seed }) => {
    const g = window.__goko, c = g.campaign, D = window.__gokoData, V = window.__gokoVirtual; c.speed = 0;
    if (seed && window.__gokoSeed) window.__gokoSeed(seed);
    g.changeSettings({ playerFactionId: 'silla', historyMode: 'normal' });
    const F = 'chu', K = ['leadership', 'war', 'intelligence', 'politics', 'charisma'];
    const fn = (f) => D.scenario.factions.find((x) => x.id === f)?.name ?? f;
    const cityN = () => c.cities.filter((k) => k.kind !== 'pass' && D.scenario.cityOwners[k.id] === F).length;
    const power = () => { let pop = 0, troops = 0; for (const k of c.cities) { if (D.scenario.cityOwners[k.id] !== F) continue; const st = c.cityStates[k.id]; pop += st?.pop ?? k.population ?? 0; troops += st?.garrison ?? 0; } for (const s of c.armies) if (s.army.factionId === F) troops += s.army.troops.infantry + s.army.troops.cavalry + s.army.troops.archer; return { cities: cityN(), pop: Math.round(pop), troops: Math.round(troops), gold: Math.round(c.factionStates[F]?.gold ?? 0) }; };
    const core = () => { const ex = new Set(['wandu', 'pyongyang', 'hanseong', 'geumseong', 'tuyuhunting']); const cc = c.cities.filter((k) => k.kind !== 'pass' && k.lon >= 96 && !ex.has(k.id)); return cc.filter((k) => D.scenario.cityOwners[k.id] === F).length / cc.length; };
    const out = { decades: [], rulers: [], succession: [], fell: null, maxCities: 0, maxCore: 0, anomalies: [], switches: [] };
    let lastRuler = null; const pendingSucc = []; let lm = -1; const h = c.history; const d0 = c.day; let n = 0; let ly = c.calendar().year;
    out.decades.push({ y: c.calendar().year, ...power() });
    while (c.day - d0 < years * 360 && n++ < 2e7) {
      if (c.gameOver) { const nx = D.scenario.factions.filter((f) => !f.fallen && f.id !== F && c.cities.some((k) => D.scenario.cityOwners[k.id] === f.id))[0]; if (!nx) break; out.switches.push([c.dateText(), c.playerFactionId, nx.id]); c.gameOver = false; g.changeSettings({ playerFactionId: nx.id }); }
      const aw = h.awaiting; if (aw) { const ro = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find((k) => ro[k] === c.playerFactionId) ?? Object.keys(aw.choices).find((k) => ro[k]); h.choose(aw.id, h.aiPick(aw, ro, role)); }
      h.queue = h.queue.filter((q) => q.mode === 'decide');
      if (c.speed === 0) { for (const ev of c.events.filter((e) => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
      c.update(0.25);
      const m = Math.floor(c.day / 30); if (m === lm) continue; lm = m;
      // 毎月:君主の交代と、その前後の国力(交代の月と12か月後)
      const r = c.rulerOf(F); const rn = r ? r.id : null;
      if (rn !== lastRuler) { const pw = power(); out.rulers.push([c.dateText(), r?.name ?? null, r ? K.map((k) => r[k]).join('/') : '', r?.bloodline ?? '', r ? (r.traits ?? []).join('・') : '']); if (lastRuler) pendingSucc.push({ at: m, date: c.dateText(), to: r?.name ?? null, before: pw }); lastRuler = rn; }
      for (const ps of pendingSucc) if (!ps.after && m - ps.at >= 12) { ps.after = power(); out.succession.push(ps); }
      const cn = cityN(); out.maxCities = Math.max(out.maxCities, cn); out.maxCore = Math.max(out.maxCore, core());
      if (!out.fell && (D.scenario.factions.find((f) => f.id === F).fallen || c.isFallen?.(F))) out.fell = c.dateText();
      const y = c.calendar().year; if (y !== ly) { ly = y; if ((y - 304) % 10 === 0) out.decades.push({ y, ...power() }); }
    }
    // 異常の点検:能力値の範囲・国の補正の上限・漢の正統の数
    for (const x of D.persons) for (const k of K) if (!(x[k] >= 1 && x[k] <= (x.virtual ? 120 : 100))) out.anomalies.push(`${x.name}:${k}=${x[k]}`);
    if (V?.factionMult) { V.clearTraitCache(); const list = V.factionTraitEffects(F, Math.floor(c.day)); const fm = (k, a, z) => V.factionMult(list, k, a, z); const inc = V.incomeMult(list);
      out.effects = { legitCount: list.filter((e) => /漢の皇帝/.test(e.label ?? '')).length, armyBattle: fm('armyBattle', 1, 2), conscript: fm('conscript', 1, 1.6), armyFood: fm('armyFood', 0.5, 1), rebellion: fm('rebellion', 0.2, 1), income: inc };
      const raw = list.reduce((s2, e) => s2 * (e.armyBattle ?? 1), 1); if (out.effects.legitCount > 1) out.anomalies.push('漢の正統が2つ以上'); out.effects.rawArmyBattle = raw; }
    const ct = c.court;
    out.emperors = (ct.emperors ?? []).filter((r) => r.factionId === F).map((r) => ({ gen: r.gen, name: r.name, type: r.type ?? null, traits: r.traits ?? null, legit: r.legit ?? null, goals: r.goals ?? null, acc: r.accYear, end: r.endYear, reason: r.endReason, cities: [r.citiesStart, r.citiesEnd], pop: [r.popStart ?? null, r.popEnd ?? null], gold: [r.goldStart ?? null, r.goldEnd ?? null], troops: [r.troopsStart ?? null, r.troopsEnd ?? null], conquered: (r.conquered ?? []).length, expeditions: r.expeditions ?? null, vassalized: r.vassalized ?? null, temple: r.templeName, post: r.posthumous, score: r.score ?? null, grade: r.grade ?? null }));
    const blood = D.persons.filter((x) => x.bloodline === 'xuandi');
    out.blood = { total: blood.length, bornInGame: blood.filter((x) => x.id.startsWith('born_')).length, prodigies: blood.filter((x) => /天賦の才/.test(x.bio ?? '')).length, alive: blood.filter((x) => c.personStatus(x.id) !== 'dead').length };
    const st = c.strategy.st?.(F) ?? {};
    out.west = { plans: st.westPlans ?? 0, dispatched: st.westDispatched ?? 0, arrived: st.westArrived ?? 0, won: st.westWon ?? 0, failed: st.westFailed ?? 0, vassals: st.westVassals ?? 0, diplomatic: st.westDiplomatic ?? 0, annexed: st.annexed ?? 0, wars: st.wars ?? 0 };
    out.unrest = { rebellions: c.loyalty.counts?.rebellions ?? null, defections: c.loyalty.counts?.defections ?? null, disputes: ct.counts?.disputes ?? null, civilWars: ct.counts?.civilWars ?? null, usurpations: ct.counts?.usurpations ?? null, successions: ct.counts?.successions ?? null };
    out.final = { date: c.dateText(), name: fn(F), rank: ct.rankOf?.(F), ...power(), core: core(), unifiedFlag: c.history?.flags?.vh_unified === F, ruler: c.rulerOf(F)?.name ?? null, survived: !out.fell && cityN() > 0 };
    out.unified = out.final.unifiedFlag || out.maxCore >= 0.8;
    // セーブ互換:書き出して読み直し、皇帝の型・特性・称号が変わらないか
    try {
      const before = JSON.stringify([(ct.emperors ?? []).map((r) => [r.name, r.type, (r.traits ?? []).join()]), ct.emperorTraits ?? null, D.persons.filter((x) => x.bloodline).map((x) => x.id + ':' + (x.traits ?? []).join() + ':' + (x.title ?? ''))]);
      const sv = JSON.parse(JSON.stringify(g.buildSave())); const kb = Math.round(JSON.stringify(sv).length / 1024); g.applySave(sv);
      const after = JSON.stringify([(c.court.emperors ?? []).map((r) => [r.name, r.type, (r.traits ?? []).join()]), c.court.emperorTraits ?? null, D.persons.filter((x) => x.bloodline).map((x) => x.id + ':' + (x.traits ?? []).join() + ':' + (x.title ?? ''))]);
      out.save = { ok: before === after, kb };
    } catch (e) { out.save = { ok: false, err: String(e).slice(0, 200) }; }
    out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    return out;
  }, { years: +years, seed });
  res.seed = seed; res.years = +years; res.sec = Math.round((Date.now() - t0) / 1000); res.errs = errs;
  fs.writeFileSync(outp, JSON.stringify(res));
  console.log(JSON.stringify({ seed, years, sec: res.sec, survived: res.final.survived, cities: res.final.cities, max: res.maxCities, emperors: res.emperors.length, errs: errs.length }));
  await b.close();
})();
