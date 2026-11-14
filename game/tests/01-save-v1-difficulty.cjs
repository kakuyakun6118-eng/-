const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const open = async (file) => { const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); await p.goto('file://' + file); await p.waitForFunction(() => window.__goko, null, { timeout: 60000 }); return p; };
  // 旧版(v1)で作っておいたセーブ(行軍中・都市占領後)を読み込む
  const v1 = require('fs').readFileSync(__dirname + '/fixtures/save-v1.json', 'utf8');
  console.log('v1 save: version', JSON.parse(v1).version, 'difficulty', JSON.parse(v1).settings.difficulty, 'has personStates', 'personStates' in JSON.parse(v1).campaign);
  const p = await open(process.argv[2]);
  console.log('v1 → v2 load:', await p.evaluate((v1) => { const g = window.__goko, c = g.campaign; g.applySave(JSON.parse(v1)); const z = c.stateOf('army_zu_ti'); const s2 = g.buildSave(); return JSON.stringify({ ye: g.territory.factionAt(114.35, 36.33), yeState: c.cityStates.ye, zu: z.status + ' route=' + !!z.route, shihuInf: c.stateOf('army_shi_hu').army.troops.infantry, date: document.querySelector('#clock-date').textContent, resaveVersion: s2.version, personStates: s2.campaign.personStates }); }, v1));
  console.log('難易度:', await p.evaluate(() => [...document.querySelectorAll('#menu-difficulty option')].map(o => o.value + '=' + o.textContent).join(' / ')));
  // 非常に難しい・非常に易しいで野戦を1回ずつ、守将つきの攻城戦、指揮官の戦死の記録
  for (const diff of ['veryEasy', 'veryHard']) {
    await p.evaluate((diff) => { const g = window.__goko, c = g.campaign; c.speed = 0; g.difficulty = diff; const x = c.stateOf('army_liu_yao').army, y = c.stateOf('army_shi_hu').army; x.lon = 115.1; x.lat = 36.55; y.lon = 114.95; y.lat = 36.68; const ev = { battleId: 'f_' + diff, battleType: 'field_battle', attackerArmyId: 'army_liu_yao', defenderArmyId: 'army_shi_hu', defenderCityId: null, location: { lon: 115.02, lat: 36.61, name: 't' }, terrain: 'plain', attackerFactionId: x.factionId, defenderFactionId: y.factionId, status: 'pending', createdAt: { day: 0, text: '' } }; c.events.push(ev); g.openBattleId = ev.battleId; g.startBattle('attacker'); }, diff);
    await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 });
    console.log(' 野戦', diff, await p.evaluate(() => { const g = window.__goko, s = g.battle.sim; const prof = s.ai.profile.name; for (const u of s.units) if (u.side === 'attacker' && !u.isCommand) s.order(u.id, { kind: 'pursue' }); for (let i = 0; i < 30000 && !s.result; i++) s.update(0.1); const r = s.result; const t = (x) => x.infantry + x.cavalry + x.archer; const before = [t(r.sides.attacker.before), t(r.sides.defender.before)]; g.applySave(g.buildSave() && window.__base || g.buildSave()); return JSON.stringify({ ai: prof, winner: r.winner, reason: r.reason, sec: r.durationSeconds, att: before[0] + '→' + t(r.sides.attacker.after), def: before[1] + '→' + t(r.sides.defender.after) }); }));
    await p.evaluate(() => { const g = window.__goko; if (g.battle) { g.battle.dispose(); g.battle = null; g.root.classList.remove('in-battle'); } });
  }
  console.log('守将:', await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.setCityOwner('ye', 'shile'); delete c.cityStates.ye; const city = g.allCities.find(k => k.id === 'ye'); const a = c.stateOf('army_liu_yao').army; const ev = { battleId: 'k9', battleType: 'siege_battle', attackerArmyId: 'army_liu_yao', defenderArmyId: null, defenderCityId: 'ye', location: { lon: city.lon, lat: city.lat, name: city.name }, terrain: 'plain', attackerFactionId: a.factionId, defenderFactionId: 'shile', status: 'pending', createdAt: { day: 0, text: '' } }; c.events.push(ev); g.openBattlePrep('k9'); return document.querySelector('.battle-side.defender .battle-commander').textContent; }));
  await p.evaluate(() => { const g = window.__goko; g.campaign.cityStates.ye = { ...g.campaign.cityState(g.allCities.find(k => k.id === 'ye')), morale: 30, food: 1 }; g.openBattlePrep('k9'); document.querySelector('.battle-start').click(); });
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 });
  console.log('落城後の人物の状態:', await p.evaluate(() => { const g = window.__goko, s = g.battle.sim; for (let i = 0; i < 60000 && !s.result; i++) s.update(0.1); g.finishBattle(s.result); return JSON.stringify({ reason: s.result.reason, personStates: g.campaign.personStates, yeGovernor: g.campaign.cityStates.ye.governorId ?? null, saved: g.buildSave().campaign.personStates }); }));
  console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
