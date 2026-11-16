// 財政・官職・募兵・内政・反乱・相性:指示書の検証項目1〜12
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sid, w = 844, h = 390) => {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(sid + ' ' + m.text().slice(0, 300)); });
    p.on('pageerror', e => errs.push(sid + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sid);
    await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => { window.__goko.campaign.speed = 0; });
    return p;
  };
  let p = await open('s317', 1920, 1200);
  const r = await p.evaluate(() => { const g = window.__goko, c = g.campaign, E = c.economy, D = window.__gokoData; const out = {};
    // 1) 軍団が多いほど維持費が増える
    const a0 = E.report('jin').expense.army; const raised = c.raiseArmy('jiankang', 5000); out.armyCost = [a0, E.report('jin').expense.army, typeof raised === 'string' ? raised : 'ok'];
    // 2) 官職で俸禄が違う
    const pids = D.persons.filter(p => p.factionId === 'jin' && p.role !== 'ruler').map(p => p.id); E.offices = {}; const pA = D.persons.find(p => p.id === 'wang_dao'), pB = D.persons.find(p => p.id === 'diao_xie');
    E.setOffice('wang_dao', 'chengxiang'); E.setOffice('diao_xie', 'canjun'); out.salary = { 丞相: E.salaryOf(pA), 参軍: E.salaryOf(pB), 定員: E.setOffice('zhou_yi', 'chengxiang') };
    // 3) 財政難が長く続くと、忠誠が下がる
    const l0 = Math.round(c.loyalty.loyalty.wang_dao); c.factionStates.jin.gold = -10; for (let m = 0; m < 4; m++) { c.factionStates.jin.gold = -100000; E.monthly(); c.loyalty.monthly(); }
    out.arrears = { months: E.arrearsOf('jin'), loyalty: [l0, Math.round(c.loyalty.loyalty.wang_dao)], why: c.loyalty.target(pA).parts.filter(x => x.includes('未払')).join() };
    c.factionStates.jin.gold = 20000; E.monthly();
    // 4) 募兵で人口と金が減る  5) 大量の募兵で治安と民忠が悪くなる
    const city = g.allCities.filter(k => D.scenario.cityOwners[k.id] === 'jin' && k.kind !== 'pass').map(k => ({ k, room: (c.cityState(k).pop ?? k.population ?? 0) * 0.06 - c.cityState(k).garrison })).sort((a, b) => b.room - a.room)[0].k; out.recruitCity = city.name; const s0 = { ...c.cityState(city) }; const e0 = { pop: s0.pop ?? city.population, order: s0.order ?? 70, support: s0.support ?? 60 }; const gold0 = c.factionStates.jin.gold;
    const m1 = c.recruit(city.id, 500); const s1 = c.cityState(city);
    out.recruit = { msg: m1, pop: [e0.pop, s1.pop], gold: [Math.round(gold0), Math.round(c.factionStates.jin.gold)], order: [e0.order, s1.order], support: [e0.support, s1.support] };
    for (let i = 0; i < 6; i++) c.recruit(city.id, 1000); const s2 = c.cityState(city); out.mass = { order: s2.order, support: s2.support, garrison: s2.garrison, cap: c.recruit(city.id, 500000) };
    // 6) 内政で収入が増える(60日に1度まで)
    const before = E.report('jin').cities.find(x => x.id === 'wu').gold; const d1 = E.develop('wu', 'commerce'); const d2 = E.develop('wu', 'commerce'); out.dev = { before, after: E.report('jin').cities.find(x => x.id === 'wu').gold, d1, d2 };
    return out; });
  console.log(JSON.stringify(r, null, 1));
  if (!(r.armyCost[1] > r.armyCost[0])) problems.push('1 軍団の維持費');
  if (!(r.salary.丞相 > r.salary.参軍) || !String(r.salary.定員).includes('定員')) problems.push('2 官職と俸禄');
  if (!(r.arrears.months >= 3 && r.arrears.loyalty[1] < r.arrears.loyalty[0] - 5)) problems.push('3 財政難と忠誠');
  if (r.recruit.msg !== null || !(r.recruit.pop[1] < r.recruit.pop[0]) || !(r.recruit.gold[1] < r.recruit.gold[0])) problems.push('4 募兵');
  if (!(r.mass.order < r.recruit.order[1] && r.mass.support < r.recruit.support[1]) || !String(r.mass.cap).includes('人口')) problems.push('5 大量の募兵');
  if (!(r.dev.after > r.dev.before) || !r.dev.d2.includes('ばかり')) problems.push('6 内政');
  await p.evaluate(() => { document.querySelector('#finance-open').click(); const s = document.querySelector('.finance-faction'); s.value = 'jin'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400); await p.screenshot({ path: path.join(__dirname, 'out', 'finance.png') });
  const ui = await p.evaluate(() => ({ text: document.querySelector('.finance-body').innerText.slice(0, 200), tables: document.querySelectorAll('.finance-cols table').length, warn: !!document.querySelector('.finance-warn') }));
  console.log('財政の画面:', JSON.stringify(ui));
  if (ui.tables !== 4) problems.push('財政の画面');
  await p.close();

  // 7) 危機のときに、忠誠の低い有力武将が反乱する(平時と比べる)
  p = await open('s357');
  const r7 = await p.evaluate(() => { const c = window.__goko.campaign, L = c.loyalty, D = window.__gokoData; window.__goko.changeSettings({ playerFactionId: 'silla' });
    const ke = D.persons.find(x => x.id === 'murong_ke'); L.loyalty.murong_ke = 32; const calm = L.unrestChance(ke);
    L.noteDefeat('qianyan'); L.noteRulerChange('qianyan'); c.economy.arrears.qianyan = 3; L.loyalty.murong_ke = 32; const crisis = L.unrestChance(ke);
    let month = 0; while (ke.factionId === 'qianyan' && month < 60) { L.loyalty.murong_ke = 32; c.economy.arrears.qianyan = 3; L.noteDefeat('qianyan'); c.day += 30; L.monthly(); month++; }
    return { calm: +(calm * 100).toFixed(1), crisis: +(crisis * 100).toFixed(1), why: L.crisisOf('qianyan').why.join('・'), months: month, faction: ke.factionId, counts: L.counts }; });
  console.log('7 危機と反乱:', JSON.stringify(r7));
  if (!(r7.crisis > r7.calm * 3) || r7.faction === 'qianyan') problems.push('7 危機の反乱');
  // 8) 相性が軍団の連携に効く
  const r8 = await p.evaluate(() => { const c = window.__goko.campaign; const a = c.stateOf('army_chui').army; const out = {};
    for (const dep of ['murong_ke', 'murong_ping']) { a.deputyId = dep; const ev = { battleId: 'syn', battleType: 'field_battle', attackerArmyId: 'army_chui', defenderArmyId: 'army_huan_wen', defenderCityId: null, location: { lon: 114, lat: 33, name: 't' }, terrain: 'plain', attackerFactionId: 'qianyan', defenderFactionId: 'jin', status: 'pending', createdAt: { day: 0, text: '' } };
      const s = window.__gokoSetup(ev); out[dep] = { morale: s.attacker.morale, synergy: s.attacker.synergy, lead: s.attacker.commander.leadership }; }
    out.base = { morale: a.morale, lead: 95 }; return out; });
  console.log('8 副将との相性:', JSON.stringify(r8));
  if (!(r8.murong_ke.synergy > 0 && r8.murong_ping.synergy < 0 && Math.abs(r8.murong_ke.synergy) <= 4 && Math.abs(r8.murong_ke.lead - 95) <= 3 && Math.abs(r8.murong_ping.lead - 95) <= 3)) problems.push('8 相性と連携');
  await p.close();

  // 9) AIの財政判断  10) セーブ  11) 古いセーブ  12) 滅亡と独立
  p = await open('s317');
  const r9 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, E = c.economy; g.changeSettings({ playerFactionId: 'silla' });
    // 豊かなとき:内政を行う。財政難:募兵せず、軍団を解散する
    c.factionStates.jin.gold = 30000; const armies0 = c.armies.filter(s => s.army.factionId === 'jin').length; c.strategy.act('jin', c.strategy.profile());
    const devs = g.allCities.filter(k => c.cityStates[k.id]?.devDay !== undefined && window.__gokoData.scenario.cityOwners[k.id] === 'jin').length;
    c.raiseArmy('jiankang', 4000); c.raiseArmy('wu', 3000); const before = c.armies.filter(s => s.army.factionId === 'jin').length;
    c.factionStates.jin.gold = -50; E.arrears.jin = 2; const g0 = g.allCities.find(k => k.id === 'shouchun'); const gar0 = c.cityState(g0).garrison; c.strategy.act('jin', c.strategy.profile());
    return { devs, before, after: c.armies.filter(s => s.army.factionId === 'jin').length, recruitedWhilePoor: c.cityState(g0).garrison > gar0 }; });
  console.log('9 AIの財政:', JSON.stringify(r9));
  if (!(r9.devs >= 1 && r9.after < r9.before && !r9.recruitedWhilePoor)) problems.push('9 AIの財政判断');
  const r10 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, E = c.economy; for (const k of Object.keys(E.offices)) if (E.offices[k] === 'situ') delete E.offices[k]; E.setOffice('wang_dao', null); E.setOffice('wang_dao', 'situ'); c.cityStates.wu = { ...c.cityState(g.allCities.find(k => k.id === 'wu')), agri: 77, commerce: 66, support: 44, pop: 123456, fortify: 8 }; E.arrears.jin = 1;
    const s = JSON.parse(JSON.stringify(g.buildSave())); E.offices = {}; c.cityStates.wu.agri = 1; E.arrears.jin = 0; g.applySave(s); const w = { ...c.cityStates.wu }; const office = E.offices.wang_dao; const arr = E.arrears.jin;
    const old = JSON.parse(JSON.stringify(s)); delete old.campaign.economy; for (const k of Object.keys(old.cities)) { for (const f of ['agri', 'commerce', 'support', 'pop', 'fortify', 'devDay', 'recruitRecent', 'recruitDay']) delete old.cities[k][f]; } delete old.campaign.loyalty; g.applySave(old);
    return { office, wu: [w.agri, w.commerce, w.support, w.pop, w.fortify], arrears: arr, oldOk: Object.keys(E.offices).length > 5, oldReport: E.report('jin').net }; });
  console.log('10・11 セーブ:', JSON.stringify(r10));
  if (r10.office !== 'situ' || r10.wu.join() !== '77,66,44,123456,8' || r10.arrears !== 1 || !r10.oldOk) problems.push('10・11 セーブ');
  const v1 = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1.json'), 'utf8');
  const r11 = await p.evaluate((v1) => { const g = window.__goko; g.applySave(JSON.parse(v1)); return g.campaign.economy.report('jin').income.total > 0; }, v1);
  if (!r11) problems.push('11 v1のセーブ');
  const r12 = await p.evaluate(() => { const c = window.__goko.campaign; window.__goko.changeSettings({ playerFactionId: 'jin' }); c.personStates.liu_cong = 'captured'; c.spoils.custody.push({ personId: 'liu_cong', kind: 'captive', holder: 'shile', from: 'han_zhao', cityId: null, day: 0 }); c.checkRulers();
    const F = window.__gokoData.scenario.factions; return { fallen: !!F.find(f => f.id === 'han_zhao').fallen, successors: F.filter(f => f.founded).map(f => f.name + ':' + c.economy.systemOf(f.id).id + ':' + Math.round(c.economy.report(f.id).net)) }; });
  console.log('12 滅亡と独立:', JSON.stringify(r12));
  if (!r12.fallen || r12.successors.length < 1) problems.push('12 滅亡と独立');
  await p.close();
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
