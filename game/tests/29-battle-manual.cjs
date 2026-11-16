// 3D会戦の手動操作(Version 40):画面の釦で部隊を選び、待機・前進・後退・追撃・陣形・向き・複数選択・全選択・全軍前進・
// 視点(回転・全景・近景・追従)・一時停止と速度を操作し、全軍撤退で決着させて、戦略マップに結果が戻ることを確かめる。
// (実機での操作感は、LG gram 実機テスト手順書で、プレイヤーが確かめる)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 900)); if (!ok) problems.push(label); };
  await p.goto('file://' + process.argv[2] + '#s=s317'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });

  // 会戦準備の画面から、会戦を始める(漢の劉曜軍 対 石勒軍の石虎軍)
  await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'han_zhao' }); c.speed = 0;
    const x = c.stateOf('army_liu_yao').army, y = c.stateOf('army_shi_hu').army; x.lon = 115.1; x.lat = 36.55; y.lon = 114.95; y.lat = 36.68;
    c.events.push({ battleId: 'manual_1', battleType: 'field_battle', attackerArmyId: 'army_liu_yao', defenderArmyId: 'army_shi_hu', defenderCityId: null, location: { lon: 115.02, lat: 36.61, name: '手動操作の試験' }, terrain: 'plain', attackerFactionId: x.factionId, defenderFactionId: y.factionId, status: 'pending', createdAt: { day: 0, text: '' } });
    g.openBattlePrep('manual_1'); });
  const prep = await p.evaluate(() => ({ shown: !document.querySelector('#battle').hidden, odds: document.querySelector('#battle')?.textContent.includes('勝率') }));
  await p.evaluate(() => document.querySelector('.battle-start').click());
  await p.waitForFunction(() => window.__goko.battle && !document.querySelector('#battle-hud').hidden, null, { timeout: 90000 });
  check('1 会戦準備の画面から3D会戦を始められる', prep.shown, prep);

  const r2 = await p.evaluate(async () => { const g = window.__goko, s = g.battle.sim; const q = (sel) => document.querySelector(sel); const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mine = s.units.filter(u => u.side === s.playerSide && !u.isCommand);
    const chips = [...document.querySelectorAll(`.hud-list.${s.playerSide} .hud-chip`)]; const enemyChips = [...document.querySelectorAll(`.hud-list.${s.playerSide === 'attacker' ? 'defender' : 'attacker'} .hud-chip`)];
    chips[1].click(); await wait(50); const panel = !q('.hud-unit').hidden; const u = mine.find(x => x.id === [...s.units.filter(k => k.side === s.playerSide)][1].id) ?? mine[0];
    const orders = {};
    for (const [btn, key] of [['.hud-advance', 'advance'], ['.hud-hold', 'hold'], ['.hud-fallback', 'fallback'], ['.hud-pursue', 'pursue']]) { q(btn).click(); await wait(30); orders[key] = u.order.kind; }
    const f0 = u.formation; q('.hud-formation').click(); await wait(30); const f1 = u.formation;
    const h0 = u.heading ?? u.facing; q('.hud-turn-left').click(); await wait(30); const h1 = u.heading ?? u.facing;
    q('.hud-multi').click(); const multi = q('.hud-multi').getAttribute('aria-pressed'); q('.hud-multi').click();
    q('.hud-select-all').click(); await wait(30); const selAll = q('.hud-unit-name')?.textContent;
    q('.hud-advance-all').click(); await wait(30); const advancing = mine.filter(x => x.order.kind !== 'hold').length;
    const cam0 = JSON.stringify(g.battle.camera?.state ?? g.battle.camera?.yaw ?? null);
    for (const sel of ['.hud-rotate-left', '.hud-rotate-right', '.hud-overview', '.hud-closeup', '.hud-follow']) q(sel)?.click();
    const pause0 = s.paused ?? null; q('.hud-pause').click(); const pause1 = g.battle.paused ?? s.paused ?? null; q('.hud-pause').click(); q('.hud-speed').click(); const speed = q('.hud-speed').textContent;
    const enemyDisabled = enemyChips.every(c => c.disabled);
    // 進める
    for (let i = 0; i < 300 && !s.result; i++) s.update(0.1);
    const contact = s.units.some(x => x.state === 'fighting' || x.state === 'melee' || x.engaged);
    return { panel, orders, f0, f1, h0, h1, multi, selAll, advancing, mine: mine.length, enemyDisabled, speed, pause: [pause0, pause1], time: Math.round(s.time ?? 0), contact }; });
  await p.screenshot({ path: out + '/pc-battle-manual.png' });
  check('2 部隊を選ぶと情報が出て、待機・前進・後退・追撃の命令が効く', r2.panel && r2.orders.advance !== r2.orders.hold && r2.orders.pursue === 'pursue', r2.orders);
  check('3 陣形・向き・複数選択・全選択・全軍前進が効き、敵の部隊は選べない', r2.f0 !== r2.f1 && r2.h0 !== r2.h1 && r2.multi === 'true' && r2.advancing >= Math.min(2, r2.mine) && r2.enemyDisabled, r2);

  const r4 = await p.evaluate(async () => { const g = window.__goko, s = g.battle.sim; const q = (sel) => document.querySelector(sel); const wait = (ms) => new Promise(r => setTimeout(r, ms));
    q('.hud-retreat-all').click(); await wait(50); const confirm = !q('.hud-confirm').hidden; q('.hud-confirm-yes').click();
    for (let i = 0; i < 6000 && !s.result; i++) s.update(0.1);
    await wait(300); const result = !q('.hud-result').hidden; const title = q('.hud-result-title').textContent; const winner = s.result?.winner;
    q('.hud-leave').click(); await wait(500);
    const c = g.campaign; const ev = c.events.find(e => e.battleId === 'manual_1');
    return { confirm, result, title, winner, side: s.playerSide, back: !g.battle, status: ev?.status, record: ev?.record?.winner }; });
  check('4 全軍撤退(確認つき)で決着し、結果の画面から戦略マップへ戻ると、結果が反映される', r4.confirm && r4.result && r4.winner && r4.winner !== r4.side && r4.back && r4.status === 'completed', r4);
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
