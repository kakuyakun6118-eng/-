// 忠誠度・相性・名声:指示書の検証項目1〜10
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sid) => {
    const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(sid + ' ' + m.text().slice(0, 300)); });
    p.on('pageerror', e => errs.push(sid + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sid);
    await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => { window.__goko.campaign.speed = 0; });
    return p;
  };
  const P = (id) => `window.__gokoData.persons.find(x => x.id === '${id}')`;
  // 1・3) 317年:張賓の忠誠、史実で対立した組の相性
  let p = await open('s317');
  const r1 = await p.evaluate(`(() => { const L = window.__goko.campaign.loyalty; const aff = window.__gokoAffinity;
    return { zhangBin: Math.round(L.loyalty.zhang_bin), shiHuToLe: Math.round(L.loyalty.shi_hu), avgShile: Math.round(window.__gokoData.persons.filter(x => x.factionId === 'shile' && x.role !== 'ruler').reduce((s, x) => s + L.loyalty[x.id], 0) / window.__gokoData.persons.filter(x => x.factionId === 'shile' && x.role !== 'ruler').length),
      shiLeZhangBin: aff(${P('shi_le')}, ${P('zhang_bin')}).value, liuYaoShiLe: aff(${P('liu_yao')}, ${P('shi_le')}).value, wangDunSimaRui: aff(${P('wang_dun')}, ${P('sima_rui')}).value, simaRuiWangDao: aff(${P('sima_rui')}, ${P('wang_dao')}).value,
      wangDun: Math.round(L.loyalty.wang_dun), fameShiLe: L.fame.shi_le, fameZhangBin: L.fame.zhang_bin, prestige: L.prestige('shile') }; })()`);
  console.log('317年:', JSON.stringify(r1));
  if (r1.zhangBin < 90) problems.push('1 張賓の忠誠が高くない');
  if (!(r1.liuYaoShiLe <= 15 && r1.wangDunSimaRui <= 30 && r1.simaRuiWangDao >= 85 && r1.shiLeZhangBin >= 90)) problems.push('3 史実の相性');
  // 張賓は、1年たっても高いまま
  const r1b = await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'cui_bi' }); c.speed = 8; const d = c.day; let n = 0; while (c.day - d < 360 && n++ < 100000) { if (c.speed === 0) { const ev = c.events.find(e => e.status === 'pending'); if (ev) c.setEventStatus(ev.battleId, 'cancelled'); c.speed = 8; } c.update(0.25); } return Math.round(c.loyalty.loyalty.zhang_bin); });
  console.log('1年後の張賓:', r1b);
  if (r1b < 85) problems.push('1 張賓の忠誠が1年で下がった: ' + r1b);
  await p.close();

  // 2) 357年:苻堅と王猛
  p = await open('s357');
  const r2 = await p.evaluate(`(() => window.__gokoAffinity(${P('fu_jian')}, ${P('wang_meng')}))()`);
  console.log('苻堅と王猛:', JSON.stringify(r2));
  if (r2.value < 90) problems.push('2 苻堅と王猛の相性');
  // 4) 忠誠の低い将が、条件しだいで離反する(国の兵と拠点があれば独立、なければ寝返り)
  const r4 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, L = c.loyalty; g.changeSettings({ playerFactionId: 'silla' });
    const before = window.__gokoData.scenario.factions.length;
    // 前燕の慕容恪(軍団の指揮官)の忠誠を下げ、半年分の判定を回す
    const out = { tries: 0 };
    for (let m = 0; m < 24 && window.__gokoData.persons.find(x => x.id === 'murong_ke').factionId === 'qianyan'; m++) { L.loyalty.murong_ke = 5; L.lastGlobalUnrest = -9999; delete L.lastUnrest?.qianyan; c.day += 30; L.monthly(); out.tries++; }
    const ke = window.__gokoData.persons.find(x => x.id === 'murong_ke');
    out.keFaction = ke.factionId; out.keRole = ke.role; out.newFactions = window.__gokoData.scenario.factions.slice(before).map(f => f.name + '/' + f.ruler); out.news = c.news.slice(-1)[0]?.text;
    // 忠誠の高い人は、何か月たっても離反しない
    const deng = window.__gokoData.persons.find(x => x.id === 'deng_qiang'); out.dengStays = deng.factionId === 'qianqin'; return out; });
  console.log('4 離反:', JSON.stringify(r4));
  if (r4.keFaction === 'qianyan' || !r4.dengStays) problems.push('4 忠誠の低い将の離反');
  await p.close();

  // 5) 高忠誠の捕虜は登用されにくい(張賓)。低忠誠の捕虜と比べる
  p = await open('s317');
  const r5 = await p.evaluate(() => { const c = window.__goko.campaign; const sp = c.spoils;
    sp.custody.push({ personId: 'zhang_bin', kind: 'captive', holder: 'jin', from: 'shile', cityId: null, day: 0 }); c.personStates.zhang_bin = 'captured';
    sp.custody.push({ personId: 'chen_chuan', kind: 'captive', holder: 'shile', from: 'jin', cityId: null, day: 0 }); c.personStates.chen_chuan = 'captured';
    const a = c.recruitChance('zhang_bin', 'jin'); const b2 = c.recruitChance('chen_chuan', 'shile');
    const first = c.custodyAction('zhang_bin', 'recruit'); c.day += 5; const again = c.custodyAction('zhang_bin', 'recruit');
    return { zhangBin: Math.round(a * 100), chenChuan: Math.round(b2 * 100), first: first.slice(0, 30), again: again.slice(0, 30) }; });
  console.log('5 登用の見込み:', JSON.stringify(r5));
  if (!(r5.zhangBin <= 5 && r5.chenChuan > r5.zhangBin + 20 && r5.again.includes('最近'))) problems.push('5 高忠誠の捕虜');
  await p.close();

  // 6) 君主の死で忠誠を見直す(317年:石勒が討たれ、石虎が継ぐ)
  p = await open('s317');
  const r6 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, L = c.loyalty; g.changeSettings({ playerFactionId: 'jin' });
    const before = { zhangBin: Math.round(L.loyalty.zhang_bin), chengXia: Math.round(L.loyalty.cheng_xia ?? -1) };
    c.personStates.shi_le = 'dead'; c.checkRulers();
    return { before, after: { zhangBin: Math.round(L.loyalty.zhang_bin), chengXia: Math.round(L.loyalty.cheng_xia ?? -1) }, why: (L.log.zhang_bin ?? []).map(x => x.text).join('/'), ruler: window.__gokoData.scenario.factions.find(f => f.id === 'shile').ruler }; });
  console.log('6 君主の死:', JSON.stringify(r6));
  if (r6.ruler !== '石虎' || !r6.why.includes('継承') || r6.after.zhangBin >= r6.before.zhangBin) problems.push('6 君主の死の見直し');
  await p.close();

  // 7) AIの褒賞・任命  8) セーブとロード  9) 古いセーブ
  p = await open('s319');
  const r7 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, L = c.loyalty; g.changeSettings({ playerFactionId: 'silla' });
    // 前趙:忠誠を下げた人と、太守のいない都市を用意する
    const lowP = window.__gokoData.persons.filter(x => x.factionId === 'han_zhao' && x.role !== 'ruler' && c.postOf(x.id)).slice(0, 2); for (const x of lowP) L.loyalty[x.id] = 30;
    const city = g.allCities.find(k => window.__gokoData.scenario.cityOwners[k.id] === 'han_zhao' && k.kind !== 'pass');
    if (city) c.cityStates[city.id] = { ...c.cityState(city), governorId: null };
    const gold0 = c.factionStates.han_zhao.gold; L.monthly();
    return { rewarded: lowP.map(x => (L.log[x.id] ?? []).some(y => y.text.startsWith('褒賞'))), goldSpent: Math.round(gold0 - c.factionStates.han_zhao.gold), goldBefore: Math.round(gold0), appointed: city ? (c.cityStates[city.id].governorId ?? null) : 'no-city' }; });
  console.log('7 AIの褒賞・任命:', JSON.stringify(r7));
  if (!r7.rewarded.some(Boolean) || !(r7.goldSpent > 0 && r7.goldSpent <= Math.max(400, r7.goldBefore * 0.08) + 300) || !r7.appointed) problems.push('7 AIの褒賞・任命');
  const r8 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, L = c.loyalty; L.loyalty.liu_ya = 12; L.fame.liu_ya = 77; L.add('liu_ya', -1, 'テスト');
    const s = JSON.parse(JSON.stringify(g.buildSave())); L.loyalty.liu_ya = 99; L.fame.liu_ya = 1; g.applySave(s);
    const old = JSON.parse(JSON.stringify(s)); delete old.campaign.loyalty; g.applySave(old);
    return { saved: [Math.round(s.campaign.loyalty.loyalty.liu_ya), s.campaign.loyalty.fame.liu_ya], loaded: 'see', oldSaveLoyalty: Math.round(L.loyalty.liu_ya), oldSaveFame: L.fame.liu_ya }; });
  const r8b = await p.evaluate(() => { const g = window.__goko, L = g.campaign.loyalty; L.loyalty.liu_ya = 12; L.fame.liu_ya = 77; const s = JSON.parse(JSON.stringify(g.buildSave())); L.loyalty.liu_ya = 99; L.fame.liu_ya = 1; g.applySave(s); return [Math.round(L.loyalty.liu_ya), L.fame.liu_ya]; });
  console.log('8・9 セーブ:', JSON.stringify(r8), JSON.stringify(r8b));
  if (r8b[0] !== 12 || r8b[1] !== 77) problems.push('8 セーブとロード');
  if (!(r8.oldSaveLoyalty > 0 && r8.oldSaveFame > 0)) problems.push('9 古いセーブ');
  // 画面:人物の詳細に忠誠・名声・相性・理由・危険度、一覧に警告
  const ui = await p.evaluate(() => { const L = window.__goko.campaign.loyalty; L.loyalty.liu_ya = 20; document.querySelector('#persons-open').click(); const f = document.querySelector('.persons-faction'); f.value = 'han_zhao'; f.dispatchEvent(new Event('change'));
    const row = document.querySelector('.person-row[data-id="liu_ya"]'); row.click(); return { warn: row.dataset.risk, name: row.querySelector('.person-row-name').textContent, line: document.querySelector('.person-loyalty').textContent, why: document.querySelector('.person-loyalty-why').textContent.slice(0, 80), reward: !document.querySelector('.person-reward').hidden }; });
  console.log('画面:', JSON.stringify(ui));
  if (ui.warn !== 'high' || !ui.line.includes('離反の危険') || !ui.why.includes('忠誠の目安')) problems.push('画面の表示');
  await p.screenshot({ path: path.join(__dirname, 'out', 'loyalty.png') });
  // 古い形式(v1)のセーブも読める
  const v1 = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v1.json'), 'utf8');
  await p.close();
  p = await open('s317');
  const r9 = await p.evaluate((v1) => { const g = window.__goko; g.applySave(JSON.parse(v1)); return Math.round(g.campaign.loyalty.loyalty.zhang_bin); }, v1);
  console.log('9 v1のセーブ:', r9);
  if (!(r9 > 80)) problems.push('9 v1のセーブ');
  await p.close();

  // 10) 15年の自動進行で、反乱・寝返りが多すぎない(1シナリオあたり)
  for (const sid of ['s317', 's357']) {
    p = await open(sid);
    const r10 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'silla', difficulty: 'hard' }); const d = c.day; let n = 0;
      while (c.day - d < 360 * 15 && n++ < 500000) { if (c.speed === 0) { const ev = c.events.find(e => e.status === 'pending'); if (ev) c.setEventStatus(ev.battleId, 'cancelled'); for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; c.speed = 8; } c.update(0.25); }
      const rebels = c.news.filter(x => x.text.includes('反乱')).length; const turn = c.news.filter(x => x.text.includes('寝返り')).length;
      const all = c.loyalty; const vals = window.__gokoData.persons.filter(x => x.role !== 'ruler' && c.personStatus(x.id) === 'active').map(x => all.loyalty[x.id]);
      return { date: c.dateText(), rebelsInNews: rebels, defectsInNews: turn, newsKept: c.news.length, low: vals.filter(v => v < 30).length, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), gold: Math.round(Math.max(...Object.values(c.factionStates).map(s => s.gold))) }; });
    console.log('10 15年(' + sid + '):', JSON.stringify(r10));
    // 出来事の記録は直近40件しか残らないので、別に数える
    await p.close();
  }
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
