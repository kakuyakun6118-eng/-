const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__goko, null, { timeout: 90000 });
  const years = Number(process.argv[4] || 20);
  await p.evaluate(([d]) => { window.__goko.changeSettings({ playerFactionId: 'cui_bi', difficulty: d }); }, [process.argv[3] || 'hard']);
  for (let y = 1; y <= years; y++) {
    const r = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const start = c.day; let maxMs = 0, n = 0; const t0 = performance.now();
      while (c.day - start < 360 && n++ < 100000) { if (c.speed === 0) { const ev = c.events.find(e => e.status === 'pending'); if (ev) { c.setEventStatus(ev.battleId, 'cancelled'); for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; } c.speed = 8; } const t = performance.now(); c.update(0.25); maxMs = Math.max(maxMs, performance.now() - t); }
      const save = JSON.stringify(g.buildSave()); const bad = c.armies.filter(s => !isFinite(s.army.lon) || !isFinite(s.army.morale) || Object.values(s.army.troops).some(v => !isFinite(v) || v < 0)).length;
      const fs = Object.values(c.factionStates); const cities = {}; for (const k of g.allCities) { const f = g.territory.factionAt(k.lon, k.lat); cities[f] = (cities[f] || 0) + 1; }
      return { date: c.dateText().slice(0, 4), ms: Math.round(performance.now() - t0), maxMs: Math.round(maxMs), armies: c.armies.length, events: c.events.length, news: c.news.length, saveKB: Math.round(save.length / 1024), badArmies: bad, maxGold: Math.round(Math.max(...fs.map(f => f.gold))), minGold: Math.round(Math.min(...fs.map(f => f.gold))), garrisonMax: Math.max(...Object.values(c.cityStates).map(s => s.garrison)), stuckFighting: c.armies.filter(s => s.status === 'fighting' && !c.openEventOfArmy(s.army.id)).length, cities: Object.entries(cities).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + v).join(' ') }; });
    if (y <= 3 || y % 4 === 0 || y === years) console.log(JSON.stringify(r));
  }
  console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
