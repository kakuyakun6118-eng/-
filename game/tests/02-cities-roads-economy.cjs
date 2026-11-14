const { chromium } = require('playwright');
(async () => {
  const S = __dirname + '/out';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  const t0 = Date.now();
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__goko, null, { timeout: 90000 });
  console.log('load ms', Date.now() - t0);
  await p.evaluate(() => { window.__goko.campaign.speed = 0; });
  console.log(await p.evaluate(() => { const g = window.__goko, c = g.campaign; const bad = g.allCities.filter(k => !isFinite(g.grid.costAt(k.lon, k.lat))).map(k => k.name + ':' + g.grid.kindAt(k.lon, k.lat)); const owners = {}; for (const k of g.allCities) { const f = g.territory.factionAt(k.lon, k.lat); owners[f] = (owners[f] || 0) + 1; } return JSON.stringify({ cities: g.allCities.length, markers: g.cities.markers.length, roads: g.roadCount, citiesOnImpassable: bad, territoryByFaction: owners, treasury: c.factionStates.jin, income: c.incomeOf('jin'), roadCells: ['changan', 'luoyang', 'ye'].map(id => { const k = g.allCities.find(z => z.id === id); return g.grid.onRoad(k.lon, k.lat); }) }); }));
  // 街道の効果:長安→洛陽の日数
  console.log('route 長安付近→洛陽付近:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; const a = c.stateOf('army_liu_yao'); const r = c.planRoute('army_liu_yao', { lon: 112.3, lat: 34.5 }); return Math.round(r.km) + 'km ' + c.daysFor(a, r).toFixed(1) + '日'; }));
  const shot = async (n, lon, lat, d) => { await p.evaluate(([a, b2, c]) => window.__goko.focus(a, b2, c), [lon, lat, d]); await p.waitForTimeout(900); await p.screenshot({ path: `${S}/${n}.png` }); };
  await shot('1-default', 110.9, 35.1, 62);
  await shot('2-wide', 112, 35.5, 125);
  await shot('3-zhongyuan', 114.5, 34.6, 40);
  console.log('frame ms:', await p.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const g = window.__goko; const f = () => { g.dirty = true; if (++n >= 8) res(Math.round((performance.now() - t) / 8) + ' | ' + g.renderer.info.render.triangles + ' tris, ' + g.renderer.info.render.calls + ' calls'); else requestAnimationFrame(f); }; requestAnimationFrame(f); })));
  // 都市の情報パネル(推定の表示)、操作勢力の蓄え
  await p.evaluate(() => { const g = window.__goko; g.selectCity(g.cities.markers.find(m => m.city.id === 'xuchang')); });
  await p.waitForTimeout(800);
  console.log('panel:', await p.evaluate(() => document.querySelector('#info').innerText.replace(/\s+/g, ' ').slice(0, 260)));
  await p.screenshot({ path: `${S}/4-city-panel.png` });
  console.log('treasury:', await p.evaluate(() => { const g = window.__goko; g.changeSettings({ playerFactionId: 'jin' }); const a = document.querySelector('#clock-treasury').textContent; const c = g.campaign; c.speed = 8; for (let i = 0; i < 20; i++) c.update(0.25); c.speed = 0; return a + ' → 33日後 ' + JSON.stringify(c.factionStates.jin); }));
  // セーブ・ロード(v2)と、攻城戦が新しい都市でも動くか
  console.log('save/load:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.setCityOwner('xuchang', 'shile'); const s = JSON.parse(JSON.stringify(g.buildSave())); g.setCityOwner('xuchang', 'jin'); c.factionStates.jin.gold = 1; g.applySave(s); return JSON.stringify({ cities: Object.keys(s.cities).length, xuchang: g.territory.factionAt(113.85, 34.03), gold: c.factionStates.jin.gold }); }));
  console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
