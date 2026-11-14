// 戦略AIの早送りテスト:操作勢力を選び、数年ぶん進めて、AIの行動・戦い・資金の動きを見る
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__goko, null, { timeout: 90000 });
  const player = process.argv[3] || 'cui_bi', diff = process.argv[4] || 'normal', days = Number(process.argv[5] || 720);
  const r = await p.evaluate(([player, diff, days]) => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: player, difficulty: diff });
    const owners0 = { ...Object.fromEntries(g.allCities.map(k => [k.id, g.territory.factionAt(k.lon, k.lat)])) };
    const snap = () => Object.fromEntries(Object.entries(c.factionStates).map(([k, v]) => [k, Math.round(v.gold) + '/' + Math.round(v.grain)]));
    const t0 = performance.now(); let stops = 0, calls = 0; const start = c.day; let maxCall = 0;
    while (c.day - start < days && calls < 200000) { if (c.speed === 0) { stops++; const ev = c.events.find(e => e.status === 'pending'); if (ev) { c.setEventStatus(ev.battleId, 'cancelled'); for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; } c.speed = 8; } const t = performance.now(); c.update(0.25); maxCall = Math.max(maxCall, performance.now() - t); calls++; }
    const changed = g.allCities.filter(k => owners0[k.id] !== g.territory.factionAt(k.lon, k.lat)).map(k => `${k.name}:${owners0[k.id]}→${g.territory.factionAt(k.lon, k.lat)}`);
    const armies = {}; for (const s of c.armies) (armies[s.army.factionId] ||= []).push(s.army.name + ':' + (s.army.troops.infantry + s.army.troops.cavalry + s.army.troops.archer) + ':' + s.status + ':f' + Math.round(s.army.food));
    const strength = Object.fromEntries(Object.keys(c.factionStates).map(f => [f, Math.round(c.strengthOf(f))]));
    return { ms: Math.round(performance.now() - t0), calls, maxCallMs: Math.round(maxCall), stops, date: c.dateText(), battles: c.events.filter(e => e.status === 'completed').length, fields: c.events.filter(e => e.status === 'completed' && e.battleType === 'field_battle').length, changed, armies, strength, treasury: snap(), relations: Object.entries(c.relations).filter(([k, v]) => v !== 'peace').map(([k, v]) => k + ':' + v[0]).join(' '), persons: c.personStates, news: c.news.slice(-25).map(n => n.text) }; }, [player, diff, days]);
  console.log(JSON.stringify(r, null, 1).slice(0, 6000));
  console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
