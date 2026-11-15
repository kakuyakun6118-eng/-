// 軍団の指揮官の肖像と、会戦の勝率の目安
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  const r = await p.evaluate(async () => { const g = window.__goko, c = g.campaign; c.speed = 0; const out = {};
    // 軍団パネル:指揮官の肖像と名前。指揮官を外すと、肖像は消える
    const m = g.armies.markers.find(x => x.state.army.id === 'army_liu_yao'); g.selectArmy(m);
    out.panel = document.querySelector('.army-commander-name').textContent; out.face = !document.querySelector('.army-face').hidden && !!document.querySelector('.army-face').src;
    c.appoint('liu_yao', null); g.refreshPosts(); g.selectArmy(m); out.noCommander = document.querySelector('.army-commander-name').textContent + ' face=' + !document.querySelector('.army-face').hidden;
    c.appoint('liu_yao', { kind: 'army', id: 'army_liu_yao' }); g.refreshPosts();
    // 勝率:大軍(劉曜軍34,000)と小勢(祖逖軍5,000)。兵を入れ替えると、勝率も入れ替わる
    const a = c.stateOf('army_liu_yao').army, y = c.stateOf('army_zu_ti').army; a.lon = 115.5; a.lat = 34.0;
    const open = async (id, att, def) => { const ev = { battleId: id, battleType: 'field_battle', attackerArmyId: att, defenderArmyId: def, defenderCityId: null, location: { lon: 115.55, lat: 34.0, name: 't' }, terrain: 'plain', attackerFactionId: c.stateOf(att).army.factionId, defenderFactionId: c.stateOf(def).army.factionId, status: 'pending', createdAt: { day: 0, text: '' } };
      c.events.push(ev); g.noticeBattleId = id; g.showBattleEvent(ev); const notice = document.querySelector('#event-text').textContent; document.querySelector('#event-open').click(); await new Promise(res => setTimeout(res, 500));
      const o = { att: document.querySelector('.battle-odds-value.attacker').textContent, def: document.querySelector('.battle-odds-value.defender').textContent, pct: Number(document.querySelector('#battle').dataset.odds), notice: notice.match(/勝率の目安 \d+%/)?.[0], factors: [...document.querySelectorAll('.battle-notes li')].filter(x => x.textContent.includes('勝率の目安')).length, faces: document.querySelectorAll('.battle-face').length };
      document.querySelector('.battle-back').click(); c.setEventStatus(id, 'cancelled'); return o; };
    out.strongAttacks = await open('o1', 'army_liu_yao', 'army_zu_ti');
    out.weakAttacks = await open('o2', 'army_zu_ti', 'army_liu_yao');
    return out; });
  console.log(JSON.stringify(r, null, 1));
  if (!r.face || !r.panel.includes('劉曜') || !r.noCommander.includes('指揮官なし') || !r.noCommander.includes('face=false')) problems.push('軍団パネルの指揮官の表示');
  for (const o of [r.strongAttacks, r.weakAttacks]) if (!(o.pct >= 2 && o.pct <= 98) || !o.notice || o.factors < 2 || o.faces !== 2 || !o.att.includes(o.pct + '%') || !o.def.includes((100 - o.pct) + '%')) problems.push('勝率の表示: ' + JSON.stringify(o));
  if (!(r.strongAttacks.pct > 60 && r.weakAttacks.pct < 40)) problems.push('勝率が兵力の差を反映していない');
  await p.evaluate(async () => { const g = window.__goko, c = g.campaign; const ev = { battleId: 'o3', battleType: 'field_battle', attackerArmyId: 'army_liu_yao', defenderArmyId: 'army_zu_ti', defenderCityId: null, location: { lon: 115.55, lat: 34.0, name: '譙の西' }, terrain: 'plain', attackerFactionId: 'han_zhao', defenderFactionId: 'jin', status: 'pending', createdAt: { day: 0, text: '317年3月1日' } }; c.events.push(ev); g.noticeBattleId = 'o3'; g.showBattleEvent(ev); document.querySelector('#event-open').click(); });
  await p.waitForTimeout(1500); await p.screenshot({ path: path.join(__dirname, 'out', 'odds-prep.png') });
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
