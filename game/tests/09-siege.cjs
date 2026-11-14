// 攻城戦のテスト:軍団を都市のそばに置いて攻城戦を始め、計算を早送りして結末と戦略マップへの反映を確かめる
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const run = async (name, armyId, cityId, opts = {}) => {
    const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
    p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2]);
    await p.waitForFunction(() => window.__goko, null, { timeout: 60000 });
    await p.evaluate(([armyId, cityId, opts]) => {
      const g = window.__goko, c = g.campaign; c.speed = 0;
      const city = g.allCities.find(k => k.id === cityId);
      const a = c.stateOf(armyId).army; a.lon = city.lon + 0.05; a.lat = city.lat - 0.25;
      if (opts.food !== undefined) a.food = opts.food;
      if (opts.troops) a.troops = opts.troops;
      if (opts.cityState) c.cityStates[cityId] = { ...c.cityState(city), ...opts.cityState };
      const owner = g.campaign.constructor && window.__goko.territory.factionAt(city.lon, city.lat);
      const ev = { battleId: 'siege_' + cityId, battleType: 'siege_battle', attackerArmyId: armyId, defenderArmyId: null, defenderCityId: cityId, location: { lon: city.lon, lat: city.lat, name: city.name }, terrain: 'plain', attackerFactionId: a.factionId, defenderFactionId: owner, status: 'pending', createdAt: { day: 0, text: '' } };
      c.events.push(ev); g.openBattleId = ev.battleId; g.startBattle(opts.side || 'attacker');
    }, [armyId, cityId, opts]);
    await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 });
    const r = await p.evaluate(([armyId, cityId, opts]) => {
      const g = window.__goko, bt = g.battle, s = bt.sim, sg = s.siege, c = g.campaign;
      const t = (x) => x.infantry + x.cavalry + x.archer;
      const lay = sg.layout;
      const info = { city: `${Math.round(lay.w)}x${Math.round(lay.d)} 壁高${lay.wallHeight.toFixed(1)} 城門${lay.segments.filter(k => k.kind === 'gate').length} 区画${lay.segments.filter(k => k.south).length} 門HP${Math.round(lay.segments.find(k => k.kind === 'gate').maxHp)} 壁HP${Math.round(lay.segments.find(k => k.kind === 'wall' && k.south).maxHp)}`, terrain: document.querySelector('.hud-terrain').textContent.slice(3, 40), units: s.units.map(u => `${u.side[0]}:${u.name}:${Math.round(u.men)}${u.elevation ? '^' : ''}`).join(' ') };
      const owner0 = window.__goko.territory.factionAt(g.allCities.find(k => k.id === cityId).lon, g.allCities.find(k => k.id === cityId).lat);
      // プレイヤー側の命令:攻撃側なら兵器と歩兵を城門へ(自動の判断と同じ動きをさせる)。指定があれば撤退
      const phases = new Set(); let gateDown = null, wallDown = null, firstIn = null;
      const auto = new (s.ai.constructor)(s.playerSide, sg); // プレイヤー側も自動で動かして、最後まで進める
      for (let i = 0; i < 60000 && !s.result; i++) {
        if (opts.play !== 'idle') auto.update(s, 0.1);
        if (i % 20 === 0) window.__snap = s.units.filter(u => u.side === 'defender').map(u => u.name.slice(0, 6) + ':' + Math.round(u.men) + '/' + u.maxMen + ':' + u.state.slice(0, 4) + ':m' + Math.round(u.morale) + (u.elevation ? '^' : '') + '@' + Math.round(u.x) + ',' + Math.round(u.z) + (u.engaged.length ? 'E' + u.engaged.length : '')).join(' ') + ' || t=' + Math.round(s.time) + ' left=' + (s.menOf('attacker', false) / s.initialMenOf('attacker')).toFixed(2) + ' food=' + sg.attackerFood + ' ' + s.units.filter(u => u.side === 'attacker').map(u => u.classId.slice(0, 5) + ':' + Math.round(u.men) + ':' + u.state.slice(0, 4) + (u.escaped ? '!' : '') + ':m' + Math.round(u.morale)).join(' ');
        s.update(0.1);
        phases.add(sg.phase);
        if (opts.play === 'retreat' && i === 1500) s.retreatAll('attacker');
        if (gateDown === null && lay.segments.some(k => k.kind === 'gate' && k.hp <= 0)) gateDown = Math.round(s.time);
        if (wallDown === null && lay.segments.some(k => k.kind === 'wall' && k.south && k.hp <= 0)) wallDown = Math.round(s.time);
        if (firstIn === null && s.units.some(u => u.side === 'attacker' && s.isActive(u) && sg.inside(u.x, u.z))) firstIn = Math.round(s.time);
      }
      const dbg = s.units.filter(u => u.side === 'attacker').map(u => `${u.name}:${Math.round(u.men)}/${u.maxMen}:m${Math.round(u.morale)}:${u.state}`).join(' ');
      const res = s.result;
      if (!res) return { ...info, result: 'none after 100min', phase: sg.phase, day: sg.day.toFixed(1) };
      const before = t(c.stateOf(armyId).army.troops);
      g.finishBattle(res);
      const city = g.allCities.find(k => k.id === cityId);
      const st1 = JSON.stringify(c.cityStates[cityId]); const army1 = c.stateOf(armyId) ? t(c.stateOf(armyId).army.troops) : 0;
      c.applyBattleResult(res);
      const dbl = st1 !== JSON.stringify(c.cityStates[cityId]) || army1 !== (c.stateOf(armyId) ? t(c.stateOf(armyId).army.troops) : 0);
      const ddbg = s.units.filter(u => u.side === 'defender').map(u => `${u.name}:${Math.round(u.men)}/${u.maxMen}:m${Math.round(u.morale)}:${u.state}${u.elevation ? '^' : ''}`).join(' '); return { snap: window.__snap, ...info, winner: res.winner, reason: res.reason, sec: res.durationSeconds, days: res.siege.days, phases: [...phases].join('>'), gateDownAt: gateDown, wallDownAt: wallDown, firstInsideAt: firstIn, enginesLost: sg.enginesLost, attacker: `${before}→${army1} ${res.sides.attacker.outcome}`, defender: `${t(res.sides.defender.before)}→${t(res.sides.defender.after)} ${res.sides.defender.outcome} 捕虜${res.sides.defender.captured} 守将${res.sides.defender.commander}`, siege: JSON.stringify(res.siege), owner: `${owner0}→${window.__goko.territory.factionAt(city.lon, city.lat)}`, cityState: st1, event: c.events.at(-1).status, doubleApplied: dbl, armyStatus: c.stateOf(armyId) ? c.stateOf(armyId).status : 'removed' };
    }, [armyId, cityId, opts]);
    console.log('■', name, '\n ', JSON.stringify(r).slice(0, 1700));
    await p.context().close();
  };
  const which = (process.argv[3] || '1,2,3').split(',');
  if (which.includes('1')) await run('1 小都市(上邽)を劉曜軍34,000で攻める', 'army_liu_yao', 'shanggui');
  if (which.includes('2')) await run('2 大都市(鄴・守将あり)を劉曜軍で攻める', 'army_liu_yao', 'ye');
  if (which.includes('3')) await run('3 王都(洛陽)を祖逖軍5,000で攻める', 'army_zu_ti', 'luoyang');
  if (which.includes('4')) await run('4 攻撃側が途中で撤退', 'army_liu_yao', 'ye', { play: 'retreat' });
  if (which.includes('5')) await run('5 食糧2日分で攻める', 'army_liu_yao', 'ye', { food: 2 });
  if (which.includes('6')) await run('6 守備隊の士気が低く食糧もない都市', 'army_liu_yao', 'ye', { cityState: { morale: 30, food: 1 } });
  if (which.includes('7')) await run('7 防御側を指揮(攻撃側は自動)', 'army_zu_ti', 'ye', { side: 'defender' });
  console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
