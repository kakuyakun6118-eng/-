// 仮想シナリオ「炎漢再興 ― 天命を継ぐ者」:シナリオの設定・人物と血縁・能力値の上限120・劉皓の8つの固有能力と家臣の特殊能力(1つずつ)・
// 水軍・既存のシナリオへの影響がないこと。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1600)); if (!ok) problems.push(label); };
  const open = async (sc) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); p.on('pageerror', e => errs.push(sc + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const p = await open('s304v');

  // ---------- 1. シナリオ・人物・血縁 ----------
  const r1 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
    // Version 65:皇族(楚王后 謝蓉・劉承・劉威・韓瑤)も楚にいる。「武将23人」は、開始時の武将(劉氏三代と家臣20人)で数える
    const ROYAL = ['vh_xie_rong', 'vh_liu_cheng', 'vh_liu_wei', 'vh_liu_rui', 'vh_liu_ying', 'vh_liu_hong', 'vh_han_yao'];
    const chu = D.persons.filter(x => x.factionId === 'chu' && !ROYAL.includes(x.id)); const P = (id) => D.persons.find(x => x.id === id);
    const st = (id) => { const x = P(id); return [x.leadership, x.war, x.intelligence, x.politics, x.charisma].join('/'); };
    const arm = c.armies.filter(s => s.army.factionId === 'chu');
    const chuCities = c.cities.filter(k => D.scenario.cityOwners[k.id] === 'chu');
    const gar = chuCities.reduce((n, k) => n + c.cityState(k).garrison, 0);
    return { name: D.scenario.name, date: c.dateText(), virtual: !!D.scenario.virtual, cap: D.scenario.statCap, ruler: c.rulerOf('chu')?.name, capital: c.capitalCityOf('chu')?.name, cities: chuCities.map(k => k.name).sort(),
      troops: arm.reduce((n, s) => n + s.army.troops.infantry + s.army.troops.cavalry + s.army.troops.archer, 0), corps: arm.map(s => s.army.name), naval: arm.filter(s => s.army.naval).map(s => s.army.name), gar,
      gold: c.factionStates.chu.gold, grain: c.factionStates.chu.grain, officers: chu.length, hao: st('vh_liu_hao'), haoF: st('vh_liu_hao_f'), xiong: st('vh_liu_xiong'),
      born: ['vh_liu_hao', 'vh_liu_hao_f', 'vh_liu_xiong'].map(id => P(id).born), father: c.court.fatherOf('vh_liu_hao'), gf: c.court.fatherOf('vh_liu_hao_f'), kids: c.court.childrenOf('vh_liu_xiong').map(x => x.id),
      allHome: chu.every(x => x.residence && D.scenario.cityOwners[x.residence] === 'chu'), allBio: chu.every(x => x.bio && x.personality && x.traits.length && (x.favoredUnit !== undefined)),
      ages: Object.fromEntries(chu.filter(x => !['vh_liu_hao', 'vh_liu_hao_f', 'vh_liu_xiong'].includes(x.id)).map(x => [x.name, 304 - x.born])),
      sameName: D.persons.filter(x => ['劉皓', '劉浩', '劉雄'].includes(x.name)).map(x => x.id), virtualFlag: chu.every(x => x.virtual && x.fictional) };
  });
  check('1a 仮想シナリオ「炎漢再興」:304年10月開始、楚(劉皓・首都 襄陽)、襄陽・江陵・宛・新野・武昌、軍団8つで100,000(都市の守備兵とは別)、金200,000・兵糧1,000,000、武将23人',
    r1.virtual && r1.cap === 120 && r1.date.startsWith('304年10月') && r1.ruler === '劉皓' && r1.capital === '襄陽' && r1.cities.join() === ['宛', '新野', '武昌', '江陵', '襄陽'].sort().join() && r1.troops === 100000 && r1.corps.length === 8 && r1.naval.join() === '荊州水軍' && r1.gold === 200000 && r1.grain === 1000000 && r1.officers === 23, r1);
  check('1b 劉氏三代:劉皓120/115/118/115/120(280年生)・劉浩94/72/115/118/105(249年生)・劉雄108/103/108/110/110(218年生)。祖父→父→子が家系に登録され、史実の人物とは別のID',
    r1.hao === '120/115/118/115/120' && r1.haoF === '94/72/115/118/105' && r1.xiong === '108/103/108/110/110' && r1.born.join() === '280,249,218' && r1.father === 'vh_liu_hao_f' && r1.gf === 'vh_liu_xiong' && r1.kids.includes('vh_liu_hao_f') && r1.sameName.every(id => id.startsWith('vh_')), r1);
  check('1c 家臣20人:年齢どおり(霍烈32・沈月華23など)。全員に列伝・性格・得意兵科・特殊能力・初期の所在(楚の都市)があり、架空の人物として扱われる',
    r1.allHome && r1.allBio && r1.virtualFlag && r1.ages['霍烈'] === 32 && r1.ages['沈月華'] === 23 && r1.ages['王明徳'] === 42 && Object.keys(r1.ages).length === 20, r1.ages);

  // ---------- 2. 能力値の上限120:戦闘・内政・登用・外交・表示・加齢・セーブで切り捨てない ----------
  const r2 = await p.evaluate(async () => { const g = window.__goko, c = g.campaign, D = window.__gokoData; const hao = D.persons.find(x => x.id === 'vh_liu_hao');
    const est = window.__gokoEstimate;
    const side = (role, cmd) => ({ role, kind: 'army', factionId: role === 'attacker' ? 'chu' : 'jin', armyId: 'x' + role, cityId: null, name: role, commander: cmd, troops: { infantry: 10000, cavalry: 0, archer: 0 }, morale: 70, fatigue: 10, food: 50, fortification: null });
    const S = (cmd) => ({ battleId: 'cap', battleType: 'field_battle', name: 't', location: { lon: 112, lat: 32, name: 't' }, terrain: 'plain', createdAt: { day: 1, text: '' }, attacker: side('attacker', cmd), defender: side('defender', null) });
    // 戦闘:統率120と統率100(特殊能力なし)で比べる
    const r120 = est(S({ ...hao, traits: [] })).ratio, r100 = est(S({ ...hao, leadership: 100, war: 100, intelligence: 100, traits: [] })).ratio;
    // 内政:開発の伸び(魅力120で治安)は100のときより大きい
    // 加齢:年少の能力のもと(115)が成長の計算で100に切られない
    c.court.base.vh_qin_wu = { leadership: 98, war: 113, intelligence: 76, politics: 60, charisma: 92 }; c.court.applyGrowth(); const qin = D.persons.find(x => x.id === 'vh_qin_wu').war;
    // 1年進めてもそのまま
    g.changeSettings({ playerFactionId: 'silla' }); c.speed = 8; const d0 = c.day; while (c.day - d0 < 360) { const h = c.history; const aw = h.awaiting; if (aw) { const ro = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => ro[k]); h.choose(aw.id, aw.choices[role][0].id); } h.queue = []; for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.update(0.25); }
    const after1y = [hao.leadership, hao.war, hao.intelligence, hao.politics, hao.charisma].join('/');
    // セーブ・ロード
    const sv = JSON.parse(JSON.stringify(g.buildSave())); g.applySave(sv); const hao2 = D.persons.find(x => x.id === 'vh_liu_hao');
    const reload = [hao2.leadership, hao2.war, hao2.intelligence, hao2.politics, hao2.charisma].join('/');
    // 表示:人物画面の数値と棒
    g.changeSettings({ playerFactionId: 'chu' }); g.personScreen.open('vh_liu_hao'); await new Promise(r => setTimeout(r, 300));
    const shown = [...document.querySelectorAll('.person-stats em')].map(e => e.textContent).join('/');
    const bars = [...document.querySelectorAll('.person-stats b')].map(e => [e.style.width, e.className]);
    return { r120, r100, qin, after1y, reload, shown, bars, span: [120, 100].map(l => 20000 + l * 400) };
  });
  check('2 能力値120は切り捨てられない:戦闘の強さは統率100より大きく、成長の計算・1年の進行・セーブとロードでも120のまま。人物画面にも120と出る',
    r2.r120 > r2.r100 && r2.qin === 113 && r2.after1y === '120/115/118/115/120' && r2.reload === '120/115/118/115/120' && r2.shown === '120/115/118/115/120' && r2.bars[0][0] === '100%' && r2.bars[0][1] === 'over100', r2);
  await p.close();

  // ---------- 3. 固有能力(1つずつ) ----------
  const q = await open('s304v');
  const r3 = await q.evaluate(async () => { const g = window.__goko, c = g.campaign, D = window.__gokoData, V = window.__gokoVirtual, est = window.__gokoEstimate;
    const hao = D.persons.find(x => x.id === 'vh_liu_hao'); const keep = [...hao.traits];
    const only = (t) => { hao.traits = t; V.clearTraitCache(); };
    const side = (role, cmd, t = { infantry: 8000, cavalry: 4000, archer: 2000 }) => ({ role, kind: 'army', factionId: role === 'attacker' ? 'chu' : 'jin', armyId: 'x' + role, cityId: null, name: role, commander: cmd, troops: { ...t }, morale: 70, fatigue: 10, food: 50, fortification: null });
    const S = (cmd) => ({ battleId: 't', battleType: 'field_battle', name: 't', location: { lon: 112, lat: 32, name: 't' }, terrain: 'plain', createdAt: { day: 1, text: '' }, attacker: side('attacker', cmd), defender: side('defender', null) });
    const ratio = (traits) => est(S({ ...hao, traits })).ratio;
    const out = {};
    const base = ratio([]);
    out.tianming = +(ratio(['天命覇王']) / base).toFixed(3); out.junshen = +(ratio(['軍神降臨']) / base).toFixed(3); out.both = +(ratio(keep) / base).toFixed(3);
    out.allEight = +(ratio(keep) / base).toFixed(3);
    out.morale = [V.moraleWithTraits(60, { ...hao, traits: ['天命覇王'] }), V.moraleWithTraits(85, { ...hao, traits: ['天命覇王'] }), V.moraleWithTraits(60, { ...hao, traits: [] })];
    // 炎漢正統:登用の見込み+40ポイント(捕虜を楚が預かる)
    const tgt = D.persons.find(x => x.factionId === 'jin' && x.role !== 'ruler' && c.personStatus(x.id) === 'active');
    c.spoils.addCaptive(tgt.id, 'chu', 'jin', Math.floor(c.day)); c.personStates[tgt.id] = 'captured';
    only(keep); const pr1 = c.recruitChance(tgt.id, 'chu'); only(keep.filter(t => t !== '炎漢正統')); const pr0 = c.recruitChance(tgt.id, 'chu'); only(keep);
    out.recruit = [Math.round(pr0 * 100), Math.round(pr1 * 100)];
    // 炎漢正統:治安の戻り3倍(1日の戻り)。楚の宛と、晋の洛陽で比べる
    const wan = c.cities.find(k => k.id === 'wan'), ly = c.cities.find(k => k.id === 'luoyang');
    for (const k of [wan, ly]) c.cityStates[k.id] = { ...c.cityState(k), order: 40, garrison: 100 };
    c.repairCities(); out.order = [+(c.cityState(wan).order - 40).toFixed(2), +(c.cityState(ly).order - 40).toFixed(2)];
    // 神算鬼謀:調略の倍率と、受ける調略への耐性
    const fx = V.factionTraitEffects('chu', Math.floor(c.day) + 1); out.plot = [+V.prodOf(fx, 'plot').toFixed(2), +V.prodOf(fx, 'plotResist').toFixed(2), V.prob(0.6 * V.prodOf(fx, 'plot'), V.LIMITS.plotMax)];
    // 盛世創造:金・兵糧の収入(能力あり/なし)
    only(keep); const inc1 = c.economy.report('chu').income; only(keep.filter(t => t !== '盛世創造')); const inc0 = c.economy.report('chu').income; only(keep);
    out.income = [+(inc1.total / inc0.total).toFixed(2), +(inc1.grain / inc0.grain).toFixed(2)];
    // 英傑帰心:忠誠の目安+15
    const huo = D.persons.find(x => x.id === 'vh_huo_lie'); only(keep); const t1 = c.loyalty.target(huo).value; only(keep.filter(t => t !== '英傑帰心')); const t0 = c.loyalty.target(huo).value; only(keep);
    out.loyalty = [Math.round(t0), Math.round(t1)];
    // 英傑帰心:在野の人物(動かない勢力「諸部族」にいる人)が自ら仕える
    const roam = D.persons.find(x => x.factionId === 'jin' && x.role !== 'ruler' && x.id !== tgt.id && c.personStatus(x.id) === 'active'); roam.factionId = 'tribes';
    for (let i = 0; i < 60 && roam.factionId !== 'chu'; i++) { c.day += 30; V.clearTraitCache(); c.loyalty.volunteers(); }
    out.volunteer = [roam.name, roam.factionId];
    // 不敗の軍略:兵糧の消費・疲れ(同じ場所・同じ状態の2つの軍団で、1日の増減を比べる)
    const A = c.armies.find(s => s.army.commanderId === 'vh_liu_hao'), B = c.armies.find(s => s.army.commanderId === 'vh_huo_lie');
    for (const s of [A, B]) { s.army.lon = 108.9; s.army.lat = 34.0; s.army.food = 50; s.army.fatigue = 20; s.status = 'marching'; }
    c.dailyUpkeep(A); c.dailyUpkeep(B); out.upkeep = { food: [+(50 - A.army.food).toFixed(2), +(50 - B.army.food).toFixed(2)], fatigue: [+(A.army.fatigue - 20).toFixed(2), +(B.army.fatigue - 20).toFixed(2)] };
    // 絶世の英姿:外交の友好度の上がり方(楚と成/晋と成)
    const a0 = c.diplo.amityOf('chu', 'chenghan'); c.diplo.addAmity('chu', 'chenghan', 10); const b0 = c.diplo.amityOf('jin', 'chenghan'); c.diplo.addAmity('jin', 'chenghan', 10);
    out.amity = [+(c.diplo.amityOf('chu', 'chenghan') - a0).toFixed(1), +(c.diplo.amityOf('jin', 'chenghan') - b0).toFixed(1)];
    out.affection = V.personMult(hao, 'affection');
    // 家臣の特殊能力:効果表にすべてある
    out.retainers = D.persons.filter(x => x.factionId === 'chu').map(x => [x.name, x.traits.filter(t => !V.TRAITS[t])]).filter(x => x[1].length);
    out.labels = Object.keys(V.TRAITS).length;
    // 水軍:川の上で強く、速い
    const nav = c.armies.find(s => s.army.naval);
    const sideN = (naval) => ({ ...side('attacker', null), naval });
    out.naval = +(est({ ...S(null), terrain: 'greatRiver', attacker: sideN(true) }).ratio / est({ ...S(null), terrain: 'greatRiver', attacker: sideN(false) }).ratio).toFixed(2);
    out.cap = V.LIMITS;
    return out;
  });
  check('3a 天命覇王:軍団の強さ×1.5・士気×1.5(100まで)', Math.abs(r3.tianming - 1.5) < 0.01 && r3.morale[0] === 90 && r3.morale[1] === 100 && r3.morale[2] === 60, { tianming: r3.tianming, morale: r3.morale });
  check('3b 軍神降臨:指揮下の部隊の戦闘能力×1.3。8つすべてを持つ劉皓は×1.95で、重なりの上限(×2)を超えない', Math.abs(r3.junshen - 1.3) < 0.01 && r3.allEight <= 2.0001 && r3.allEight > 1.9, { junshen: r3.junshen, all: r3.allEight });
  check('3c 炎漢正統:登用の見込み+40ポイント(0〜95%に収まる)・治安の戻り3倍', r3.recruit[1] - r3.recruit[0] >= 39 && r3.recruit[1] <= 95 && Math.abs(r3.order[0] / r3.order[1] - 3) < 0.05, { recruit: r3.recruit, order: r3.order });
  check('3d 神算鬼謀:調略の見込みが強まり(玄機妙算と合わせ×1.8)、敵の調略は3割に。見込みは90%まで', r3.plot[0] === 1.8 && r3.plot[1] === 0.3 && r3.plot[2] <= 0.9, r3.plot);
  check('3e 盛世創造:金・兵糧の収入が1.5倍(金は太守の能力と合わせて都市ごとに2倍まで)', r3.income[0] >= 1.4 && r3.income[0] <= 1.5 && r3.income[1] === 1.5, r3.income);
  check('3f 英傑帰心:家臣の忠誠の目安+15。在野の人物が自ら仕える', r3.loyalty[1] - r3.loyalty[0] >= 14 && r3.volunteer[1] === 'chu', { loyalty: r3.loyalty, volunteer: r3.volunteer });
  check('3g 不敗の軍略:兵糧の消費と疲れが半分', r3.upkeep.food[0] > 0 && Math.abs(r3.upkeep.food[0] * 2 - r3.upkeep.food[1]) < 0.01 && Math.abs(r3.upkeep.fatigue[0] * 2 - r3.upkeep.fatigue[1]) < 0.01, r3.upkeep);
  check('3h 絶世の英姿:外交の友好度の上がり方1.5倍(弁舌の士と合わせ1.65倍)・後宮の好感度1.5倍', r3.amity[0] > r3.amity[1] && Math.abs(r3.amity[0] - 16.5) < 0.6 && r3.affection === 1.5, { amity: r3.amity, affection: r3.affection });
  check('3i 家臣20人の特殊能力はすべて効果表にあり、水軍は川の上で×1.3強い', r3.retainers.length === 0 && r3.naval === 1.3, { missing: r3.retainers, naval: r3.naval, traits: r3.labels });
  await q.close();

  // ---------- 4. 既存のシナリオへの影響がない ----------
  const z = await open('s304');
  const r4 = await z.evaluate(() => { const D = window.__gokoData, c = window.__goko.campaign; return { chu: D.scenario.factions.some(f => f.id === 'chu'), xinye: c.cities.some(k => k.id === 'xinye'), virtual: D.persons.some(x => x.virtual), cap: D.scenario.statCap ?? 100, xy: D.scenario.cityOwners.xiangyang, liuhong: D.persons.find(x => x.id === 'liu_hong')?.residence ?? null, max: Math.max(...D.persons.map(x => Math.max(x.leadership, x.war, x.intelligence, x.politics, x.charisma))) }; });
  check('4 史実の304年には、楚・新野・架空の人物がなく、能力の上限は100のまま(既存のシナリオに影響しない)', !r4.chu && !r4.xinye && !r4.virtual && r4.cap === 100 && r4.xy === 'jin' && r4.max <= 100, r4);
  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
})();
