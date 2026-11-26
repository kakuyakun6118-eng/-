// 劉裕の北伐・劉宋の建国:409年・416年のシナリオ、人物の途中登場、13件の事件、却月陣、劉裕の特性、特殊会戦、
// 劉宋の建国(禅譲)と引き継ぎ、皇帝生活モードとの連動、分岐の道筋、史実重視でも強制しないこと、古いセーブ、瞬間移動しないこと。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1600)); if (!ok) problems.push(label); };
  const open = async (sc) => {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    p.on('pageerror', e => errs.push(sc + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => {
      // 共通の道具:日を進める(事件の選択は、プレイヤーの役なら指定の選択肢、ほかはAI)。軍団の1日の移動の最大(瞬間移動の検査)を記録する
      window.__ly = { maxJump: 0 };
      window.__runDays = (days, pickFor = {}) => { const g = window.__goko, c = g.campaign, h = c.history; const d0 = c.day; let n = 0; let last = new Map(c.armies.map(s => [s.army.id, [s.army.lon, s.army.lat, Math.floor(c.day)]]));
        while (c.day - d0 < days && n++ < 3000000) {
          const aw = h.awaiting; if (aw) { const roles = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => roles[k] === c.playerFactionId) ?? Object.keys(aw.choices).find(k => roles[k]); const want = pickFor[aw.id]; h.choose(aw.id, (aw.choices[role].find(x => x.id === want) ?? aw.choices[role][0]).id); }
          h.queue = h.queue.filter(q => q.mode === 'decide');
          if (c.speed === 0) { for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
          c.update(0.25);
          const day = Math.floor(c.day);
          for (const s of c.armies) { const l = last.get(s.army.id); if (l && day > l[2]) { const km = Math.hypot((s.army.lon - l[0]) * 92, (s.army.lat - l[1]) * 111) / Math.max(1, day - l[2]); if (km > window.__ly.maxJump) window.__ly.maxJump = km; } if (!l || day > l[2]) last.set(s.army.id, [s.army.lon, s.army.lat, day]); }
        } };
    });
    return p;
  };

  // ---------- 1. シナリオ ----------
  let p = await open('s409');
  const r1 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData, h = c.history;
    const ly = D.persons.find(x => x.id === 'liu_yu_song');
    const ids = D.persons.map(x => x.id);
    const deadAtStart = D.persons.filter(x => x.died && x.died < 409).map(x => x.name);
    const ev = ['liuyu404', 'nanyan409', 'linqu409', 'guanggu410', 'luxun410', 'yaoxing416', 'beifa416', 'luoyang416', 'queyue417', 'changan417', 'muzhi417', 'guanzhong418', 'song420'];
    return { name: D.scenario.name, factions: D.scenario.factions.map(f => f.name), ly: ly && [ly.leadership, ly.war, ly.intelligence, ly.politics, ly.charisma, ly.traits.join('・'), ly.factionId], dup: ids.length - new Set(ids).size, deadAtStart,
      kids: D.persons.filter(x => ['liu_yifu', 'liu_yizhen', 'liu_yilong'].includes(x.id)).map(x => x.name + ':' + x.factionId), heirJin: c.court.heirs.jin, cap: c.capitalCityOf('nanyan')?.name,
      ev: ev.map(i => i + ':' + (h.records[i]?.status ?? 'none')), guanggu: c.cities.find(k => k.id === 'guanggu').defense, war: c.relationOf('jin', 'nanyan') };
  });
  check('1a 409年のシナリオ:南燕討伐。東晋・南燕・後秦・北魏・夏・北燕・西秦・北涼・南涼・西涼・譙蜀がそろい、劉裕は統率99・武力97・知力91・政治94・魅力96と5つの特性。死者・重複なし。劉裕の子は親のもとに加わる',
    r1.name.includes('南燕') && ['東晋', '南燕', '後秦', '北魏', '夏', '北燕', '西秦', '北涼', '南涼', '西涼', '譙蜀'].every(n => r1.factions.includes(n)) && r1.ly.slice(0, 5).join() === '99,97,91,94,96' && r1.ly[5] === '北府軍・北伐の雄・水陸並進・開国の英傑・百戦錬磨' && r1.dup === 0 && r1.deadAtStart.length === 0 && r1.kids.length === 3 && r1.heirJin === 'sima_dewen' && r1.cap === '広固' && r1.war === 'war', r1);
  check('1b 409年:404年の挙兵は開始前の史実、409年以降の12件は未発生として待つ', r1.ev[0] === 'liuyu404:past' && r1.ev.slice(1).every(x => x.endsWith(':pending')), r1.ev);
  const s409 = p;

  p = await open('s416');
  const r2 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData, h = c.history;
    const ids = D.persons.map(x => x.id);
    return { name: D.scenario.name, factions: D.scenario.factions.map(f => f.name), qinRuler: c.rulerOf('houqin')?.name, xing: D.persons.some(x => x.id === 'yao_xing'), dup: ids.length - new Set(ids).size, dead: D.persons.filter(x => x.died && x.died < 416).map(x => x.name),
      tongwan: (() => { const k = c.cities.find(k => k.id === 'shuofang'); return [k.name, k.defense, k.level, c.cityState(k).garrison]; })(), jinArmies: c.armies.filter(s => s.army.factionId === 'jin').length, beifa: h.records.beifa416.status, past: ['nanyan409', 'luxun410', 'yaoxing416'].map(i => h.records[i].status) };
  });
  check('1c 416年のシナリオ:長安奪還。後秦の君主は姚泓(姚興は没して名簿にいない)。南燕・譙蜀・南涼は滅んだあと。統万城は堅城(守り95)。東晋は北伐の軍団を5つ以上持つ',
    r2.name.includes('長安') && ['東晋', '後秦', '北魏', '夏', '北燕', '西秦', '北涼', '西涼'].every(n => r2.factions.includes(n)) && !r2.factions.includes('南燕') && r2.qinRuler === '姚泓' && !r2.xing && r2.dup === 0 && r2.dead.length === 0 && r2.tongwan[0] === '統万' && r2.tongwan[1] === 95 && r2.jinArmies >= 5 && r2.beifa === 'pending' && r2.past.every(s => s === 'past'), r2);
  const s416 = p;

  // ---------- 2. 途中から登場する人物(383年から始めたとき) ----------
  p = await open('s383');
  const r3 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
    const before = D.persons.some(x => x.id === 'liu_yu_song');
    // 399年になったとして、登場の表を調べる(劉牢之がいる国に加わる)
    c.court.historicDebuts(399);
    const ly = D.persons.find(x => x.id === 'liu_yu_song'); const lz = D.persons.find(x => x.id === 'liu_laozhi');
    const n1 = D.persons.length; c.court.historicDebuts(399); const n2 = D.persons.length;
    // ゆかりの人物が死んでいて、ゆかりの国もなければ登場しない(歴史が変わったため)
    const sv = g.buildSave();
    return { before, ly: ly && ly.factionId, lz: lz && lz.factionId, again: n2 - n1, zang: D.persons.find(x => x.id === 'zang_aiqin')?.factionId, saved: JSON.stringify(sv.court?.added ?? sv).includes('liu_yu_song') };
  });
  check('2 早い年代(383年)から始めると、劉裕は史実で世に出た年に、ゆかりの劉牢之の国へ加わる(二重には加わらない。妻も加わる。セーブに残る)', !r3.before && r3.ly && r3.ly === r3.lz && r3.again === 0 && r3.zang === r3.ly && r3.saved, r3);
  await p.close();

  // ---------- 3. 却月陣・特性・特殊会戦 ----------
  const r4 = await s416.evaluate(() => { const D = window.__gokoData; const est = window.__gokoEstimate, auto = window.__gokoAuto;
    const P = (id) => D.persons.find(x => x.id === id);
    const side = (role, f, cmd, inf, cav, arc, morale = 75) => ({ role, kind: 'army', factionId: f, armyId: 'x_' + role, cityId: null, name: role, commander: cmd, troops: { infantry: inf, cavalry: cav, archer: arc }, morale, fatigue: 10, food: 50, fortification: null });
    const setup = (att, def, tactics, id = 'q') => ({ battleId: id, battleType: 'field_battle', name: 'test', location: { lon: 115.4, lat: 35.75, name: '黄河北岸' }, terrain: 'plain', createdAt: { day: 1, text: '' }, attacker: att, defender: def, tactics });
    const Q = { formation: { side: 'defender', id: 'queyue' } };
    const ding = { ...P('ding_wu') };
    // 史実:晋は兵数千(戦車百)に大弩、北魏は騎兵3万
    const jin = () => side('defender', 'jin', ding, 4000, 0, 3000);
    const weiCav = () => side('attacker', 'beiwei', { ...P('zhangsun_song') }, 2000, 18000, 1000);
    const weiInf = () => side('attacker', 'beiwei', { ...P('zhangsun_song') }, 18000, 2000, 1000);
    const weiHuge = () => side('attacker', 'beiwei', { ...P('zhangsun_song') }, 6000, 60000, 4000);
    const w = (s) => Math.round(est(s).defender * 100);
    const withQ = w(setup(weiCav(), jin(), Q)), without = w(setup(weiCav(), jin(), undefined));
    const vsInf = w(setup(weiInf(), jin(), Q)), vsInfNo = w(setup(weiInf(), jin(), undefined));
    const huge = w(setup(weiHuge(), jin(), Q));
    // 河を背にした陣が敗れたときの損害(却月陣あり/なし)
    // 敗れたときの損害の割合(却月陣は河に追い落とされるので、ふつうの敗北の最小20%に15%が上乗せされ、35%を下回らない)
    const lossRate = (mk, tac) => { const out = []; for (let i = 0; i < 40; i++) { const st = setup(mk(), jin(), tac, 'L' + i); const r = auto(st); if (r.winner === 'attacker') out.push(r.defenderLosses / 7000); } return out.length ? Math.round(Math.min(...out) * 100) : null; };
    const closeFoe = () => side('attacker', 'beiwei', { ...P('zhangsun_song') }, 7500, 0, 1000);
    // 劉裕の特性:同じ能力で特性のない指揮官と比べる
    const ly = P('liu_yu_song'); const plain = { ...ly, traits: [] };
    const atk = (cmd) => side('attacker', 'jin', cmd, 20000, 2000, 6000);
    const yan = () => side('defender', 'nanyan', null, 12000, 12000, 3000); // 416年には南燕の将がいないので、指揮官なしで比べる
    const wa = (s) => Math.round(est(s).attacker * 100);
    const trait = wa(setup(atk(ly), yan())), noTrait = wa(setup(atk(plain), yan()));
    const factors = est(setup(atk(ly), yan())).factors.filter(f => /北府|北伐|百戦/.test(f));
    // 百戦錬磨:負けたときに捕らわれ・討たれる回数(多数回の自動の決着で比べる)
    const fate = (cmd) => { let bad = 0; for (let i = 0; i < 400; i++) { const r = auto(setup(side('attacker', 'jin', cmd, 3000, 0, 500, 40), side('defender', 'nanyan', null, 20000, 20000, 5000), undefined, 'F' + i)); if (['killed', 'captured'].includes(r.sides.attacker.commander)) bad++; } return bad; };
    return { withQ, without, vsInf, vsInfNo, huge, lossQ: lossRate(weiHuge, Q), lossNo: lossRate(closeFoe, undefined), trait, noTrait, factors, fateLy: fate(ly), fatePlain: fate(plain) };
  });
  check('3a 却月陣は騎兵の大軍に強い(陣あり/なしの勝率)。歩兵の多い敵には効き目が小さい。60,000の騎兵の前では陣があっても負けうる(負ける条件)',
    r4.withQ >= r4.without + 25 && (r4.vsInf - r4.vsInfNo) < (r4.withQ - r4.without) * 0.5 && r4.huge < 50, r4);
  check('3b 却月陣は河を背にするので、敗れたときの損害が大きい(敗れた陣の損害は35%を下回らない。陣なしの接戦の敗北より大きい)', r4.lossQ !== null && r4.lossNo !== null && r4.lossQ >= 35 && r4.lossQ > r4.lossNo, { lossQ: r4.lossQ + '%', lossNo: r4.lossNo + '%' });
  check('3c 劉裕の特性(北府軍・北伐の雄・百戦錬磨)が勝率に効き、見積もりの理由に出る。百戦錬磨は負けても捕らわれ・討たれにくい。それでも劉裕は不敗ではない',
    r4.trait > r4.noTrait && r4.factors.length >= 2 && r4.fateLy < r4.fatePlain && r4.fateLy > 0, { trait: r4.trait, noTrait: r4.noTrait, factors: r4.factors, fateLy: r4.fateLy, fatePlain: r4.fatePlain });
  const r5 = await s416.evaluate(() => { const c = window.__goko.campaign; const ly = window.__gokoData.persons.find(x => x.id === 'liu_yu_song'); const plain = { ...ly, traits: [] };
    const a = c.armies.find(s => s.army.commanderId === 'liu_yu_song');
    const sp1 = c.marchSpeed(a); const keep = a.army.commanderId; const other = c.armies.find(s => s.army.factionId === 'jin' && s !== a);
    const sp2 = c.marchSpeed({ ...a, army: { ...a.army, commanderId: other.army.commanderId } });
    return { sp1, sp2, keep };
  });
  check('3d 劉裕の特性「水陸並進」で行軍が速い(同じ軍団で指揮官だけ替えて比べる)', r5.sp1 > r5.sp2, r5);

  // ---------- 4. 事件:南燕討伐・臨朐の戦い(409年)。瞬間移動しない ----------
  const r6 = await s409.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: 'jin', historyMode: 'historic' }); c.speed = 0;
    const a = c.armies.find(s => s.army.commanderId === 'liu_yu_song'); const p0 = [a.army.lon, a.army.lat];
    window.__runDays(40, { nanyan409: 'go' });
    const rec = h.records.nanyan409; const a1 = c.armies.find(s => s.army.commanderId === 'liu_yu_song');
    return { status: rec.status, picks: rec.picks, moved: a1 ? Math.round(Math.hypot((a1.army.lon - p0[0]) * 92, (a1.army.lat - p0[1]) * 111)) : -1, maxJump: Math.round(window.__ly.maxJump), linqu: h.records.linqu409.status };
  });
  check('4a 409年4月の南燕討伐:プレイヤー(東晋)が「大峴山を越える」を選ぶと、劉裕の軍団が臨朐へ進軍する(1日の移動は100km以内で、瞬間移動しない。戦場のそば45km以内で向かい合わせる決まりの分を含む)', ['occurred', 'branched'].includes(r6.status) && r6.picks.att?.choice === 'go' && r6.moved > 50 && r6.maxJump <= 100, r6);
  const r7 = await s409.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history;
    window.__runDays(120, { linqu409: 'wagon', guanggu410: 'siege' });
    const ev = c.events.filter(e => ['linqu409', 'guanggu410'].includes(e.histId)).map(e => [e.histId, e.status, (e.tactics?.notes ?? []).join('/').slice(0, 120)]);
    return { linqu: h.records.linqu409.status, guanggu: h.records.guanggu410.status, result: (h.records.linqu409.result ?? '').slice(0, 200), ev, owner: window.__gokoData.scenario.cityOwners.guanggu, maxJump: Math.round(window.__ly.maxJump),
      setupName: (() => { const e = c.events.find(x => x.histId === 'linqu409'); const s = e && window.__gokoSetup(e); return s ? [s.name, (s.tactics?.notes ?? []).some(n => /特殊会戦/.test(n))] : null; })() };
  });
  check('4b 臨朐の戦い:両軍が戦場で出会ってから会戦になり(瞬間移動なし)、特殊会戦の説明と車陣の作戦が付く。勝敗は固定されない(結果は記録に残る)',
    ['occurred', 'branched'].includes(r7.linqu) && (r7.ev.some(e => e[0] === 'linqu409') ? r7.ev.some(e => e[0] === 'linqu409' && /車陣|特殊会戦|鉄騎/.test(e[2])) : true) && r7.maxJump <= 100, r7);

  // ---------- 5. 劉宋の建国(禅譲):国号・旗・君主・位・後継者。武将・領土・軍団・財政・婚姻はそのまま ----------
  const r8 = await s416.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; g.changeSettings({ playerFactionId: 'jin', historyMode: 'free' }); c.speed = 0;
    c.loyalty.fame.liu_yu_song = 95;
    const snap = () => ({ cities: c.cities.filter(k => D.scenario.cityOwners[k.id] === 'jin').length, armies: c.armies.filter(s => s.army.factionId === 'jin').length, troops: c.armies.filter(s => s.army.factionId === 'jin').reduce((n, s) => n + s.army.troops.infantry + s.army.troops.cavalry + s.army.troops.archer, 0),
      gold: Math.round(c.factionStates.jin.gold), grain: Math.round(c.factionStates.jin.grain), officers: D.persons.filter(x => x.factionId === 'jin' && c.personStatus(x.id) !== 'dead').length, marriages: c.diplo.marriages.filter(m => D.persons.find(x => x.id === m.husband)?.factionId === 'jin').length });
    const before = snap();
    const st = h.listState(h.def('song420'));
    const fired = h.fire('song420'); const res = h.choose('song420', 'abdicate');
    const f = D.scenario.factions.find(x => x.id === 'jin');
    const after = snap();
    const out = { can: st.can, reasons: st.reasons, fired, res: String(res).slice(0, 160), name: f.name, color: f.color, ruler: c.rulerOf('jin')?.name, rank: c.court.rankOf('jin'), heir: c.court.heirs.jin, before, after, dewen: c.personStatus('sima_dewen') };
    // セーブ・ロードで国号と旗の色が残る
    const sv = JSON.parse(JSON.stringify(g.buildSave())); g.applySave(sv);
    const f2 = D.scenario.factions.find(x => x.id === 'jin'); out.reload = [f2.name, f2.color, c.rulerOf('jin')?.name];
    return out;
  });
  check('5a 劉宋の建国:晋の皇帝が劉裕に位を譲り、国号「宋(劉宋)」・旗の色・君主(劉裕)・位(皇帝)・後継者(劉義符)が変わる',
    r8.can && r8.name === '宋(劉宋)' && r8.color === '#b8442f' && r8.ruler === '劉裕' && r8.rank === 'emperor' && r8.heir === 'liu_yifu', r8);
  check('5b 建国のあとも、武将・領土・軍団・兵・財政・婚姻はそのまま引き継がれる。前の皇帝は生きて退く。セーブ・ロードで国号と旗の色が残る',
    JSON.stringify(r8.before) === JSON.stringify(r8.after) && r8.dewen !== 'dead' && r8.reload[0] === '宋(劉宋)' && r8.reload[1] === '#b8442f' && r8.reload[2] === '劉裕', { before: r8.before, after: r8.after, dewen: r8.dewen, reload: r8.reload });

  // ---------- 6. 皇帝生活モード:劉裕が皇帝になれば、劉裕の家族で後宮が動く。政治をAIに任せても北伐は止まらない ----------
  const r9 = await s416.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace; g.enterPalace(); const ruler = P.ruler();
    const wives = c.court.spousesOf(ruler.id).map(x => x.name); const kids = c.court.childrenOf(ruler.id).map(x => x.name);
    const ops0 = c.strategy.ops.filter(o => o.factionId === 'jin').length;
    g.palaceAdvance(4 * 30 * 3);
    const s = g.palace?.screen; const areas = s ? ['emperorHall', 'garden'].map(a => s.here(a).length) : [];
    return { ruler: ruler.name, wives, kids, posture: c.strategy.posture.jin?.posture, ops: c.strategy.ops.filter(o => o.factionId === 'jin').length, ops0, moves: c.strategy.stats?.jin?.moves ?? null, present: P.present().length, areas, minors: P.present().filter(n => P.ageOf(n) < 18).length };
  });
  check('6 劉裕が皇帝の宋で皇帝生活モードに入ると、君主は劉裕・家族は劉裕の妻子。2Dの後宮が動き、政治を任された戦略AIは方針を持って動き続ける(北伐は止まらない)。未成年は後宮に出ない',
    r9.ruler === '劉裕' && r9.wives.length >= 1 && r9.kids.length >= 3 && !!r9.posture && r9.minors === 0 && r9.present > 0, r9);

  // ---------- 7. 分岐の道筋(別案・改変を選ぶ)と、史実重視でも強制しないこと ----------
  p = await open('s416');
  const r10 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; c.speed = 0; const save = g.buildSave(); const out = {};
    const tryEv = (id, role, choice, prep, player = 'jin') => { g.applySave(save); g.changeSettings({ playerFactionId: player, historyMode: 'free' }); if (prep) prep(); const st = h.listState(h.def(id)); const f = h.fire(id); let res = ''; if (h.records[id].status === 'awaiting') res = h.choose(id, choice); return { can: st.can, why: st.reasons.slice(0, 2), status: h.records[id].status, res: String(res || h.records[id].result || '').slice(0, 140) }; };
    // 劉裕が帝位を求めず晋が続く
    out.vassal = tryEv('song420', 'f', 'vassal', () => { c.loyalty.fame.liu_yu_song = 95; });
    out.vassal.jin = D.scenario.factions.find(x => x.id === 'jin').name;
    // 北方の統一を目指す
    g.applySave(save); g.changeSettings({ playerFactionId: 'jin', historyMode: 'free' });
    out.unify = tryEv('song420', 'f', 'unify', () => { c.loyalty.fame.liu_yu_song = 95; }); out.unify.flag = h.flags.liuyu_unify;
    // 史実重視:劉裕が亡くなっていれば、第二次北伐は起きない(分岐として記録される)
    g.applySave(save); g.changeSettings({ playerFactionId: 'silla', historyMode: 'historic' });
    c.court.kill('liu_yu_song', 'illness', 'テスト');
    h.trigger(h.def('beifa416')); out.deadLiu = { status: h.records.beifa416.status, result: (h.records.beifa416.result ?? '').slice(0, 120) };
    // 史実重視:洛陽を得ていなければ、洛陽奪還の事件は起きない
    g.applySave(save); g.changeSettings({ playerFactionId: 'silla', historyMode: 'historic' });
    h.trigger(h.def('luoyang416')); out.noLuoyang = { status: h.records.luoyang416.status, result: (h.records.luoyang416.result ?? '').slice(0, 100) };
    // 長安を捨てて西へ逃れる(後秦が生き残る)
    out.flee = tryEv('changan417', 'def', 'flee', () => { const a = c.armies.find(s => s.army.factionId === 'jin'); a.army.lon = 109.6; a.army.lat = 34.4; }, 'houqin'); out.flee.qinAlive = !D.scenario.factions.find(x => x.id === 'houqin').fallen; out.flee.changan = D.scenario.cityOwners.changan;
    g.applySave(save);
    return out;
  });
  check('7a 分岐:劉裕が晋の臣下にとどまる(宋を建てない)と晋が続く。北方の統一を選ぶと、戦略AIの目標が変わる(印が立つ)',
    r10.vassal.status === 'branched' && r10.vassal.jin === '東晋' && r10.unify.status === 'branched' && r10.unify.flag === '1', { vassal: r10.vassal, unify: r10.unify });
  check('7b 史実重視のモードでも、劉裕が亡くなっていれば第二次北伐は起きず、洛陽を得ていなければ洛陽奪還は起きない(歴史を強制しない)',
    r10.deadLiu.status === 'branched' && /劉裕/.test(r10.deadLiu.result) && r10.noLuoyang.status === 'branched', { deadLiu: r10.deadLiu, noLuoyang: r10.noLuoyang });
  check('7c 分岐:後秦が長安を捨てて西へ逃れると、後秦は滅びずに続く(後秦の再建の道)', r10.flee.qinAlive && r10.flee.changan === 'jin', r10.flee);

  // ---------- 8. 古いセーブ(劉裕の北伐より前の形)を読み込める ----------
  const r11 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history; const sv = JSON.parse(JSON.stringify(g.buildSave()));
    for (const id of ['liuyu404', 'nanyan409', 'linqu409', 'guanggu410', 'luxun410', 'yaoxing416', 'beifa416', 'luoyang416', 'queyue417', 'changan417', 'muzhi417', 'guanzhong418', 'song420']) delete sv.campaign.history.records[id];
    if (sv.campaign.dynasty) delete sv.campaign.dynasty.colors;
    let err = ''; try { g.applySave(sv); } catch (e) { err = String(e).slice(0, 200); }
    window.__runDays(30);
    return { err, beifa: h.records.beifa416?.status, date: c.dateText() };
  });
  check('8 古いセーブ(事件の記録・旗の色の無い形)を読み込んでも、エラーなく続けられ、新しい事件は未発生として扱われる', !r11.err && !!r11.beifa, r11);

  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
})();
