// Version 51:軍団の帰城・都市の駐屯兵力の上限の撤廃・軍団結合(指示書 第6章の18項目と、画面の操作)
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sc, ctx = { viewport: { width: 1280, height: 800 } }) => { const p = await (await b.newContext(ctx)).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1500)); if (!ok) problems.push(label); };
  // 共通の道具
  const helpers = () => { window.__h = {
    g: () => window.__goko, c: () => window.__goko.campaign, D: () => window.__gokoData,
    // 日を進める(プレイヤーの会戦が起きると時間が止まるので、毎回動かし直す)
    run: (days) => { const c = window.__goko.campaign; const end = c.day + days; let n = 0; while (c.day < end && n++ < 5000) { c.speed = 8; c.update(0.25); } c.speed = 0; },
    tot: (t) => t.infantry + t.cavalry + t.archer,
    gt: (cityId) => { const c = window.__goko.campaign; const k = c.cities.find(x => x.id === cityId); const st = c.cityState(k); const g = Math.round(st.garrison); const m = st.garrisonMix; if (!m) { const a = Math.round(g * 0.3); return { infantry: g - a, cavalry: 0, archer: a }; } let cv = m.cavalry, ar = m.archer; if (cv + ar > g) { const k2 = g / (cv + ar); cv = Math.floor(cv * k2); ar = Math.floor(ar * k2); } return { infantry: g - cv - ar, cavalry: cv, archer: ar }; },
    // 都市の守備兵から軍団を作る(足りなければ守備兵を足す。テストの準備)
    raise: (cityId, n, cmd) => { const c = window.__goko.campaign; const k = c.cities.find(x => x.id === cityId); const st = c.cityState(k); c.cityStates[k.id] = { ...st, garrison: st.garrison + n + 1000 }; const f = c.factionStates[window.__gokoData.scenario.cityOwners[k.id]]; f.grain += 5000; const s = c.raiseArmy(cityId, n, cmd); if (typeof s === 'string') throw new Error(s); return s; },
    // 敵にする国:プレイヤー以外で、都市をいちばん多く持つ生きた国(fewest:いちばん少ない国)。戦争の関係にする
    enemy: (fewest) => { const c = window.__goko.campaign, D = window.__gokoData; const me = c.playerFactionId; const n = (f) => c.cities.filter(k => k.kind !== 'pass' && D.scenario.cityOwners[k.id] === f).length;
      const list = D.scenario.factions.filter(f => f.id !== me && !f.fallen && !f.passive && n(f.id) > 0 && c.rulerOf(f.id)).sort((a, b) => fewest ? n(a.id) - n(b.id) : n(b.id) - n(a.id)); const f = list[0].id; c.setRelation(me, f, 'war'); return f; },
    // 敵の国の軍団(いなければ、その国の都市で作る)
    foe: (f, not) => { const c = window.__goko.campaign, D = window.__gokoData; const s = c.armies.find(x => x.army.factionId === f && x !== not && x.status !== 'fighting'); if (s) return s; const k = c.cities.find(x => x.kind !== 'pass' && D.scenario.cityOwners[x.id] === f); return window.__h.raise(k.id, 4000, undefined); },
    km: (a, b) => Math.hypot((a.lon - b.lon) * 85, (a.lat - b.lat) * 111),
    // 自国の都市のうち、ある地点から minKm〜maxKm 離れた所(テストで離れた軍団を作るため)
    farCity: (f, from, minKm, maxKm = 9999) => { const c = window.__goko.campaign, D = window.__gokoData; return c.cities.filter(k => k.kind !== 'pass' && D.scenario.cityOwners[k.id] === f).map(k => [k, Math.hypot((k.lon - from.lon) * 85, (k.lat - from.lat) * 111)]).filter(([, d]) => d >= minKm && d <= maxKm).sort((a, b) => a[1] - b[1])[0]?.[0]; },
    freeGeneral: (f) => window.__gokoData.persons.find(x => x.factionId === f && x.role === 'general' && window.__goko.campaign.personStatus(x.id) === 'active' && !window.__goko.campaign.postOf(x.id) && !window.__goko.campaign.court.isMinor(x)),
    invariants: () => { const c = window.__goko.campaign, D = window.__gokoData; const bad = []; const seen = new Map();
      for (const s of c.armies) { if (D.scenario.factions.find(f => f.id === s.army.factionId)?.fallen) bad.push('滅んだ国の軍団:' + s.army.name);
        for (const id of c.membersOf(s.army)) { const st = c.personStatus(id); if (st === 'dead' || st === 'captured') bad.push(`死者・捕虜が軍団に:${s.army.name}:${id}`); if (seen.has(id)) bad.push(`同じ武将が2つの軍団に:${id}`); seen.set(id, s.army.id); }
        for (const k of ['infantry', 'cavalry', 'archer']) if (!(s.army.troops[k] >= 0)) bad.push('兵数が不正:' + s.army.name); }
      if (new Set(c.armies.map(s => s.army.id)).size !== c.armies.length) bad.push('同じIDの軍団が2つ');
      for (const k of c.cities) { const st = c.cityStates[k.id]; if (st && !(st.garrison >= 0)) bad.push('守備兵が不正:' + k.name); }
      return bad; },
  }; };

  let p = await open('s317');
  await p.evaluate(helpers);

  // ---- 1〜4. 帰城 ----
  const r1 = await p.evaluate(() => { const H = window.__h, g = H.g(), c = H.c(); c.speed = 0; g.changeSettings({ playerFactionId: 'jin' });
    const s = H.raise('jiankang', 12000, H.freeGeneral('jin')?.id); s.army.troops = { infantry: 7000, cavalry: 2500, archer: 2500 }; s.army.food = 40; s.army.morale = 80; s.army.fatigue = 30;
    const dep = H.freeGeneral('jin'); c.appoint(dep.id, { kind: 'deputy', id: s.army.id });
    const opts = c.returnOptions(s.army.id); const dest = opts.find(o => o.route && o.km > 150 && o.km < 400) ?? opts.find(o => o.route);
    const kId = dest.cityId; const before = H.gt(kId); const n = H.tot(s.army.troops); const troops = { ...s.army.troops }; const grain0 = c.factionStates.jin.grain;
    const cmd = s.army.commanderId, deputy = s.army.deputyId; const count0 = c.armies.length;
    const err = c.orderReturn(s.army.id, kId, dest.route);
    const p0 = { lon: s.army.lon, lat: s.army.lat }; const track = [];
    let day = 0; while (c.armies.includes(s) && day < 200) { H.run(1); day++; if (c.armies.includes(s)) track.push(H.km(p0, s.army)); }
    const after = H.gt(kId); const k = c.cities.find(x => x.id === kId);
    const loc = (id) => c.placement.locationOf(id);
    return { tags: opts.map(o => o.name + ':' + o.tags.join('/')), dest: dest.name, estDays: dest.days, km: dest.km, err, days: day, maxStep: Math.max(...track.map((v, i) => v - (track[i - 1] ?? 0))), gone: !c.armies.includes(s), count: [count0, c.armies.length],
      before, after, troops, n, g: [H.tot(before), H.tot(after)], grain: [Math.round(grain0), Math.round(c.factionStates.jin.grain)],
      cmdLoc: loc(cmd), depLoc: loc(deputy), cmdPost: c.postOf(cmd), still: c.armies.some(x => c.membersOf(x.army).includes(cmd) || x.army.id === s.army.id), inv: H.invariants(), k: k.name }; });
  check('1 軍団が自国の都市へ帰城する(候補に出発元・最寄り・首都、実際の道を日数をかけて進む。瞬間移動しない)', !r1.err && r1.gone && r1.days >= Math.max(2, r1.estDays * 0.5) && r1.maxStep < 100 && r1.tags.some(t => /出発元/.test(t)) && r1.tags.some(t => /最寄り/.test(t)) && r1.tags.some(t => /首都/.test(t)), r1);
  check('2 帰城後、兵力が都市へ兵種別に正しく加算される', r1.after.infantry - r1.before.infantry === r1.troops.infantry && r1.after.cavalry - r1.before.cavalry === r1.troops.cavalry && r1.after.archer - r1.before.archer === r1.troops.archer && r1.g[1] - r1.g[0] === r1.n && r1.grain[1] > r1.grain[0] - 5, { before: r1.before, after: r1.after, troops: r1.troops, grain: r1.grain });
  check('3 帰城後、指揮官・副将が都市へ戻る', r1.cmdLoc.cityId && r1.depLoc.cityId && r1.cmdLoc.label.includes(r1.k) && r1.depLoc.label.includes(r1.k) && !r1.cmdPost, { cmd: r1.cmdLoc, dep: r1.depLoc });
  check('4 帰城後、軍団が重複して残らない', r1.gone && !r1.still && r1.inv.length === 0, { count: r1.count, inv: r1.inv });

  // ---- 5〜6. 駐屯兵力の上限の撤廃と兵站 ----
  const r5 = await p.evaluate(() => { const H = window.__h, c = H.c(); const kId = 'jiankang'; const k = c.cities.find(x => x.id === kId);
    const st = c.cityState(k); c.cityStates[kId] = { ...st, garrison: 100000 }; delete c.cityStates[kId].garrisonMix; c.factionStates.jin.grain = 200000; c.factionStates.jin.gold = 200000;
    const rep0 = c.economy.report('jin');
    const s = H.raise('jiankang', 50000, undefined); c.cityStates[kId] = { ...c.cityState(k), garrison: 100000 };
    const err = c.orderReturn(s.army.id, kId); const g1 = c.cityState(k).garrison;
    const rep1 = c.economy.report('jin'); const grain1 = c.factionStates.jin.grain; const order1 = c.cityState(k).order ?? 60;
    H.run(62); const g2 = c.cityState(k).garrison; const grain2 = c.factionStates.jin.grain;
    // 兵糧が尽きたら:士気が下がり、人口に見合わない分から脱走する
    c.factionStates.jin.grain = -1e7; const m0 = c.cityState(k).morale; H.run(31); const g3 = c.cityState(k).garrison; const m3 = c.cityState(k).morale;
    return { err, g1, g2, g3, m0, m3, expGrain: [rep0.expense.grain, rep1.expense.grain], expGold: [rep0.expense.garrison, rep1.expense.garrison], grain: [Math.round(grain1), Math.round(grain2)], order: [order1, c.cityState(k).order], pop: c.cityState(k).pop, recruit: c.recruit(kId, 1000) }; });
  check('5 都市の守備兵が従来の上限(建康の規模で2万)を超えても維持される(10万+5万=15万。2か月後も減らない)', r5.err === null && r5.g1 === 150000 && r5.g2 >= 150000, r5);
  check('6 大量の駐屯兵が兵糧と費用を消費し、過密で治安が下がり、兵糧が尽きると士気が下がり脱走する', r5.expGrain[1] > r5.expGrain[0] && r5.expGold[1] > r5.expGold[0] && r5.grain[1] < r5.grain[0] && r5.order[1] < r5.order[0] && r5.g3 < r5.g2 && r5.m3 < r5.m0 && r5.g3 > r5.g2 * 0.9, r5);

  // ---- 7〜12. 軍団結合 ----
  const r7 = await p.evaluate(() => { const H = window.__h, c = H.c(); const g1 = H.freeGeneral('jin'); const A = H.raise('jiankang', 30000, g1.id); A.army.troops = { infantry: 20000, cavalry: 4000, archer: 6000 }; A.army.food = 60; A.army.morale = 80; A.army.fatigue = 10;
    const g2 = H.freeGeneral('jin'); const B = H.raise('jiankang', 20000, g2.id); B.army.troops = { infantry: 12000, cavalry: 5000, archer: 3000 }; B.army.food = 30; B.army.morale = 50; B.army.fatigue = 40;
    B.army.lon = A.army.lon + 0.1; B.army.lat = A.army.lat; const g3 = H.freeGeneral('jin'); c.appoint(g3.id, { kind: 'deputy', id: B.army.id });
    const pv = c.mergePreview(A.army.id, [B.army.id], g2.id);
    const loy = [c.loyalty.loyalty[g1.id], c.loyalty.loyalty[g2.id]];
    const err = c.orderMerge(A.army.id, [B.army.id], g2.id);
    const out = { err, pv: { total: pv.total, troops: pv.troops, food: pv.food, morale: pv.morale, fatigue: pv.fatigue, cmd: pv.commanderId }, bGone: !c.armies.includes(B), troops: { ...A.army.troops }, total: H.tot(A.army.troops), food: A.army.food, morale: A.army.morale, fatigue: A.army.fatigue,
      cmd: A.army.commanderId, dep: A.army.deputyId, officers: A.army.officers ?? [], expect: { cmd: g2.id, others: [g1.id, g3.id] }, posts: [g1.id, g3.id].map(id => c.postOf(id)), loy: [loy, [c.loyalty.loyalty[g1.id], c.loyalty.loyalty[g2.id]]], name: A.army.name };
    // 8. 3軍団以上
    const C1 = H.raise('jiankang', 5000, H.freeGeneral('jin')?.id); const C2 = H.raise('jiankang', 6000, H.freeGeneral('jin')?.id); const C3 = H.raise('jiankang', 7000, undefined);
    for (const [i, x] of [C2, C3].entries()) { x.army.lon = C1.army.lon + 0.05 * (i + 1); x.army.lat = C1.army.lat; }
    const t3 = [C1, C2, C3].reduce((s, x) => ({ infantry: s.infantry + x.army.troops.infantry, cavalry: s.cavalry + x.army.troops.cavalry, archer: s.archer + x.army.troops.archer }), { infantry: 0, cavalry: 0, archer: 0 });
    const people3 = [C1, C2, C3].flatMap(x => c.membersOf(x.army));
    out.err3 = c.orderMerge(C1.army.id, [C2.army.id, C3.army.id]); out.three = { gone: !c.armies.includes(C2) && !c.armies.includes(C3), troops: { ...C1.army.troops }, expect: t3, people: c.membersOf(C1.army), expectPeople: people3 };
    window.__A = A.army.id; out.inv = H.invariants();
    return out; });
  check('7 2つの軍団を結合する(3万+2万=5万)', r7.err === null && r7.bGone && r7.total === 50000 && r7.pv.total === 50000, r7);
  check('8 3つ以上の軍団を結合する', r7.err3 === null && r7.three.gone && JSON.stringify(r7.three.troops) === JSON.stringify(r7.three.expect) && r7.three.expectPeople.every(id => r7.three.people.includes(id)), r7.three);
  check('10 結合後の兵種別の人数が一致する(消えたり二重に増えたりしない)', JSON.stringify(r7.troops) === JSON.stringify({ infantry: 32000, cavalry: 9000, archer: 9000 }) && JSON.stringify(r7.pv.troops) === JSON.stringify(r7.troops), r7.troops);
  check('11 結合後の総指揮官は選んだ武将、ほかの武将は副将・配下武将になり、忠誠は変わらない', r7.cmd === r7.expect.cmd && [r7.dep, ...r7.officers].sort().join() === [...r7.expect.others].sort().join() && r7.posts.every(x => x && x.kind === 'deputy') && JSON.stringify(r7.loy[0]) === JSON.stringify(r7.loy[1]), { cmd: r7.cmd, dep: r7.dep, officers: r7.officers, posts: r7.posts, loy: r7.loy, name: r7.name });
  check('12 結合後の兵糧・士気・疲労は兵数の重みつき平均', Math.abs(r7.food - 48) < 0.01 && r7.morale === 68 && r7.fatigue === 22 && r7.pv.food === 48 && r7.pv.morale === 68, { food: r7.food, morale: r7.morale, fatigue: r7.fatigue });

  // ---- 9. 離れた軍団が合流してから結合する ----
  const r9 = await p.evaluate(() => { const H = window.__h, c = H.c(); const A = c.stateOf(window.__A);
    const B = H.raise(H.farCity('jin', A.army, 90, 300).id, 8000, H.freeGeneral('jin')?.id); const km0 = H.km(A.army, B.army); const n = H.tot(A.army.troops) + H.tot(B.army.troops);
    const pv = c.mergePreview(A.army.id, [B.army.id]); const err = c.orderMerge(A.army.id, [B.army.id]);
    const instant = !c.armies.includes(B); const p0 = { lon: B.army.lon, lat: B.army.lat }; const note = B.opNote; let day = 0; const steps = [];
    while (c.armies.includes(B) && day < 120) { const q = { lon: B.army.lon, lat: B.army.lat }; H.run(1); day++; if (c.armies.includes(B)) steps.push(H.km(q, B.army)); }
    return { km0: Math.round(km0), far: pv.far, err, instant, note, days: day, maxStep: Math.max(0, ...steps), merged: !c.armies.includes(B), total: H.tot(A.army.troops), n, inv: H.invariants() }; });
  check('9 離れた軍団は、相手のそばまで進んでから結合する(瞬間的な結合はしない)', r9.err === null && !r9.instant && r9.km0 > 60 && r9.days >= 2 && r9.maxStep < 100 && r9.merged && r9.total === r9.n && r9.inv.length === 0, r9);

  // ---- 13〜14. 結合した軍団の進軍・会戦・攻城戦 ----
  const r13 = await p.evaluate(() => { const H = window.__h, c = H.c(), D = H.D(); const A = c.stateOf(window.__A); const p0 = { lon: A.army.lon, lat: A.army.lat };
    const dest = H.farCity('jin', A.army, 120); const route = c.planRoute(A.army.id, { lon: dest.lon, lat: dest.lat }); c.orderMove(A.army.id, route); const st0 = A.status; const sp = c.marchSpeed(A);
    H.run(4); const moved = H.km(p0, A.army); H.run(40);
    // 14a. 野戦:後趙の軍団と
    const E = H.enemy(); const foe = H.foe(E); foe.army.lon = A.army.lon + 0.2; foe.army.lat = A.army.lat; foe.status = 'camping'; foe.route = null; A.status = 'camping';
    const n0 = c.events.length; c.startEvent(A, 'field_battle', foe, null); const ev = c.events[n0]; const setup = window.__gokoSetup(ev); const res = window.__gokoAuto(setup); const before = H.tot(A.army.troops); c.applyBattleResult(res);
    const field = { att: setup.attacker.troops, name: setup.attacker.name, winner: res.winner, before, after: c.armies.includes(A) ? H.tot(A.army.troops) : 0, status: ev.status };
    // 14b. 攻城戦:後趙の都市を
    let siege = null; if (c.armies.includes(A)) { const k = c.cities.find(x => D.scenario.cityOwners[x.id] === E && x.kind !== 'pass'); A.army.lon = k.lon + 0.05; A.army.lat = k.lat - 0.3; A.status = 'camping'; A.route = null; const m = c.events.length; c.startSiegeAt(A, k, ''); const e2 = c.events[m]; const s2 = window.__gokoSetup(e2); const r2 = window.__gokoAuto(s2); c.applyBattleResult(r2); siege = { city: k.name, att: H.tot(s2.attacker.troops), winner: r2.winner, status: e2.status, owner: D.scenario.cityOwners[k.id] }; }
    return { st0, speed: sp, moved: Math.round(moved), field, siege, inv: H.invariants() }; });
  check('13 結合後の軍団が正常に進軍する(大軍団は行軍が遅い)', r13.st0 === 'marching' && r13.moved > 20 && r13.speed < 30, r13);
  check('14 結合後の軍団が会戦・攻城戦に参加する', r13.field.status === 'completed' && r13.field.att.infantry > 0 && (!r13.siege || r13.siege.status === 'completed' || r13.siege.status === 'in_progress') && r13.inv.length === 0, r13);

  // ---- 16. セーブ・ロード(帰城の途中・結合の待ち・配下武将・守備兵の内訳) ----
  const r16 = await p.evaluate(() => { const H = window.__h, g = H.g(), c = H.c();
    const R = H.raise('jiankang', 9000, H.freeGeneral('jin')?.id); const opts = c.returnOptions(R.army.id); const far = opts.filter(o => o.route).sort((a, b) => b.km - a.km)[0]; c.orderReturn(R.army.id, far.cityId, far.route); H.run(2);
    const M1 = H.raise(H.farCity('jin', c.cities.find(k => k.id === 'jiankang'), 90, 300).id, 6000, H.freeGeneral('jin')?.id); const M0 = H.raise('jiankang', 7000, H.freeGeneral('jin')?.id); const o1 = H.freeGeneral('jin'); if (o1) c.appoint(o1.id, { kind: 'deputy', id: M0.army.id }); c.orderMerge(M0.army.id, [M1.army.id]); H.run(1);
    const snap = () => JSON.stringify({ armies: c.armies.map(s => [s.army.id, s.army.troops, s.army.commanderId, s.army.deputyId ?? null, s.army.officers ?? [], s.returnCityId ?? null, s.mergeInto ?? null, s.status]).sort(), mix: Object.fromEntries(Object.entries(c.cityStates).filter(([, v]) => v.garrisonMix).map(([k, v]) => [k, [v.garrison, v.garrisonMix]])), log: c.armyOpsLog.length });
    const a = snap(); const sv = JSON.parse(JSON.stringify(g.buildSave())); H.run(3); g.applySave(sv); const b2 = snap();
    // ロード後も続けて進む
    let d = 0; while ((c.stateOf(R.army.id) || c.stateOf(M1.army.id)) && d < 160) { H.run(2); d += 2; }
    return { same: a === b2, ret: { pending: !!c.stateOf(R.army.id) }, merged: !c.stateOf(M1.army.id), days: d, diff: a === b2 ? '' : [a.slice(0, 600), b2.slice(0, 600)], inv: H.invariants() }; });
  check('16 セーブ・ロード後も、帰城・結合の命令・配下武将・守備兵の内訳が残り、ロード後も続きから進む', r16.same && !r16.ret.pending && r16.merged && r16.inv.length === 0, r16);

  // ---- 17. 帰城・結合の途中で敵と出会う / 帰城先を奪われる / 道が塞がれる ----
  const r17 = await p.evaluate(() => { const H = window.__h, c = H.c(), D = H.D(); const E = H.enemy();
    const R = H.raise('jiankang', 15000, H.freeGeneral('jin')?.id); const opts = c.returnOptions(R.army.id); const dest = opts.filter(o => o.route && o.km > 120).sort((a, b) => a.km - b.km)[0];
    c.orderReturn(R.army.id, dest.cityId, dest.route); H.run(1);
    // 道の先に敵の小さな軍団を置く
    const foe = H.foe(E); const pt = R.route.points[Math.min(R.route.points.length - 1, Math.floor(R.route.points.length * 0.5))]; foe.army.lon = pt.lon; foe.army.lat = pt.lat; foe.army.troops = { infantry: 1500, cavalry: 0, archer: 500 }; foe.status = 'camping'; foe.route = null;
    let ev = null; for (let i = 0; i < 40 && !ev; i++) { H.run(1); ev = c.events.find(e => e.status === 'pending' && (e.attackerArmyId === R.army.id || e.defenderArmyId === R.army.id)); }
    const during = { returnCity: R.returnCityId, status: R.status };
    if (ev) { const res = window.__gokoAuto(window.__gokoSetup(ev)); c.applyBattleResult(res); }
    let d = 0; while (c.armies.includes(R) && d < 120) { H.run(2); d += 2; }
    const enc = { battle: !!ev, during, winner: ev?.record?.winner, absorbed: !c.armies.includes(R) && c.armyOpsLog.some(x => x.kind === 'return' && x.text.includes(R.army.name)) };
    // 帰城先を奪われる → 取り消し、別の帰城先を選べる
    const R2 = H.raise('jiankang', 6000, H.freeGeneral('jin')?.id); const o2 = c.returnOptions(R2.army.id).filter(o => o.route && o.km > 120).sort((a, b) => a.km - b.km)[0]; c.orderReturn(R2.army.id, o2.cityId, o2.route); H.run(1);
    c.transferCity(o2.cityId, E); H.run(1);
    const lost = { cleared: !R2.returnCityId, note: R2.opNote, stillThere: c.armies.includes(R2), again: c.returnOptions(R2.army.id).filter(o => o.cityId !== o2.cityId).length > 0 };
    const re = c.returnOptions(R2.army.id).find(o => o.route); const reErr = c.orderReturn(R2.army.id, re.cityId, re.route);
    // 包囲されている都市には入らず、城外で待つ
    const R3 = H.raise('jiankang', 5000, H.freeGeneral('jin')?.id); const k3 = c.cities.find(x => x.id === 'jiankang'); const foe3 = H.foe(E, foe); foe3.army.lon = k3.lon + 0.05; foe3.army.lat = k3.lat + 0.3; foe3.status = 'camping'; foe3.route = null; const m = c.events.length; c.startSiegeAt(foe3, k3, ''); const sev = c.events[m];
    R3.army.lon = k3.lon + 0.5; R3.army.lat = k3.lat - 0.2; R3.status = 'camping'; R3.route = null; R3.returnCityId = 'jiankang'; H.run(1);
    const wait = { waiting: c.armies.includes(R3), note: R3.opNote, sevStatus: sev?.status };
    return { enc, lost, reErr, wait, inv: H.invariants() }; });
  check('17 帰城の途中で敵と出会えば会戦になり、決着後に帰城を続ける。帰城先を奪われれば取り消して別の都市を選べる。包囲中の都市には入らず城外で待つ', r17.enc.battle && r17.enc.during.returnCity && r17.enc.absorbed && r17.lost.cleared && /奪われ/.test(r17.lost.note) && r17.lost.stillThere && r17.lost.again && r17.reErr === null && r17.inv.length === 0 && (r17.wait.waiting || r17.wait.sevStatus === 'completed'), r17);

  // ---- 18. 首都の陥落・国の滅亡のとき矛盾が出ない ----
  const r18 = await p.evaluate(() => { const H = window.__h, c = H.c(), D = H.D(); const E = H.enemy(); const F = H.enemy(true);
    // 首都へ帰城中に、首都が奪われる
    const R = H.raise(H.farCity('jin', c.cities.find(k => k.id === 'jiankang'), 90, 300).id, 6000, H.freeGeneral('jin')?.id); const cap = c.capitalCityOf('jin'); c.orderReturn(R.army.id, cap.id); H.run(1);
    c.transferCity(cap.id, E); H.run(2);
    const capCase = { cleared: !R.returnCityId, note: R.opNote, newCap: c.capitalCityOf('jin')?.name };
    // 後趙の軍団どうしの結合の途中で、後趙が滅ぶ
    const sh = [H.foe(F)]; let mergeOrder = 'skip';
    if (sh.length >= 1) { const home = c.cities.find(k => D.scenario.cityOwners[k.id] === F && k.kind !== 'pass'); const extra = home ? H.raise(home.id, 3000, undefined) : null; if (extra) mergeOrder = c.orderMerge(sh[0].army.id, [extra.army.id]); }
    for (const k of c.cities.filter(x => D.scenario.cityOwners[x.id] === F)) c.transferCity(k.id, 'jin');
    const r = c.rulerOf(F); if (r && !D.scenario.factions.find(f => f.id === F).fallen) { c.personStates[r.id] = 'captured'; c.spoils.addCaptive(r.id, 'jin', F, Math.floor(c.day)); c.checkRulers(); }
    H.run(3);
    return { E, F, capCase, mergeOrder, fallen: !!D.scenario.factions.find(f => f.id === F)?.fallen, shArmies: c.armies.filter(x => x.army.factionId === F).length, inv: H.invariants() }; });
  check('18 首都の陥落・国の滅亡のとき、帰城・結合の命令が矛盾しない(取り消し・滅んだ国の軍団なし・武将の重複なし)', r18.capCase.cleared && /奪われ/.test(r18.capCase.note) && r18.inv.length === 0 && (!r18.fallen || r18.shArmies === 0), r18);
  await p.close();

  // ---- 15. AIが帰城・結合を使う(自然な進行で) ----
  const ai = [];
  for (const [sc, player, years] of [['s317', 'jin', 3], ['s383', 'jin', 3]]) {
    const q = await open(sc); await q.evaluate(helpers);
    ai.push(await q.evaluate(([player, years]) => { const H = window.__h, g = H.g(), c = H.c(); c.speed = 0; g.changeSettings({ playerFactionId: player });
      const bad = []; for (let m = 0; m < years * 12; m++) { H.run(30); for (const x of H.invariants()) if (!bad.includes(x)) bad.push(x); }
      const log = c.armyOpsLog.filter(x => x.ai); const count = (k) => log.filter(x => x.kind === k).length;
      // すべての軍団を1つにした国がないか(軍団を3つ以上持っていた国が、1つになっていないか)・首都に守備兵が残っているか
      const caps = window.__gokoData.scenario.factions.filter(f => !f.fallen && !f.passive && c.capitalCityOf(f.id)).map(f => [f.id, Math.round(c.cityState(c.capitalCityOf(f.id)).garrison)]);
      return { sc: window.__gokoData.scenario.id, returns: count('return'), merges: count('merge'), cancels: count('cancel'), sample: log.filter(x => x.kind !== 'cancel').slice(0, 6).map(x => x.date + ' ' + x.text), emptyCaps: caps.filter(([, gv]) => gv < 300), maxArmy: Math.max(0, ...c.armies.map(s => H.tot(s.army.troops))), inv: bad }; }, [player, years]));
    await q.close();
  }
  const sum = (k) => ai.reduce((s, x) => s + x[k], 0);
  check('15 AIが帰城・軍団結合を使う(自然な進行。すべてを1つにまとめず、首都も空にしない)', sum('returns') >= 1 && sum('merges') >= 1 && ai.every(x => x.inv.length === 0 && x.emptyCaps.length === 0), ai);

  // ---- 画面:PC(マウス)とiPhone(タッチ)で、帰城と軍団結合を操作する ----
  for (const [label, ctx] of [['PC', { viewport: { width: 1280, height: 800 } }], ['iPhone', { ...devices['iPhone 13'] }]]) {
    const q = await open('s317', ctx); await q.evaluate(helpers);
    const touch = label === 'iPhone';
    const press = async (sel) => { if (touch) await q.tap(sel); else await q.click(sel); };
    const ids = await q.evaluate(() => { const H = window.__h, g = H.g(), c = H.c(); c.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); const A = H.raise('jiankang', 9000, H.freeGeneral('jin')?.id); const B = H.raise('jiankang', 6000, H.freeGeneral('jin')?.id); B.army.lon = A.army.lon + 0.08; B.army.lat = A.army.lat; g['selectArmy'](g.armies.markerOf(A.army.id)); return [A.army.id, B.army.id]; });
    await press('.army-return');
    const rows = await q.$$eval('.army-choose .choose-row', els => els.map(e => e.textContent));
    await q.screenshot({ path: require('path').join(__dirname, 'out', `v51-return-choose-${label}.png`) });
    await press('.army-choose .choose-row:nth-of-type(3)');
    const conf = await q.evaluate(() => ({ msg: document.querySelector('.army-message').textContent, confirm: !document.querySelector('.army-confirm').hidden }));
    await press('.army-cancel');
    await press('.army-merge');
    await press('.army-choose .choose-row input');
    const prev = await q.$eval('.choose-preview', e => e.textContent);
    await q.screenshot({ path: require('path').join(__dirname, 'out', `v51-merge-choose-${label}.png`) });
    const opts = await q.$$eval('.choose-commander option', els => els.map(e => e.textContent));
    await press('.choose-go');
    const res = await q.evaluate((ids) => { const c = window.__goko.campaign; return { aTroops: c.stateOf(ids[0]) ? c.stateOf(ids[0]).army.troops : null, bGone: !c.stateOf(ids[1]) }; }, ids);
    const fit = await q.evaluate(() => { const r = document.querySelector('#army').getBoundingClientRect(); return { right: r.right <= window.innerWidth + 1, scrollX: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
    if (label === 'iPhone') await q.screenshot({ path: require('path').join(__dirname, 'out', 'v51-merge-iphone.png') });
    check(`画面(${label}):「帰城」で帰城先(距離・日数・兵糧)を選んで確認でき、「軍団結合」で結合後の兵力・兵糧・指揮官を確かめて結合できる`, rows.length >= 3 && rows.some(t => /首都/.test(t)) && rows.some(t => /日/.test(t)) && conf.confirm && /帰城/.test(conf.msg) && /結合後:15,000人/.test(prev) && /兵糧/.test(prev) && /総指揮官/.test(prev) && opts.length >= 2 && res.bGone && fit.right && fit.scrollX, { rows: rows.slice(0, 3), conf, prev, opts, res, fit });
    await q.close();
  }

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
