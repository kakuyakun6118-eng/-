// 地理の点検:都市が通れないマスに無いか、街道がすべて引けたか、関所がすべて「門」として働くか
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  const t0 = Date.now();
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  console.log('load ms', Date.now() - t0);
  const r = await p.evaluate(() => { const g = window.__goko, c = g.campaign;
    const passes = g.allCities.filter(k => k.kind === 'pass').map(k => ({ name: k.name, ...c.passCheck(k.id) }));
    return { grid: g.grid.cols + 'x' + g.grid.rows, cities: g.allCities.filter(k => k.kind !== 'pass').length, passes: passes.length, roads: g.roadCount, failedRoads: g.roadsFailed,
      onImpassable: g.allCities.filter(k => !isFinite(g.grid.costAt(k.lon, k.lat))).map(k => k.name),
      noOwner: g.allCities.filter(k => !g.territory.factionAt(k.lon, k.lat)).map(k => k.name),
      // 門として働かない関所:自分だけ開けても通れない、または全部閉じても道のりが1.5倍にならない
      badPasses: passes.filter(x => x.open === null || (x.sealed !== null && x.sealed < x.open * 1.5)).map(x => `${x.name}:${x.open}/${x.sealed}`),
      passList: passes.map(x => `${x.name}:${x.open}/${x.sealed}`).join(' ') }; });
  console.log(JSON.stringify(r));
  if (r.failedRoads.length || r.onImpassable.length || r.noOwner.length || r.badPasses.length) throw new Error('地理の点検に失敗: ' + JSON.stringify([r.failedRoads, r.onImpassable, r.noOwner, r.badPasses]));
  console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
