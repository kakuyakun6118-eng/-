// 画面の検査:難易度の札がゲームの処理に反映されるか、画面の大きさを変えても板が画面からはみ出さないか、肖像の表示
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  await p.evaluate(() => { window.__goko.campaign.speed = 0; });
  await p.waitForTimeout(800); await p.screenshot({ path: out + '/ui-1-map.png' });

  // 難易度:札を押すと、ゲームと戦略AIの設定が変わる
  await p.evaluate(() => document.querySelector('#menu-open').click()); await p.waitForTimeout(500);
  const diff = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const cards = [...document.querySelectorAll('.difficulty-card')]; const res = [];
    for (const card of cards) { card.click(); res.push({ card: card.dataset.value, name: card.querySelector('strong').textContent, checked: card.getAttribute('aria-checked'), game: g.difficulty, ai: c.difficulty, interval: c.strategy.profile().interval, attackRatio: c.strategy.profile().attackRatio, othersChecked: cards.filter(x => x !== card && x.getAttribute('aria-checked') === 'true').length }); }
    // 古いセーブの「非常に易しい」は「易しい」として扱う
    g.changeSettings({ difficulty: 'veryEasy' }); const legacy = g.difficulty; g.changeSettings({ difficulty: 'normal' });
    const s = g.buildSave(); return { res, legacy, saved: s.settings.difficulty, hasSelect: !!document.querySelector('select#menu-difficulty') }; });
  console.log('難易度:', JSON.stringify(diff));
  if (diff.res.length !== 4) problems.push('難易度の札が4枚でない');
  for (const r of diff.res) if (r.checked !== 'true' || r.game !== r.card || r.ai !== r.card || r.othersChecked) problems.push('難易度が反映されない: ' + JSON.stringify(r));
  if (new Set(diff.res.map(r => r.interval + '/' + r.attackRatio)).size !== 4) problems.push('難易度ごとのAIの設定が同じ');
  if (diff.legacy !== 'easy' || diff.hasSelect) problems.push('難易度の互換またはプルダウンの残り');
  await p.evaluate(() => { const c = [...document.querySelectorAll('.difficulty-card')].find(x => x.dataset.value === 'hard'); c.click(); }); await p.waitForTimeout(300);
  await p.screenshot({ path: out + '/ui-2-menu.png' });
  await p.evaluate(() => document.querySelector('#scenarios-open').click()); await p.waitForTimeout(400); await p.screenshot({ path: out + '/ui-3-scenarios.png' });
  const cards = await p.evaluate(() => [...document.querySelectorAll('.scenario-card')].map(c => ({ id: c.dataset.id, year: c.querySelector('.scenario-year').textContent, facts: c.querySelectorAll('dd').length, seal: c.querySelector('.seal').textContent })));
  if (cards.length !== 8 || cards.some(c => c.facts !== 2) || cards.map(c => parseInt(c.year)).join() !== [...cards].map(c => parseInt(c.year)).sort((a, b) => a - b).join()) problems.push('シナリオの札: ' + JSON.stringify(cards));
  await p.evaluate(() => { document.querySelector('.scenarios-close').click(); document.querySelector('#persons-open').click(); document.querySelector('.person-row[data-id="shi_le"]').click(); }); await p.waitForTimeout(400); await p.screenshot({ path: out + '/ui-4-persons.png' });
  await p.evaluate(() => { document.querySelector('.persons-close').click(); document.querySelector('#diplomacy-open').click(); }); await p.waitForTimeout(400); await p.screenshot({ path: out + '/ui-5-diplomacy.png' });
  const faces = await p.evaluate(() => ({ diplomacy: document.querySelectorAll('.diplomacy-face').length, rows: document.querySelectorAll('.diplomacy-row').length }));
  if (faces.diplomacy !== faces.rows) problems.push('君主の肖像の数が勢力の数と違う');
  await p.evaluate(() => { document.querySelector('.diplomacy-close').click(); const g = window.__goko; g.selectCity(g.cities.markers.find(m => m.city.id === 'luoyang')); }); await p.waitForTimeout(900); await p.screenshot({ path: out + '/ui-6-city.png' });

  // 画面の大きさを変える:板と釦が、画面の外にはみ出さないこと
  const sizes = [[844, 390], [932, 430], [667, 375], [390, 844], [1024, 768], [1366, 768], [1920, 1200]];
  for (const [w, h] of sizes) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(350);
    for (const open of ['#menu-open', '#persons-open', '#diplomacy-open', '#scenarios']) {
      const r = await p.evaluate((open) => { for (const s of ['#menu', '#persons', '#diplomacy', '#scenarios']) document.querySelector(s).hidden = true;
        if (open === '#scenarios') document.querySelector('#scenarios').hidden = false; else document.querySelector(open).click();
        const sec = { '#menu-open': '#menu', '#persons-open': '#persons', '#diplomacy-open': '#diplomacy', '#scenarios': '#scenarios' }[open]; const inner = document.querySelector(sec + ' > div'); const q = inner.getBoundingClientRect();
        const canvas = document.querySelector('#map').getBoundingClientRect(); const small = [...document.querySelectorAll(sec + ' button')].filter(x => x.offsetParent && (x.getBoundingClientRect().height < 27)).length;
        return { sec, left: Math.round(q.left), right: Math.round(q.right), top: Math.round(q.top), bottom: Math.round(q.bottom), vw: innerWidth, vh: innerHeight, canvas: Math.round(canvas.width) + 'x' + Math.round(canvas.height), small, scrollX: document.documentElement.scrollWidth > innerWidth + 1 }; }, open);
      if (r.left < -1 || r.right > r.vw + 1 || r.top < -1 || r.bottom > r.vh + 1 || r.scrollX || r.small || r.canvas !== `${w}x${h}`) problems.push(`${w}x${h} ${JSON.stringify(r)}`);
    }
    if (w === 390) await p.screenshot({ path: out + '/ui-7-portrait.png' });
    if (w === 1920) { await p.evaluate(() => document.querySelector('#diplomacy-open').click()); await p.waitForTimeout(300); await p.screenshot({ path: out + '/ui-8-pc-diplomacy.png' }); }
    await p.evaluate(() => { for (const s of ['#menu', '#persons', '#diplomacy', '#scenarios']) document.querySelector(s).hidden = true; });
  }
  console.log('画面の大きさ:', sizes.map(s => s.join('x')).join(' '), problems.length ? '' : 'はみ出しなし');
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
