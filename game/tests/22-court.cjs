// 皇室(Version 35):家系・正室と側室・近親婚・子女の誕生と成長・未成年・皇太子・継承・継承争いと内乱・即位・
// 婚姻と外交・宮廷費・AIの皇室・保存と互換・既存の外交と滅亡・PCの皇室画面
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, 'out');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 })).newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2] + '#s=s317');
  await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info)); if (!ok) problems.push(label); };
  await p.evaluate(() => { const g = window.__goko; g.changeSettings({ playerFactionId: 'jin', difficulty: 'normal' }); g.campaign.speed = 0; g.campaign.factionStates.jin.gold = 50000; });

  // 1. 史実の親子・婚姻
  const r1 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court, D = window.__gokoData;
    const m = c.diplo.marriages.find(x => x.husband === 'liu_yao' && x.wife === 'yang_xianrong');
    const hong = D.persons.find(x => x.id === 'shi_hong');
    return { shao: ct.fatherOf('sima_shao'), yaoKids: ct.childrenOf('liu_yao').map(x => x.id), marriage: m && m.historic, hong: hong && hong.factionId, hongAge: hong && ct.age(hong), heirJin: ct.heirOf('jin')?.id, heirShile: ct.heirOf('shile')?.id, sibs: ct.siblingsOf('yu_liang').map(x => x.id), xiFather: ct.fatherOf('xi_xuan') }; });
  check('1 史実の親子・婚姻・後継者', r1.shao === 'sima_rui' && r1.yaoKids.includes('liu_yin') && r1.marriage && r1.hong === 'shile' && r1.hongAge === 3 && r1.heirJin === 'sima_shao' && r1.heirShile === 'shi_hong' && r1.sibs.includes('yu_wenjun'), r1);

  // 2・3. 正室は1人まで・側室は複数
  const r2 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court; const r = c.rulerOf('jin');
    const had = ct.primaryOf(r.id)?.name ?? null; const sponsors = ['wang_dao', 'yu_liang', 'xi_jian', 'wen_jiao'];
    const a = had ? '既存' : ct.takeNobleConsort('jin', sponsors[0], 'primary');
    const second = ct.takeNobleConsort('jin', sponsors[1], 'primary');
    const max = ct.maxConcubines('jin'); const before = ct.concubinesOf(r.id).length;
    const c1 = ct.takeNobleConsort('jin', sponsors[1], 'secondary'); const c2 = ct.takeNobleConsort('jin', sponsors[2], 'secondary');
    return { had, a, second, primaries: c.diplo.marriages.filter(m => m.husband === r.id && m.kind === 'primary' && c.personStatus(m.wife) !== 'dead').length, max, before, after: ct.concubinesOf(r.id).length, c1, c2 }; });
  check('2 正室を2人にできない', /正室は1人まで/.test(r2.second) && r2.primaries === 1, r2);
  check('3 側室を複数迎えられる', r2.max >= 2 && r2.after >= r2.before + 2, r2);

  // 4. 近親婚の制限(母方のおじと姪:姓が違っても近親)
  const r4 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court;
    const girl = ct.newPerson({ name: '司馬試', gender: 'female', born: c.calendar().year - 18, factionId: 'jin', role: 'minister', people: '漢', seed: 't4', bio: 'テスト', title: '', stats: { leadership: 30, war: 20, intelligence: 50, politics: 50, charisma: 50 }, father: 'sima_shao', mother: 'yu_wenjun' });
    const d = ct.bloodDistance('yu_liang', girl.id); const res = ct.marry('yu_liang', girl.id, 'primary');
    const sameClan = c.diplo.canMarry(window.__gokoData.persons.find(x => x.id === 'sima_rui'), girl);
    return { d, res, sameClan, half: ct.isCloseKin(window.__gokoData.persons.find(x => x.id === 'sima_shao'), girl) }; });
  check('4 近親婚の制限', r4.d === 3 && /近親/.test(r4.res) && !!r4.sameClan && r4.half, r4);

  // 6. 未成年は軍団を指揮できない
  const r6 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court, D = window.__gokoData;
    const minor = D.persons.find(x => x.factionId === 'jin' && ct.isMinor(x) && x.gender !== 'female' && c.personStatus(x.id) === 'active') || ct.newPerson({ name: '司馬稚', gender: 'male', born: c.calendar().year - 8, factionId: 'jin', role: 'general', people: '漢', seed: 't6', bio: '', title: '', stats: { leadership: 50, war: 50, intelligence: 50, politics: 50, charisma: 50 }, father: 'sima_rui' });
    const army = c.armies.find(s => s.army.factionId === 'jin' && s.status !== 'fighting');
    const res = army ? c.appoint(minor.id, { kind: 'army', id: army.army.id }) : 'no army';
    const city = window.__goko.allCities.find(k => window.__gokoData.scenario.cityOwners[k.id] === 'jin' && c.cityState(k).garrison > 8000);
    const raised = city ? c.raiseArmy(city.id, 3000, minor.id) : null;
    return { age: ct.age(minor), res, raisedCmd: raised && typeof raised !== 'string' ? raised.army.commanderId : String(raised) }; });
  check('6 未成年は指揮できない', /未成年/.test(r6.res) && r6.raisedCmd === '', r6);

  // 7. 皇太子の指名・変更(廃立)
  const r7 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court; const f = 'jin';
    ct.newPerson({ name: '司馬試二', gender: 'male', born: c.calendar().year - 20, factionId: f, role: 'general', people: '漢', seed: 't7', bio: '', title: '', stats: { leadership: 50, war: 50, intelligence: 50, politics: 50, charisma: 50 }, father: c.rulerOf(f).id });
    const order0 = ct.successionOrder(f).filter(o => !o.reason.startsWith('有力')); if (!ct.heirOf(f) && order0[0]) ct.designateHeir(f, order0[0].p.id);
    const order = ct.successionOrder(f); const cur = ct.heirOf(f); const other = order.find(o => o.p.id !== cur?.id && !o.reason.startsWith('有力'));
    const s0 = ct.stability[f]; const h0 = ct.counts.heirChanges; const l0 = cur ? c.loyalty.loyalty[cur.id] : null;
    const res = other ? ct.designateHeir(f, other.p.id) : 'no candidate';
    return { cur: cur?.name, next: other?.p.name, res, heir: ct.heirOf(f)?.name, stab: [s0, ct.stability[f]], changes: ct.counts.heirChanges - h0, loyal: [l0, cur ? c.loyalty.loyalty[cur.id] : null] }; });
  check('7 皇太子の指名・変更', !!r7.cur && r7.heir === r7.next && r7.changes === 1 && r7.stab[1] < r7.stab[0] && r7.loyal[1] < r7.loyal[0], r7);

  // 8. 君主の死で後継者が即位する
  const r8 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court; const f = 'chenghan';
    const r = c.rulerOf(f); const heir = ct.heirOf(f) || ct.successionOrder(f)[0]?.p; if (heir && !ct.heirOf(f)) ct.designateHeir(f, heir.id);
    const s0 = ct.counts.successions; c.dieNaturally(r.id); c.checkRulers();
    return { old: r.name, heir: heir && heir.name, now: c.rulerOf(f)?.name, successions: ct.counts.successions - s0, fallen: !!window.__gokoData.scenario.factions.find(x => x.id === f).fallen }; });
  check('8 君主の死で後継者が即位', r8.now === r8.heir && r8.successions === 1 && !r8.fallen, r8);

  // 9. 継承争いが内乱になる(皇位を主張して自立)
  const r9 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, ct = c.court, D = window.__gokoData; const f = 'han_zhao';
    const r = c.rulerOf(f); const kin = D.persons.find(x => x.factionId === f && x.id !== r.id && x.gender !== 'female' && c.personStatus(x.id) === 'active' && !ct.isMinor(x) && (ct.bloodDistance(x.id, r.id) ?? 99) <= 4);
    const minorHeir = ct.newPerson({ name: '劉幼', gender: 'male', born: c.calendar().year - 6, factionId: f, role: 'general', people: '匈奴', seed: 't9', bio: '', title: '', stats: { leadership: 50, war: 50, intelligence: 50, politics: 50, charisma: 50 }, father: r.id });
    delete ct.heirs[f]; ct.stability[f] = 20;
    const risk = ct.disputeRisk(f, minorHeir);
    // 内乱の仕組み:皇位を主張する王族に拠点(太守の都市)を与えて、自立させる
    const city = g.allCities.filter(k => D.scenario.cityOwners[k.id] === f && k.kind !== 'pass' && c.cityState(k).garrison >= 5000 && r.residence !== k.id).sort((a, b) => c.cityState(b).garrison - c.cityState(a).garrison)[0];
    const ap = city && kin ? c.appoint(kin.id, { kind: 'city', id: city.id }) : 'none';
    const n0 = D.scenario.factions.length; const w0 = ct.counts.civilWars;
    ct.pendingClaim = { f, claimant: kin.id }; ct.resolveClaim();
    const nf = D.scenario.factions[D.scenario.factions.length - 1];
    return { kin: kin && kin.name, risk: risk.value, parts: risk.parts, ap, newFaction: D.scenario.factions.length - n0, nf: nf.name, nfRuler: c.rulerOf(nf.id)?.name, rel: c.relationOf(nf.id, f), civilWars: ct.counts.civilWars - w0 }; });
  check('9 継承争いによる内乱', r9.risk >= 0.4 && r9.newFaction === 1 && r9.nfRuler === r9.kin && r9.rel === 'war' && r9.civilWars === 1, r9);

  // 10. 王・公から皇帝・王へ即位
  const r10 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court;
    const out = {};
    for (const f of ['shile', 'jin']) { const r = c.rulerOf(f); c.loyalty.fame[r.id] = 99; ct.stability[f] = 90; out[f + 'Before'] = ct.rankLabel(f); out[f + 'Check'] = ct.crownCheck(f); out[f] = ct.crown(f); out[f + 'After'] = ct.rankLabel(f); }
    out.amity = c.diplo.amityOf('jin', 'han_zhao'); out.korea = ct.crownCheck('goguryeo').missing.join(); return out; });
  check('10 皇帝・王への即位', r10.shileBefore === '公' && r10.shileAfter === '王' && r10.jinBefore === '王' && r10.jinAfter === '皇帝' && /三国/.test(r10.korea), r10);

  // 11. 婚姻が外交に反映される
  const r11 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court, D = window.__gokoData; const r = c.rulerOf('jin');
    const w = D.persons.find(x => x.gender === 'female' && x.factionId !== 'jin' && !D.scenario.factions.find(f => f.id === x.factionId)?.fallen && c.diplo.canMarry(r, x) === null && !ct.isCloseKin(r, x));
    if (!w) return { none: true };
    const from = w.factionId; const a0 = c.diplo.amityOf('jin', from); const res = ct.marry(r.id, w.id, 'secondary');
    return { w: w.name, from, res, amity: [a0, c.diplo.amityOf('jin', from)], links: c.diplo.marriageLinks('jin', from).length }; });
  check('11 婚姻が外交に反映', !r11.none && r11.amity[1] > r11.amity[0] && r11.links >= 1, r11);

  // 12. 宮廷費が財政に反映される
  const r12 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court; const f = 'jin';
    const e0 = c.economy.report(f).expense.court; const k0 = ct.courtCost(f); ct.maxConcubines = () => 6; const res = ct.takeNobleConsort(f, 'wen_jiao', 'secondary');
    return { res, before: e0, after: c.economy.report(f).expense.court, cost: [k0, ct.courtCost(f)] }; });
  check('12 宮廷費が財政に反映', r12.after > r12.before && r12.cost[1] > r12.cost[0], r12);

  // 13. AIの君主が婚姻・後継者の指名をする
  const r13 = await p.evaluate(() => { const c = window.__goko.campaign, ct = c.court, D = window.__gokoData;
    const ai = D.scenario.factions.filter(f => !f.passive && !f.fallen && f.id !== 'jin' && c.rulerOf(f.id));
    for (const f of ai) { delete ct.heirs[f.id]; c.factionStates[f.id].gold = Math.max(c.factionStates[f.id].gold, 5000); }
    const p0 = ct.counts.primaries + ct.counts.concubines; for (let i = 0; i < 4; i++) { c.day += 360; ct.aiYearly(); }
    const heirs = ai.filter(f => ct.heirOf(f.id)).length; const cand = ai.filter(f => ct.successionOrder(f.id).some(o => !o.reason.startsWith('有力'))).length;
    return { factions: ai.length, heirs, cand, marriages: ct.counts.primaries + ct.counts.concubines - p0, heirChanges: ct.counts.heirChanges }; });
  check('13 AIの婚姻・後継者指名', r13.heirs >= r13.cand && r13.heirs > 0 && r13.marriages > 0 && r13.heirChanges < 5, r13);

  // 14. セーブ・ロードで家系・婚姻・子女・後継者が戻る
  const r14 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, ct = c.court, D = window.__gokoData; const s = JSON.parse(JSON.stringify(g.buildSave()));
    const snap = () => JSON.stringify([ct.serialize(), c.diplo.marriages, D.persons.filter(x => x.id.startsWith('born_')).map(x => x.id + x.factionId + x.name).sort(), D.persons.length]);
    const a = snap(); const n = D.persons.length; ct.heirs = {}; ct.takeNobleConsort('jin', 'xi_jian', 'secondary'); D.persons.push({ ...D.persons[0], id: 'born_999' }); ct.added.push(D.persons[D.persons.length - 1]);
    g.applySave(s); const b2 = snap(); const A = JSON.parse(a), B = JSON.parse(b2); const diff = A.map((x, i) => JSON.stringify(x) === JSON.stringify(B[i]) ? null : i).filter(x => x !== null); const ca = A[0], cb = B[0]; const keys = Object.keys(ca).filter(k => JSON.stringify(ca[k]) !== JSON.stringify(cb[k])); return { same: a === b2, diff, keys, sample: keys.slice(0,1).map(k => [JSON.stringify(ca[k]).slice(0, 300), JSON.stringify(cb[k]).slice(0, 300)]), n, after: D.persons.length, dup: D.persons.length - new Set(D.persons.map(x => x.id)).size }; });
  check('14 セーブ・ロードで皇室が戻る', r14.same && r14.dup === 0 && r14.after === r14.n, r14);

  // 15. 古いセーブとの互換
  const r15 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; const s = JSON.parse(JSON.stringify(g.buildSave())); delete s.campaign.court;
    let err = null; try { g.applySave(s); } catch (e) { err = String(e); }
    return { err, heir: c.court.heirOf('shile')?.id ?? null, born: D.persons.filter(x => x.id.startsWith('born_')).length, dup: D.persons.length - new Set(D.persons.map(x => x.id)).size }; });
  check('15 古いセーブとの互換', !r15.err && r15.born === 0 && r15.dup === 0, r15);

  // 16. 外交・援軍・滅亡が動く
  const r16 = await p.evaluate(() => { const c = window.__goko.campaign, D = window.__gokoData;
    c.factionStates.duan.gold = 20000; c.factionStates.duan.grain = 20000; c.diplo.amity['duan|jin'] = 80; for (const f of ['han_zhao', 'shile']) c.setRelation('duan', f, 'neutral'); c.setRelation('duan', 'jin', 'alliance');
    const aid = c.diplo.dispatchAid('duan', 'jin'); const odds = c.diplo.odds('jin', 'qianliang', 'goodwill', 'wang_dao').p;
    const r = c.rulerOf('cui_bi'); c.fallFaction('cui_bi', r, 'jin');
    return { aid: aid.ok, odds, fallen: !!D.scenario.factions.find(x => x.id === 'cui_bi').fallen }; });
  check('16 外交・援軍・滅亡が動く', r16.aid && r16.odds > 0 && r16.fallen, r16);

  // 5. 子女が生まれ、年齢に応じて成長する
  const r5 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, ct = c.court, D = window.__gokoData;
    const kid = ct.newPerson({ name: '司馬幼', gender: 'male', born: c.calendar().year - 4, factionId: 'jin', role: 'general', people: '漢', seed: 't5', bio: 'テスト', title: '', stats: { leadership: 80, war: 80, intelligence: 80, politics: 80, charisma: 80 }, father: 'sima_rui' });
    const s0 = kid.leadership; const st0 = ct.stageOf(kid);
    const b0 = ct.counts.births; c.speed = 8; const d0 = c.day; let n = 0;
    while (c.day - d0 < 360 * 12 && n++ < 400000) { if (c.speed === 0) { const ev = c.events.find(e => e.status === 'pending'); if (ev) c.setEventStatus(ev.battleId, 'cancelled'); for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; c.speed = 8; } c.update(0.25); }
    c.speed = 0;
    return { s0, st0, s1: kid.leadership, st1: ct.stageOf(kid), age: ct.age(kid), births: ct.counts.births - b0, historic: ct.counts.historicBirths, date: c.dateText(), sample: D.persons.filter(x => x.id.startsWith('born_') && x.id !== kid.id).slice(0, 3).map(x => `${x.name}:${x.fictional}:${ct.fatherOf(x.id)}`) }; });
  check('5 子女の誕生と成長', r5.births > 0 && r5.s1 > r5.s0 && r5.st0 === '幼少' && r5.st1 !== '幼少', r5);

  // PCの皇室画面(1920×1200)と、人物画面の家系図
  await p.reload(); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.__goko; g.changeSettings({ playerFactionId: 'jin' }); g.campaign.speed = 0; g.campaign.factionStates.jin.gold = 9000; document.querySelector('#court-open').click(); });
  await p.waitForTimeout(400);
  const ui = await p.evaluate(() => { const q = (s) => document.querySelector(s); const heads = [...document.querySelectorAll('#court h4')].map(x => x.textContent);
    const labels = [...document.querySelectorAll('#court .court-stats dt')].map(x => x.textContent);
    const rows = [...document.querySelectorAll('#court .tree-label')].map(x => x.textContent);
    const sel = q('.court-heir'); sel.value = sel.options[0].value; q('.court-designate').click(); const msg = q('.court-message').textContent;
    const card = q('#court .court-card'); card.click(); const panel = !!q('.court-person');
    const inner = q('#court > div').getBoundingClientRect();
    const tiny = [...document.querySelectorAll('#court *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10.5).length;
    const cols = ['.court-left', '.court-tree', '.court-right'].map(s => Math.round(q(s).getBoundingClientRect().width));
    return { heads, labels, rows, msg, panel, out: inner.right > innerWidth + 1 || inner.bottom > innerHeight + 1, tiny, cols, scrollX: document.documentElement.scrollWidth > innerWidth + 1 }; });
  check('PC 皇室画面', ['正室・側室', '後継者', '後継順位', '宮廷の出来事'].every(h => ui.heads.some(x => x.startsWith(h))) && ui.heads.some(x => x.startsWith('家系図')) && ['皇室の安定', '宮廷費'].every(l => ui.labels.includes(l)) && ['父・母', '本人', '配偶者', '兄弟姉妹', '子女'].every(r => ui.rows.includes(r)) && /立てました|すでに/.test(ui.msg) && ui.panel && !ui.out && ui.tiny === 0 && ui.cols.every(w => w > 300) && !ui.scrollX, ui);
  await p.screenshot({ path: out + '/pc-court.png' });
  const fam = await p.evaluate(() => { document.querySelector('.court-close').click(); document.querySelector('#persons-open').click(); document.querySelector('.person-row[data-id="sima_shao"]').click();
    const t = document.querySelector('.person-family').textContent; document.querySelector('.person-family-open').click();
    return { t, courtOpen: !document.querySelector('#court').hidden, focus: [...document.querySelectorAll('#court .tree-row')].find(r => r.querySelector('.tree-label').textContent === '本人')?.textContent }; });
  check('PC 人物画面から家系図', /父母:司馬睿/.test(fam.t) && fam.courtOpen && /司馬紹/.test(fam.focus || ''), fam);
  await p.screenshot({ path: out + '/pc-court-family.png' });
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
