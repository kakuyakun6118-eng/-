// テスト45の主走(100年)を、同じ手順のまま再現する。観測は「セーブの中身」と、テスト45がもともと読んでいる値だけを使う
// node collapse2.cjs <index.html> <out.json>
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [html, outp, mode] = process.argv.slice(2); const fair = mode === 'fair';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const p = await (await b.newContext({ viewport: { width: 1024, height: 700 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + html + '#s=s304v'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla', historyMode: 'normal' }); c.speed = 0;
    const F = 'chu', K = ['leadership', 'war', 'intelligence', 'politics', 'charisma'];
    const fn = (f) => D.scenario.factions.find(x => x.id === f)?.name ?? f;
    const founders = D.persons.filter(x => x.id.startsWith('vh_')).map(x => x.id);
    const O = window.__obs = { years: [], losses: [], gains: [], deaths: [], rulers: [], switches: [], fell: null };
    let owners = { ...D.scenario.cityOwners }; let lastRuler = null; const seen = new Set();
    window.__watch = () => { const cur = D.scenario.cityOwners; for (const k of c.cities) { const a = owners[k.id], b2 = cur[k.id]; if (a !== b2) { if (a === F) O.losses.push([c.dateText(), k.name, fn(b2)]); if (b2 === F) O.gains.push([c.dateText(), k.name, fn(a)]); } } owners = { ...cur };
      const r = D.persons.find(x => x.factionId === F && x.role === 'ruler'); const rn = r ? r.name : null; if (rn !== lastRuler) { O.rulers.push([c.dateText(), rn, r ? K.map(k => r[k]).join('/') : '', r ? (r.traits ?? []).join('・') : '', r ? r.id : '']); lastRuler = rn; } };
    window.__obsYear = () => { // セーブを作って、その中身から数える
      const sv = g.buildSave(); const cp = sv.campaign; const fs2 = cp.factionStates[F] ?? {}; const mine = Object.entries(sv.cities).filter(([id, s]) => s.ownerId === F && c.cities.find(k => k.id === id)?.kind !== 'pass');
      const ar = cp.armies.filter(a => a.army.factionId === F); const tr = ar.reduce((n, a) => n + a.army.troops.infantry + a.army.troops.cavalry + a.army.troops.archer, 0);
      const ps = cp.personStates ?? {};
      const off = D.persons.filter(x => x.factionId === F && x.role !== 'ruler' && c.personStatus(x.id) === 'active');
      for (const id of founders) if (!seen.has(id) && c.personStatus(id) === 'dead') { seen.add(id); const cs = cp.court?.causes?.[id]; O.deaths.push([c.dateText(), D.persons.find(x => x.id === id).name, cs ? cs.cause : '?']); }
      const rel = cp.relations ?? {}; const wars = Object.entries(rel).filter(([k, v]) => v === 'war' && k.split('|').includes(F)).map(([k]) => k.split('|').find(x => x !== F)).filter(x => !D.scenario.factions.find(y => y.id === x)?.fallen && Object.values(sv.cities).some(s => s.ownerId === x));
      const strength = (f) => { const a = cp.armies.filter(x => x.army.factionId === f).reduce((n, x) => n + x.army.troops.infantry + x.army.troops.cavalry + x.army.troops.archer, 0); const gsum = Object.values(sv.cities).filter(s => s.ownerId === f).reduce((n, s) => n + (s.garrison ?? 0), 0); return a + gsum; };
      const r = D.persons.find(x => x.factionId === F && x.role === 'ruler');
      const st = cp.strategy ?? {}; const post = st.posture?.[F];
      const top = Object.entries(Object.values(sv.cities).reduce((m, s) => { if (s.ownerId) m[s.ownerId] = (m[s.ownerId] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => fn(f) + n).join(' ');
      O.years.push({ date: c.dateText(), name: fn(F), cities: mine.length, pop: mine.reduce((n, [, s]) => n + (s.population ?? 0), 0), field: tr, armies: ar.length, garrison: Math.round(mine.reduce((n, [, s]) => n + (s.garrison ?? 0), 0)), order: mine.length ? Math.round(mine.reduce((n, [, s]) => n + (s.order ?? 0), 0) / mine.length) : 0,
        gold: Math.round(fs2.gold ?? 0), grain: Math.round(fs2.grain ?? 0), ruler: r ? r.name : null, rulerId: r?.id ?? null, rulerAge: r?.born ? c.calendar().year - r.born : null, rulerStats: r ? K.map(k => r[k]).join('/') : null, rulerTraits: r ? (r.traits ?? []).join('・') : '',
        officers: off.length, offAvg: off.length ? Math.round(off.reduce((a, x) => a + K.reduce((s2, k) => s2 + x[k], 0), 0) / off.length) : 0, off90: off.filter(x => K.some(k => x[k] >= 90)).length, offVh: off.filter(x => x.id.startsWith('vh_')).length,
        stab: Math.round(cp.court?.stability?.[F] ?? 0), posture: post?.posture ?? null, why: (post?.reason ?? '').slice(0, 70), wars: wars.map(w => fn(w) + ':' + strength(w) + '/' + Object.values(sv.cities).filter(s => s.ownerId === w).length), power: strength(F), top, player: sv.settings?.playerFactionId ?? null,
        notLaunched: JSON.stringify(st.stats?.[F]?.notLaunched ?? {}).slice(0, 200), log: (st.log ?? []).filter(l => l.factionId === F).slice(-6).map(l => l.date + ' ' + l.text.slice(0, 90)) });
      if (!O.fell && (D.scenario.factions.find(f => f.id === F).fallen)) O.fell = c.dateText(); };
  });
  // ---- ここからテスト45の主走と同じ ----
  await p.evaluate((opt) => { const g = window.__goko, c = g.campaign, D = window.__gokoData; if (opt.seed) window.__gokoSeed(opt.seed); g.changeSettings({ playerFactionId: 'silla', historyMode: 'normal' }); c.speed = 0;
      window.__dead = new Set(); window.__bad = { revived: [], dup: 0, owners: [], troops: [], money: [], stats: [] }; window.__first = {};
      window.__year = () => { const bad = window.__bad; const ids = D.persons.map(x => x.id); if (ids.length !== new Set(ids).size) bad.dup++;
        for (const x of D.persons) { const st = c.personStatus(x.id); if (st === 'dead') window.__dead.add(x.id); else if (window.__dead.has(x.id)) bad.revived.push(`${c.dateText()} ${x.name}`); }
        const owners = D.scenario.cityOwners;
        for (const k of c.cities) { const f = D.scenario.factions.find(y => y.id === owners[k.id]); if (!f) bad.owners.push(`持ち主の無い都市:${k.name}`); else if (f.fallen) bad.owners.push(`滅んだ国の都市:${k.name}`); }
        for (const m of g.cities.markers) if ((m.faction?.id ?? undefined) !== (owners[m.city.id] ?? undefined)) bad.owners.push(`地図と持ち主の不一致:${m.city.name}`);
        for (const s of c.armies) { const t = s.army.troops; const n = t.infantry + t.cavalry + t.archer; if (!(n >= 0) || n > 300000 || [t.infantry, t.cavalry, t.archer, s.army.food, s.army.morale].some(v => !Number.isFinite(v) || v < 0)) bad.troops.push(`${s.army.name}:${n}`); }
        for (const k of c.cities) { const st = c.cityState(k); if (!Number.isFinite(st.garrison) || st.garrison < 0 || st.garrison > 400000) bad.troops.push(`${k.name}:${st.garrison}`); }
        for (const [f, s] of Object.entries(c.factionStates)) { const floor = -4.5 * (c.economy.report(f)?.expense?.total ?? 0) - 500; const cap = Math.max(5e6, (D.scenario.startTreasury?.[f]?.grain ?? 0) * 2); if (!Number.isFinite(s.gold) || !Number.isFinite(s.grain) || s.gold < floor || s.grain < 0 || s.gold > 5e6 || s.grain > cap) bad.money.push(`${f}:${Math.round(s.gold)}/${Math.round(s.grain)}`); }
        for (const x of D.persons) for (const k of ['leadership', 'war', 'intelligence', 'politics', 'charisma']) if (!(x[k] >= 1 && x[k] <= (x.virtual ? 120 : 100))) bad.stats.push(`${x.name}:${k}=${x[k]}`);
        const h = c.history; for (const id of ['vh_emperor', 'vh_unify']) if (!window.__first[id] && ['occurred', 'branched'].includes(h.records[id]?.status) && h.records[id].date) window.__first[id] = h.records[id].date;
        for (const k of Object.keys(bad)) if (Array.isArray(bad[k]) && bad[k].length > 30) bad[k].length = 30;
        window.__obsYear(); };
      window.__run = (days) => { const h = c.history; const d0 = c.day; let n = 0; let ly = c.calendar().year; while (c.day - d0 < days && n++ < 9e6) {
        if (c.gameOver) { const nx = D.scenario.factions.filter(f => !f.fallen && (!opt.fair || f.id !== 'chu') && c.cities.some(k => D.scenario.cityOwners[k.id] === f.id))[0]; if (!nx) break; window.__obs.switches.push([c.dateText(), c.playerFactionId, nx.id]); c.gameOver = false; g.changeSettings({ playerFactionId: nx.id }); }
        const aw = h.awaiting; if (aw) { const ro = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => ro[k] === c.playerFactionId) ?? Object.keys(aw.choices).find(k => ro[k]); h.choose(aw.id, h.aiPick(aw, ro, role)); }
        h.queue = h.queue.filter(q => q.mode === 'decide');
        if (c.speed === 0) { for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
        c.update(0.25); window.__watch(); const y = c.calendar().year; if (y !== ly) { ly = y; window.__year(); } } };
      window.__mark = () => ({ date: c.dateText(), chuCities: c.cities.filter(k => k.kind !== 'pass' && D.scenario.cityOwners[k.id] === 'chu').length, ruler: c.rulerOf('chu')?.name, saveKB: Math.round(JSON.stringify(g.buildSave()).length / 1024) });
  }, { fair });
  const marks = {}; let done = 0; await p.evaluate(() => window.__mark());
  for (const y of [20, 50, 100]) { await p.evaluate((d) => window.__run(d), (y - done) * 360); done = y; marks[y] = await p.evaluate(() => window.__mark()); console.log(y, JSON.stringify(marks[y])); }
  const obs = await p.evaluate(() => window.__obs); obs.marks = marks; obs.errs = errs; fs.writeFileSync(outp, JSON.stringify(obs)); await b.close(); })();
