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
  // 操作勢力なし:AIは動かない
  console.log('no player:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 8; for (let i = 0; i < 300; i++) c.update(0.25); c.speed = 0; return JSON.stringify({ day: Math.round(c.day), armies: c.armies.length, news: c.news.length, marching: c.armies.filter(s => s.status === 'marching').length }); }));
  // 晋を操作:都市で徴兵・出陣
  console.log('city actions:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'jin', difficulty: 'hard' });
    const out = {}; const st = () => Math.round(c.factionStates.jin.gold) + '/' + Math.round(c.factionStates.jin.grain);
    g.selectCity(g.cities.markers.find(m => m.city.id === 'jiankang')); out.actionsShown = !document.querySelector('.info-actions').hidden; out.before = st() + ' 守備' + c.cityState(g.allCities.find(k => k.id === 'jiankang')).garrison;
    document.querySelector('.info-recruit').click(); out.recruit = document.querySelector('#event-text').textContent; out.afterRecruit = st() + ' 守備' + c.cityStates.jiankang.garrison;
    const n0 = c.armies.length; document.querySelector('.info-raise').click(); out.raise = document.querySelector('#event-text').textContent; out.armies = n0 + '→' + c.armies.length + ' markers ' + g.armies.markers.length; out.afterRaise = st() + ' 守備' + c.cityStates.jiankang.garrison;
    g.selectCity(g.cities.markers.find(m => m.city.id === 'ye')); out.enemyCityActions = !document.querySelector('.info-actions').hidden;
    return JSON.stringify(out); }));
  await p.waitForTimeout(600); await p.screenshot({ path: `${S}/r1-city.png` });
  // 外交
  await p.evaluate(() => document.querySelector('#diplomacy-open').click()); await p.waitForTimeout(300);
  console.log('diplomacy:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; const out = {}; const row = (name) => [...document.querySelectorAll('.diplomacy-row')].find(r => r.querySelector('.diplomacy-name').textContent.startsWith(name));
    out.rows = document.querySelectorAll('.diplomacy-row').length; out.shile = row('石勒').innerText.replace(/\s+/g, ' ');
    [...row('曹嶷').querySelectorAll('button')].find(b => b.textContent === '宣戦').click(); out.war = document.querySelector('.diplomacy-message').textContent; out.rel = c.relationOf('jin', 'cao_yi');
    [...row('曹嶷').querySelectorAll('button')].find(b => b.textContent === '和睦').click(); out.tooSoon = document.querySelector('.diplomacy-message').textContent;
    [...row('石勒').querySelectorAll('button')].find(b => b.textContent === '和睦').click(); out.peaceShile = document.querySelector('.diplomacy-message').textContent;
    [...row('仇池').querySelectorAll('button')].find(b => b.textContent === '同盟').click(); out.allyChouchi = document.querySelector('.diplomacy-message').textContent;
    c.propose('han_zhao', 'peace'); return JSON.stringify(out); }));
  await p.evaluate(() => { document.querySelector('.diplomacy-close').click(); document.querySelector('#diplomacy-open').click(); }); await p.waitForTimeout(300);
  await p.screenshot({ path: `${S}/r2-diplomacy.png` });
  console.log('proposal:', await p.evaluate(() => { const c = window.__goko.campaign; const b = [...document.querySelectorAll('.diplomacy-proposal button')].find(x => x.textContent === '受ける'); const had = !!b; b && b.click(); return JSON.stringify({ had, rel: c.relationOf('jin', 'han_zhao'), left: c.proposals.length }); }));
  await p.evaluate(() => { window.__goko.campaign.setRelation('jin', 'han_zhao', 'war'); document.querySelector('.diplomacy-close').click(); });
  // 時間を進める:AIが動き、プレイヤーの都市や軍団に敵が来たら、時間が止まって会戦の知らせが出る
  console.log('run:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 8; let n = 0; while (c.speed !== 0 && n++ < 6000) c.update(0.25);
    const ev = c.events.find(e => e.status === 'pending'); return JSON.stringify({ date: c.dateText(), stoppedByEvent: c.speed === 0, event: ev ? `${ev.battleType} ${ev.location.name} 攻:${ev.attackerFactionId} 守:${ev.defenderFactionId}` : null, notice: document.querySelector('#event-text').textContent, prepButton: !document.querySelector('#event-open').hidden, auto: c.events.filter(e => e.status === 'completed').length, armies: c.armies.length, news: c.news.slice(-5).map(x => x.text) }); }));
  await p.waitForTimeout(800); await p.screenshot({ path: `${S}/r3-event.png` });
  // セーブ・ロード:AIが作った軍団・関係・出来事・守備兵が戻るか
  console.log('save/load:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; const s = JSON.parse(JSON.stringify(g.buildSave())); const snap = () => JSON.stringify([c.armies.map(a => a.army.id + ':' + a.army.name).sort(), c.relations, c.news.length, c.cityStates.jiankang.garrison, c.proposals.length, Math.round(c.day), c.playerFactionId, c.difficulty]);
    const a = snap(); c.setRelation('jin', 'shile', 'alliance'); c.news.length = 0; const extra = c.raiseArmy('wuchang', 3000); c.cityStates.jiankang.garrison = 1; g.changeSettings({ playerFactionId: null, difficulty: 'easy' });
    g.applySave(s); const b2 = snap(); return JSON.stringify({ version: s.version, same: a === b2, armies: c.armies.length, markers: g.armies.markers.length, extraWas: typeof extra === 'string' ? extra : extra.army.id }); }));
  console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
