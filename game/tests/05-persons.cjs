const { chromium } = require('playwright');
(async () => {
  const S = __dirname + '/out';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__goko, null, { timeout: 90000 });
  await p.evaluate(() => { window.__goko.campaign.speed = 0; document.querySelector('#persons-open').click(); });
  await p.waitForTimeout(500);
  console.log('list:', await p.evaluate(() => JSON.stringify({ rows: document.querySelectorAll('.person-row').length, count: document.querySelector('.persons-count').textContent, detail: document.querySelector('.person-detail').innerText.replace(/\s+/g, ' ').slice(0, 260) })));
  await p.screenshot({ path: `${S}/q1-persons.png` });
  // 勢力で絞る → 人物を選ぶ → 任命
  console.log('appoint:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; const out = {};
    const f = document.querySelector('.persons-faction'); f.value = 'jin'; f.dispatchEvent(new Event('change'));
    out.jinRows = document.querySelectorAll('.person-row').length;
    document.querySelector('.person-row[data-id="tao_kan"]').click();
    out.before = c.postOf('tao_kan');
    const t = document.querySelector('.person-target'); out.options = t.options.length;
    t.value = 'city:shouchun'; document.querySelector('.person-appoint').click();
    out.msg = document.querySelector('.person-message').textContent; out.after = c.postOf('tao_kan').label;
    // 軍団の指揮官に替える(祖逖は役目を失う)
    document.querySelector('.person-target').value = 'army:army_zu_ti'; document.querySelector('.person-appoint').click();
    out.army = c.postOf('tao_kan').label; out.zuTi = c.postOf('zu_ti'); out.shouchunGov = c.cityStates.shouchun.governorId;
    out.otherFaction = c.appoint('tao_kan', { kind: 'city', id: 'ye' });
    // セーブ→変更→ロードで、任命が戻るか
    const s = JSON.parse(JSON.stringify(g.buildSave())); c.appoint('tao_kan', null); g.applySave(s); out.afterLoad = c.postOf('tao_kan')?.label;
    // 操作勢力が別のとき、任命できない表示になるか
    g.changeSettings({ playerFactionId: 'shile' }); document.querySelector('.person-row[data-id="tao_kan"]').click(); out.lockedMsg = document.querySelector('.person-message').textContent; out.boxHidden = document.querySelector('.person-appoint-box').hidden;
    g.changeSettings({ playerFactionId: null });
    return JSON.stringify(out); }));
  await p.evaluate(() => { const s = document.querySelector('.persons-sort'); s.value = 'war'; s.dispatchEvent(new Event('change')); const f = document.querySelector('.persons-faction'); f.value = ''; f.dispatchEvent(new Event('change')); document.querySelector('.person-row[data-id="shi_le"]').click(); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${S}/q2-detail.png` });
  // 縦持ち
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); await p.screenshot({ path: `${S}/q3-portrait.png` });
  console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
