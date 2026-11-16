// 宮廷政治(Version 36):史実の後継者・苻氏と石氏の系譜・架空の人物の順位・死因・史実と違う展開での生存・
// 摂政と親政・外戚・教育・AIの宮廷運営・保存と互換・既存の仕組み・プレイヤーの国の反乱の難易度・PCの皇室画面
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  const open = async (sc) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info)); if (!ok) problems.push(label); };
  const run = `(years) => { const c = window.__goko.campaign; c.speed = 8; const d0 = c.day; let n = 0; while (c.day - d0 < 360 * years && n++ < 400000) { if (c.speed === 0) { const ev = c.events.find(e => e.status === 'pending'); if (ev) c.setEventStatus(ev.battleId, 'cancelled'); for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; c.speed = 8; } c.update(0.25); } c.speed = 0; }`;

  // 1. 東晋の史実の後継者(383年:司馬徳宗が1歳でいる。司馬徳文は386年に生まれる)
  let p = await open('s383');
  const r1 = await p.evaluate(`(() => { const g = window.__goko, c = g.campaign, ct = c.court, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla' });
    const dz = D.persons.find(x => x.id === 'sima_dezong'); const before = !!D.persons.find(x => x.id === 'sima_dewen');
    for (let i = 0; i < 44; i++) { c.day += 30; ct.monthly(); }
    const dw = D.persons.find(x => x.id === 'sima_dewen');
    return { dezong: dz && dz.factionId, dzAge0: dz && dz.born, heir: ct.heirs.jin, before, dewen: dw && dw.factionId, dwFather: dw && ct.fatherOf(dw.id), dwFictional: dw && !!dw.fictional, date: c.dateText(), kings: ['goguryeo', 'baekje', 'silla'].map(f => D.persons.filter(x => x.factionId === f && (x.id === 'gogugyang' || x.id === 'chimnyu' || x.id === 'silseong' || x.id === 'jinsa' || x.role === 'ruler')).map(x => x.name).join('・')) }; })()`);
  check('1 東晋の史実の後継者が年代どおりに登場', r1.dezong === 'jin' && r1.dzAge0 === 382 && r1.heir === 'sima_dezong' && !r1.before && r1.dewen === 'jin' && r1.dwFather === 'sima_yao' && !r1.dwFictional, r1);
  await p.close();

  // 2. 前秦の苻氏(台帳の系譜:苻洪→苻雄→苻堅→苻宏、苻洪→苻健→苻生、苻登→苻崇)
  p = await open('s357');
  const r2 = await p.evaluate(() => { const ct = window.__goko.campaign.court;
    return { jian: ct.fatherOf('fu_jian'), xiong: ct.fatherOf('fu_xiong'), sheng: ct.fatherOf('fu_sheng'), jianjian: ct.fatherOf('fu_jian_jian'), hong: ct.fatherOf('fu_hong2'), chong: ct.fatherOf('fu_chong'), mother: ct.motherOf('fu_jian'), d: ct.bloodDistance('fu_jian', 'fu_sheng'), sib: ct.siblingsOf('fu_jian').map(x => x.id) }; });
  check('2 前秦の苻氏の親子関係', r2.jian === 'fu_xiong' && r2.xiong === 'pu_hong' && r2.sheng === 'fu_jian_jian' && r2.jianjian === 'pu_hong' && r2.hong === 'fu_jian' && r2.chong === 'fu_deng' && r2.mother === 'gou_taihou' && r2.d === 4, r2);
  await p.close();

  // 3. 後趙の石氏:石勒→(世子)石弘→(334年以後)石虎の簒奪→石虎の子が後継の候補
  p = await open('s329');
  const r3 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, ct = c.court; g.changeSettings({ playerFactionId: 'silla' });
    const heir0 = ct.heirOf('shile')?.name; c.dieNaturally('shi_le'); c.checkRulers(); const after = c.rulerOf('shile')?.name;
    c.day = Math.max(c.day, (334 - 329) * 360 + 30); let tries = 0; while (c.rulerOf('shile')?.id === 'shi_hong' && tries++ < 120) { c.day += 30; ct.usurp(334); }
    const order = ct.successionOrder('shile').slice(0, 4).map(o => `${o.p.name}:${o.reason}`);
    return { heir0, after, now: c.rulerOf('shile')?.name, tries, hongCause: ct.causeOf('shi_hong')?.cause, order }; });
  check('3 後趙の石氏の継承', r3.heir0 === '石弘' && r3.after === '石弘' && r3.now === '石虎' && r3.hongCause === 'execution' && r3.order.some(o => /石宣|石遵|石鑑|石祗/.test(o) && o.includes('の子')), r3);

  // 4. 架空の人物は、史実の後継者より不自然に優先されない
  const r4 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court; const f = 'jin'; const r = c.rulerOf(f); delete ct.heirs[f];
    const fake = ct.newPerson({ name: '司馬強', gender: 'male', born: c.calendar().year - 30, factionId: f, role: 'general', people: '漢', seed: 't4', bio: '', title: '', stats: { leadership: 95, war: 95, intelligence: 95, politics: 95, charisma: 95 }, father: r.id });
    const hist = ct.newPerson({ name: '仮', gender: 'male', born: 0, factionId: f, role: 'general', people: '漢', seed: 't4b', bio: '', title: '', stats: { leadership: 1, war: 1, intelligence: 1, politics: 1, charisma: 1 }, father: r.id }); hist.fictional = false; hist.born = c.calendar().year - 20;
    const order = ct.successionOrder(f).slice(0, 3).map(o => `${o.p.name}:${o.reason}:${Math.round(o.score)}`);
    return { order, first: ct.successionOrder(f)[0].p.name }; });
  check('4 架空の人物が史実の人物より優先されない', r4.first !== '司馬強', r4);
  await p.close();

  // 5・6. 死因の区別と、史実と違う展開での生存(317年:劉琨は段匹磾のもとにいれば318年に処刑される)
  p = await open('s317');
  const r5 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, ct = c.court, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla' });
    const kun = D.persons.find(x => x.id === 'liu_kun'); const pidi = D.persons.find(x => x.id === 'duan_pidi'); c.spoils.setFaction('liu_kun', pidi.factionId);
    c.day = 360 + 30; let t = 0; while (c.personStatus('liu_kun') !== 'dead' && t++ < 60) { c.day += 30; ct.politicalDeaths(318); }
    const kunCause = ct.causeOf('liu_kun');
    // 会戦での戦死は「戦死」、寿命は「病死・老衰」
    c.recordFate('zu_ti', 'killed'); ct.kill('wang_dao', 'illness');
    const hist = ['liu_cong', 'shi_hong', 'su_jun', 'tuoba_yulv', 'li_qi', 'liu_kun'].map(id => `${id}:${window.__gokoData.persons.find(x => x.id === id) ? '' : '-'}`);
    return { kunCause, zuti: ct.causeOf('zu_ti')?.cause, wang: ct.causeOf('wang_dao')?.cause, tries: t, liuCong: 'illness' }; });
  check('5 死因の区別(処刑・戦死・病死)', r5.kunCause?.cause === 'execution' && /段匹磾/.test(r5.kunCause.text) && r5.zuti === 'battle' && r5.wang === 'illness', r5);
  await p.close();
  p = await open('s317');
  const r6 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, ct = c.court; g.changeSettings({ playerFactionId: 'silla' });
    // 劉琨を段匹磾から離しておけば(晋に置く)、318年を過ぎても処刑されない
    c.spoils.setFaction('liu_kun', 'jin'); c.day = 360; for (let i = 0; i < 48; i++) { c.day += 30; ct.politicalDeaths(c.calendar().year); ct.deaths(c.calendar().year, c.calendar().month); }
    return { alive: c.personStatus('liu_kun'), date: c.dateText(), died: window.__gokoData.persons.find(x => x.id === 'liu_kun').died }; });
  check('6 史実と違う展開では生き延びる', r6.alive !== 'dead' && r6.died === 318, r6);
  await p.close();

  // 7・8・9. 幼君と摂政(329年:成帝 司馬衍は8歳)・政治効果・親政
  p = await open('s329');
  const r7 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, ct = c.court; g.changeSettings({ playerFactionId: 'silla' });
    const before = ct.regentOf('jin')?.name ?? null; c.day += 30; ct.monthly(); const reg = ct.regentOf('jin'); const cands = ct.regentCandidates('jin').slice(0, 4).map(x => `${x.p.name}:${x.reason}`);
    const inc1 = c.economy.report('jin').income.total; const f1 = ct.adminFactor('jin');
    const weak = ct.regentCandidates('jin').sort((a, b) => a.p.politics - b.p.politics)[0]; ct.appointRegent('jin', weak.p.id); const f2 = ct.adminFactor('jin'); const inc2 = c.economy.report('jin').income.total;
    delete ct.regents.jin; const f3 = ct.adminFactor('jin');
    ct.appointRegent('jin', reg.id);
    const ruler = c.rulerOf('jin'); const tooEarly = ct.personalRule('jin'); ruler.born = c.calendar().year - 16; const pr = ct.personalRule('jin');
    return { before, reg: reg && reg.name, cands, f1, f2, f3, inc: [inc1, inc2], tooEarly, pr, after: ct.regentOf('jin')?.name ?? null, counts: [ct.counts.regents, ct.counts.personalRule] }; });
  check('7 幼君の即位で摂政が任命される', !r7.before && !!r7.reg, r7);
  check('8 摂政による政治効果', r7.f1 > r7.f2 && r7.f2 > r7.f3 && r7.inc[0] > r7.inc[1], r7);
  check('9 成人すると親政に移る', /未成年/.test(r7.tooEarly) && /親政/.test(r7.pr) && !r7.after, r7);

  // 10. 外戚の影響力が変わる
  const r10 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court, D = window.__gokoData; const f = 'jin'; const r = c.rulerOf(f); c.factionStates.jin.gold = 50000;
    const sp = D.persons.find(x => x.factionId === f && x.name.startsWith('王') && x.gender !== 'female' && x.role !== 'ruler');
    const res = ct.takeNobleConsort(f, sp.id, 'primary'); const a = ct.inLaws(f).find(x => x.clan === '王');
    const member = a.members.find(m => m.gender !== 'female' && !c.postOf(m.id)); const city = window.__goko.allCities.find(k => D.scenario.cityOwners[k.id] === f && k.kind !== 'pass' && c.postOf(member.id) === null);
    const ap = c.appoint(member.id, { kind: 'city', id: window.__goko.allCities.filter(k => D.scenario.cityOwners[k.id] === f && k.kind !== 'pass')[3].id });
    const b2 = ct.inLaws(f).find(x => x.clan === '王');
    return { res, before: a.influence, after: b2.influence, why: b2.why, ap }; });
  check('10 外戚の影響力が変化する', r10.after > r10.before, r10);

  // 11. 教育が成長に効く(上限あり)
  const r11 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court, D = window.__gokoData; const f = 'jin'; const r = c.rulerOf(f);
    const mk = (n) => ct.newPerson({ name: n, gender: 'male', born: c.calendar().year - 8, factionId: f, role: 'general', people: '漢', seed: n, bio: '', title: '', stats: { leadership: 60, war: 60, intelligence: 60, politics: 60, charisma: 60 }, father: r.id });
    const a = mk('司馬甲'), b2 = mk('司馬乙');
    const tutor = D.persons.filter(x => x.factionId === f && x.role !== 'ruler' && c.personStatus(x.id) === 'active' && !ct.isMinor(x)).sort((x, y) => y.war - x.war)[0];
    ct.setEducation(a.id, 'war', tutor.id); ct.setEducation(b2.id, 'war');
    for (let i = 0; i < 240; i++) ct.educate();
    a.born -= 12; b2.born -= 12; ct.applyGrowth();
    return { tutor: tutor.name + ':' + tutor.war, a: ct.edu[a.id].gain.war, b: ct.edu[b2.id].gain.war, aWar: a.war, bWar: b2.war, aInt: a.intelligence, cap: Math.max(...Object.values(ct.edu[a.id].gain)) }; });
  check('11 教育が能力の成長に効く(上限15)', r11.a > r11.b && r11.a <= 15 && r11.aWar > r11.bWar && r11.aWar <= 100 && r11.aInt === 60, r11);

  // 12. AIが皇太子・摂政・教育を管理する
  const r12 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court, D = window.__gokoData;
    for (let i = 0; i < 3; i++) { c.day += 360; ct.aiYearly(); ct.monthly(); }
    const ai = D.scenario.factions.filter(f => !f.passive && !f.fallen && f.id !== 'silla' && c.rulerOf(f.id));
    const kids = ai.flatMap(f => ct.childrenOf(c.rulerOf(f.id).id).filter(k => k.factionId === f.id && ct.age(k) !== null && ct.age(k) >= 6 && ct.age(k) < 20));
    const minorRulers = ai.filter(f => ct.isMinor(c.rulerOf(f.id)));
    return { heirs: ai.filter(f => ct.heirOf(f.id)).length, factions: ai.length, kids: kids.length, tutored: kids.filter(k => ct.edu[k.id]?.tutor).length, minor: minorRulers.length, regents: minorRulers.filter(f => ct.regentOf(f.id)).length, heirChanges: ct.counts.heirChanges }; });
  check('12 AIの皇太子・摂政・教育', r12.heirs > 0 && r12.tutored >= Math.min(1, r12.kids) && r12.regents === r12.minor && r12.heirChanges <= 2, r12);

  // 13・14. セーブ・ロードと古いセーブ
  const r13 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, ct = c.court; const s = JSON.parse(JSON.stringify(g.buildSave())); const a = JSON.stringify([ct.regents, ct.causes, ct.edu]);
    ct.regents = {}; ct.causes = {}; ct.edu = {}; g.applySave(s); const b2 = JSON.stringify([c.court.regents, c.court.causes, c.court.edu]);
    const old = JSON.parse(JSON.stringify(s)); delete old.campaign.court.regents; delete old.campaign.court.causes; delete old.campaign.court.edu; let err = null; try { g.applySave(old); } catch (e) { err = String(e); }
    const older = JSON.parse(JSON.stringify(s)); delete older.campaign.court; let err2 = null; try { g.applySave(older); } catch (e) { err2 = String(e); }
    return { same: a === b2, len: a.length, err, err2, regentsAfterOld: Object.keys(c.court.regents).length }; });
  check('13 セーブ・ロードで摂政・死因・教育が戻る', r13.same && r13.len > 20, r13);
  check('14 古いセーブとの互換', !r13.err && !r13.err2, r13);
  await p.close();

  // 15. 外交・会戦・滅亡・独立が動く / 16. プレイヤーの国だけ、難易度で反乱が起こりやすい
  p = await open('s317');
  const r15 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'jin', difficulty: 'normal' }); c.speed = 0;
    c.factionStates.duan.gold = 20000; c.factionStates.duan.grain = 20000; c.diplo.amity['duan|jin'] = 80; for (const f of ['han_zhao', 'shile']) c.setRelation('duan', f, 'neutral');
    const aid = c.diplo.dispatchAid('duan', 'jin').ok;
    const mine = c.armies.find(s => s.army.factionId === 'jin'); const foe = c.armies.find(s => s.army.factionId === 'shile'); foe.army.lon = mine.army.lon + 0.2; foe.army.lat = mine.army.lat; c.startEvent(mine, 'field_battle', foe, null);
    const ev = c.events[c.events.length - 1]; const res = window.__gokoAuto(window.__gokoSetup(ev)); c.applyBattleResult(res);
    const r = c.rulerOf('cui_bi'); c.fallFaction('cui_bi', r, 'jin');
    const n0 = D.scenario.factions.length; const sec = c.secede('zu_ti') || c.secede('tao_kan') || c.secede('zhou_fang');
    // 反乱:同じ人物・同じ忠誠でも、プレイヤーの国なら難易度に応じて見込みが上がる
    const L = c.loyalty; const pj = D.persons.find(x => x.id === 'zu_yue'); L.loyalty.zu_yue = 20; const mineP = L.unrestChance(pj);
    g.changeSettings({ playerFactionId: 'silla' }); const aiP = L.unrestChance(pj); g.changeSettings({ playerFactionId: 'jin', difficulty: 'veryHard' }); const hardP = L.unrestChance(pj); g.changeSettings({ difficulty: 'easy' }); const easyP = L.unrestChance(pj);
    return { aid, battle: ev.status, fallen: !!D.scenario.factions.find(x => x.id === 'cui_bi').fallen, sec, newF: D.scenario.factions.length - n0, mineP, aiP, hardP, easyP }; });
  check('15 外交・会戦・滅亡・独立が動く', r15.aid && r15.battle === 'completed' && r15.fallen && (r15.sec ? r15.newF === 1 : true), r15);
  check('16 反乱はプレイヤーの国でだけ難易度で増える', r15.aiP > 0 && Math.abs(r15.mineP / r15.aiP - 1.5) < 0.01 && Math.abs(r15.hardP / r15.aiP - 3.5) < 0.01 && Math.abs(r15.easyP - r15.aiP) < 1e-9, r15);
  await p.close();

  // PCの皇室画面(1920×1200):摂政・皇太后・外戚・勢力・教育・史実と架空の印
  p = await open('s329');
  await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'jin' }); c.speed = 0; c.day += 30; c.court.monthly(); c.factionStates.jin.gold = 9000; document.querySelector('#court-open').click(); });
  await p.waitForTimeout(400);
  const ui = await p.evaluate(() => { const q = (s) => document.querySelector(s);
    const labels = [...document.querySelectorAll('#court .court-stats dt')].map(x => x.textContent); const heads = [...document.querySelectorAll('#court h4')].map(x => x.textContent);
    const badges = [...document.querySelectorAll('#court .court-badge')].map(x => x.textContent);
    const regentSel = !!q('.court-regent'); const kid = window.__gokoData.persons.find(x => x.factionId === 'jin' && window.__goko.campaign.court.age(x) !== null && window.__goko.campaign.court.age(x) < 20);
    const card = [...document.querySelectorAll('#court .court-card')].find(x => x.dataset.id === kid?.id) || null;
    if (card) card.click();
    const edu = !!q('.court-edu'); if (q('.court-edu-policy')) { q('.court-edu-policy').value = 'study'; q('.court-edu-set').click(); }
    const msg = q('.court-message').textContent; const inner = q('#court > div').getBoundingClientRect();
    const tiny = [...document.querySelectorAll('#court *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10.5).length;
    return { labels, heads, badges: [...new Set(badges)], regentSel, kid: kid?.name, card: !!card, edu, msg, out: inner.right > innerWidth + 1 || inner.bottom > innerHeight + 1, tiny, scrollX: document.documentElement.scrollWidth > innerWidth + 1 }; });
  check('PC 皇室画面(摂政・外戚・勢力・教育・印)', ['摂政', '皇太后など', '継承争いの危険'].every(l => ui.labels.includes(l)) && ['外戚の影響力', '宮廷の勢力'].every(h => ui.heads.includes(h)) && ui.regentSel && ui.badges.includes('史') && (!ui.card || (ui.edu && /教育/.test(ui.msg))) && !ui.out && ui.tiny === 0 && !ui.scrollX, ui);
  await p.screenshot({ path: out + '/pc-court-v36.png' });
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
