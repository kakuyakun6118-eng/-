const { chromium } = require('playwright');
const S = __dirname + '/out';
const URL = 'http://127.0.0.1:4179/index.html';
const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const errs = [];
const open = async () => {
  const ctx = await chromium.launchPersistentContext(S + '/profile', { args, viewport: { width: 844, height: 390 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
  const p = ctx.pages()[0] || await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto(URL);
  await p.waitForFunction(() => window.__goko, null, { timeout: 60000 });
  return { ctx, p };
};
(async () => {
  let { ctx, p } = await open();
  const T = `const t = (x) => x.infantry + x.cavalry + x.archer;`;
  // ---- 1. 行軍中のセーブ・ロード ----
  console.log('1 行軍中:', await p.evaluate(async () => {
    const g = window.__goko, c = g.campaign;
    c.orderMove('army_zu_ti', c.planRoute('army_zu_ti', { lon: 116.6, lat: 33.4 }));
    c.speed = 8; for (let i = 0; i < 60; i++) c.update(0.25);
    const s0 = c.stateOf('army_zu_ti'); const at = [s0.army.lon.toFixed(3), s0.army.lat.toFixed(3)]; const day = c.day; const food = s0.army.food;
    const save = JSON.parse(JSON.stringify(g.buildSave()));
    for (let i = 0; i < 80; i++) c.update(0.25);
    const moved = [s0.army.lon.toFixed(3), s0.army.lat.toFixed(3)];
    g.applySave(save);
    const s1 = c.stateOf('army_zu_ti');
    const same = s1.army.lon.toFixed(3) === at[0] && s1.army.lat.toFixed(3) === at[1] && c.day === day && s1.army.food === food;
    const before = { status: s1.status, hasRoute: !!s1.route, speed: c.speed, date: document.querySelector('#clock-date').textContent };
    c.speed = 8; for (let i = 0; i < 400 && s1.status === 'marching'; i++) c.update(0.25);
    return JSON.stringify({ savedAt: at, movedOnTo: moved, restoredSame: same, ...before, afterResume: s1.status, arrived: [s1.army.lon.toFixed(2), s1.army.lat.toFixed(2)] });
  }));
  // ---- 2. 攻城戦の最中のセーブ・ロード → やり直して落城 → 保存 → 二重反映 ----
  await p.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 0; const city = g.allCities.find(k => k.id === 'ye'); const a = c.stateOf('army_liu_yao').army; a.lon = city.lon + 0.05; a.lat = city.lat - 0.25; c.cityStates.ye = { ...c.cityState(city), morale: 30, food: 1 }; const ev = { battleId: 'siege_ye', battleType: 'siege_battle', attackerArmyId: 'army_liu_yao', defenderArmyId: null, defenderCityId: 'ye', location: { lon: city.lon, lat: city.lat, name: city.name }, terrain: 'plain', attackerFactionId: a.factionId, defenderFactionId: 'shile', status: 'pending', createdAt: { day: 0, text: '' } }; c.events.push(ev); g.openBattleId = ev.battleId; g.startBattle('attacker'); });
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 });
  console.log('2 攻城戦の最中に保存→ロード:', await p.evaluate(() => { const g = window.__goko; for (let i = 0; i < 100; i++) g.battle.sim.update(0.1); const save = JSON.parse(JSON.stringify(g.buildSave())); window.__mid = save; g.applySave(save); return JSON.stringify({ activeBattle: save.activeBattle, battleAfterLoad: g.battle, prepOpen: !document.querySelector('#battle').hidden, eventStatus: g.campaign.eventOf('siege_ye').status, notice: document.querySelector('#event-text').textContent }); }));
  await p.evaluate(() => document.querySelector('.battle-start').click());
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 });
  console.log('  やり直して決着→反映→保存→ロード:', await p.evaluate(async () => {
    const g = window.__goko, c = g.campaign, s = g.battle.sim; const t = (x) => x.infantry + x.cavalry + x.archer;
    for (let i = 0; i < 60000 && !s.result; i++) s.update(0.1);
    const res = s.result; g.finishBattle(res);
    const owner1 = g.territory.factionAt(114.35, 36.33);
    await g.saves.put('slot2', g.buildSave());
    // 状態を変えてから、保存したものを読み込む
    g.setCityOwner('ye', 'jin'); c.cityStates.ye.garrison = 5; c.stateOf('army_liu_yao').army.troops.infantry = 1;
    g.applySave((await g.saves.get('slot2')).data);
    const st = JSON.stringify(c.cityStates.ye); const army = t(c.stateOf('army_liu_yao').army.troops);
    c.applyBattleResult(res); // もう一度反映を試みる
    return JSON.stringify({ reason: res.reason, ownerAfterBattle: owner1, ownerAfterLoad: g.territory.factionAt(114.35, 36.33), cityOwnerData: g.buildSave().cities.ye.ownerId, labelDot: [...document.querySelectorAll('.city-label')].find(e => e.textContent === '鄴').querySelector('.dot').style.background, cityState: st, army, eventStatus: c.eventOf('siege_ye').status, doubleApplied: st !== JSON.stringify(c.cityStates.ye) || army !== t(c.stateOf('army_liu_yao').army.troops) });
  }));
  // ---- 3. 野戦の最中のセーブ・ロード、壊滅した軍団の復元 ----
  await p.evaluate(() => { const g = window.__goko, c = g.campaign; const x = c.stateOf('army_liu_yao').army, y = c.stateOf('army_duan').army; x.lon = 115.1; x.lat = 36.55; y.lon = 114.95; y.lat = 36.68; window.__pre = JSON.parse(JSON.stringify(g.buildSave())); const ev = { battleId: 'field_x', battleType: 'field_battle', attackerArmyId: 'army_liu_yao', defenderArmyId: 'army_duan', defenderCityId: null, location: { lon: 115.02, lat: 36.61, name: 't' }, terrain: 'plain', attackerFactionId: x.factionId, defenderFactionId: y.factionId, status: 'pending', createdAt: { day: 0, text: '' } }; c.events.push(ev); g.openBattleId = 'field_x'; g.difficulty = 'easy'; g.startBattle('attacker'); });
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 });
  console.log('3 野戦の最中に保存→ロード→やり直して壊滅→以前のデータをロード:', await p.evaluate(() => {
    const g = window.__goko, c = g.campaign;
    for (let i = 0; i < 100; i++) g.battle.sim.update(0.1);
    const mid = JSON.parse(JSON.stringify(g.buildSave())); g.applySave(mid);
    const r1 = { battle: g.battle, prepOpen: !document.querySelector('#battle').hidden, status: c.eventOf('field_x').status, duan: c.stateOf('army_duan').status };
    return JSON.stringify(r1);
  }));
  await p.evaluate(() => document.querySelector('.battle-start').click());
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 });
  console.log('  ', await p.evaluate(() => {
    const g = window.__goko, c = g.campaign, s = g.battle.sim;
    for (const u of s.units) if (u.side === 'attacker' && !u.isCommand) s.order(u.id, { kind: 'pursue' });
    for (let i = 0; i < 30000 && !s.result; i++) s.update(0.1);
    g.finishBattle(s.result);
    const gone = !c.stateOf('army_duan'); const labels1 = [...document.querySelectorAll('.army-label')].length;
    g.applySave(window.__pre);
    return JSON.stringify({ duanOutcome: s.result.sides.defender.outcome, removedAfterBattle: gone, labelsAfterBattle: labels1, restoredByLoad: !!c.stateOf('army_duan'), labelsAfterLoad: [...document.querySelectorAll('.army-label')].length, markers: g.armies.markers.length, events: c.events.map(e => e.battleId + ':' + e.status).join(',') });
  }));
  // ---- 4. 画面からの操作:メニュー → セーブ1 → 設定 → 書き出し → 壊れたデータの読み込み ----
  await p.evaluate(() => { const g = window.__goko; g.campaign.speed = 0; document.querySelector('#event').hidden = true; });
  await p.locator('#menu-open').tap(); await p.waitForTimeout(600);
  await p.locator('#menu-faction').selectOption('jin');
  await p.locator('#menu-opacity').evaluate((el) => { el.value = '1.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.locator('.menu-slot', { hasText: 'セーブ1' }).locator('button', { hasText: 'セーブ' }).tap(); await p.waitForTimeout(700);
  console.log('4 メニュー:', await p.evaluate(() => JSON.stringify({ msg: document.querySelector('#menu-message').textContent, storage: document.querySelector('#menu-storage').textContent, slot1: document.querySelectorAll('.menu-slot')[1].innerText.replace(/\s+/g, ' '), auto: document.querySelectorAll('.menu-slot')[0].innerText.replace(/\s+/g, ' ').slice(0, 60) })));
  await p.screenshot({ path: S + '/sv/1-menu.png' });
  await p.locator('#menu-export').tap(); await p.waitForTimeout(400);
  const json = await p.locator('#menu-json').inputValue();
  console.log('  書き出し:', json.length, '文字 / version', JSON.parse(json).version, '/ 都市', Object.keys(JSON.parse(json).cities).length, '/ 軍団', JSON.parse(json).campaign.armies.length, '/ 勢力', JSON.parse(json).factions.length);
  await p.locator('#menu-json').fill('{"version": 99}'); await p.locator('#menu-import').tap(); await p.waitForTimeout(300);
  console.log('  新しすぎる版:', await p.evaluate(() => document.querySelector('#menu-message').textContent));
  await p.locator('#menu-json').fill('これはセーブデータではない'); await p.locator('#menu-import').tap(); await p.waitForTimeout(300);
  console.log('  壊れたデータ:', await p.evaluate(() => document.querySelector('#menu-message').textContent), '| メニューは開いたまま:', await p.evaluate(() => !document.querySelector('#menu').hidden));
  await p.locator('#menu-json').fill(json); await p.locator('#menu-import').tap(); await p.waitForTimeout(600);
  console.log('  正しいデータの読み込み:', await p.evaluate(() => JSON.stringify({ menuClosed: document.querySelector('#menu').hidden, notice: document.querySelector('#event-text').textContent })));
  // 操作勢力の制限:晋を選んだ状態で、劉曜軍(前趙)に移動を命じる
  console.log('  操作勢力の制限:', await p.evaluate(() => { const g = window.__goko; g.selectArmy(g.armies.markerOf('army_liu_yao')); document.querySelector('.army-move').click(); const a = document.querySelector('#event-text').textContent; g.selectArmy(g.armies.markerOf('army_zu_ti')); document.querySelector('.army-move').click(); return a + ' | 晋の軍団: ' + document.querySelector('.army-message').textContent; }));
  // 時間のボタン
  console.log('  時間:', await p.evaluate(() => { const c = window.__goko.campaign; const out = []; const b = () => document.querySelector('#clock-pause').textContent + '/' + document.querySelector('#clock-speed').textContent + '/' + c.speed; out.push(b()); document.querySelector('#clock-pause').click(); out.push(b()); document.querySelector('#clock-speed').click(); document.querySelector('#clock-speed').click(); out.push(b()); document.querySelector('#clock-pause').click(); out.push(b()); return out.join('  →  '); }));
  await ctx.close();
  // ---- 5. ブラウザを閉じて開き直す ----
  ({ ctx, p } = await open());
  await p.locator('#menu-open').tap(); await p.waitForTimeout(700);
  console.log('5 再起動後:', await p.evaluate(() => [...document.querySelectorAll('.menu-slot')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 70)).join(' ‖ ')));
  await p.locator('.menu-slot', { hasText: 'セーブ1' }).locator('button', { hasText: 'ロード' }).tap(); await p.waitForTimeout(800);
  console.log('  セーブ1をロード:', await p.evaluate(() => { const g = window.__goko; return JSON.stringify({ date: document.querySelector('#clock-date').textContent, ye: g.territory.factionAt(114.35, 36.33), yeState: g.campaign.cityStates.ye, settings: g.settings(), liuyao: g.campaign.stateOf('army_liu_yao').army.troops }); }));
  await p.evaluate(() => { document.querySelector('#event').hidden = true; window.__goko.focus(114.3, 36.2, 40); }); await p.waitForTimeout(900);
  await p.screenshot({ path: S + '/sv/2-after-restart.png' });
  console.log('errors:', errs.slice(0, 4));
  await ctx.close();
})();
