// 時間の上限:1800秒
// 仮想シナリオ「炎漢再興」Version 65:皇統の継承と漢皇帝の即位。
// 西晋があるうちは即位できない/316年でない年の西晋の滅亡でも「漢室再興の詔」が起こる(朝廷の滅亡・司馬氏の皇統の断絶)/
// 劉皓が亡くなると皇族(劉承)が継ぐ(家臣は継がない)・幼い皇太子は摂政つきで継ぐ/即位の前に亡くなれば皇帝の記録を作らない/
// 生まれる条件のない子孫は出てこない/宣帝の血統の上限120と能力の受け継ぎ/歴代皇帝一覧と家系図が合う/Version 64 のセーブ互換。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1800)); if (!ok) problems.push(label); };
  const open = async (sc) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); p.on('pageerror', e => errs.push(sc + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => {
      // AIだけで日を進める(事件はプレイヤーの国なら最初の選択肢=史実の道、それ以外はAIが選ぶ)
      window.__runDays = (days) => { const g = window.__goko, c = g.campaign, h = c.history; const d0 = c.day; let n = 0;
        while (c.day - d0 < days && n++ < 3e6) {
          if (c.gameOver) break;
          const aw = h.awaiting; if (aw) { const ro = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => ro[k] === c.playerFactionId) ?? Object.keys(aw.choices).find(k => ro[k]); h.choose(aw.id, role && ro[role] === c.playerFactionId ? aw.choices[role][0].id : h.aiPick(aw, ro, role)); }
          h.queue = h.queue.filter(q => q.mode === 'decide');
          for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); }
          for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping';
          if (c.spoils.pending) c.resolveCapture('preserve', true);
          c.speed = 8; c.update(0.25); } };
      window.__fallJin = () => { const c = window.__goko.campaign; const r = c.rulerOf('jin'); if (r) c.fallFaction('jin', r, 'chu'); };
    });
    return p; };

  // ---------- 1. 西晋があるうちは即位できない ----------
  let p = await open('s304v');
  const r1 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; g.changeSettings({ playerFactionId: 'chu' }); c.speed = 0;
    for (const id of ['luoyang', 'changan', 'fengyi', 'hongnong', 'xuchang', 'xingyang', 'runan', 'shouchun', 'hefei', 'changsha', 'shangyong']) if (D.scenario.cityOwners[id] !== 'chu') { c.transferCity(id, 'chu'); g.setCityOwner(id, 'chu'); }
    c.loyalty.fame.vh_liu_hao = 100;
    const e = h.listState(h.def('vh_emperor')), d = h.listState(h.def('vh_edict'));
    window.__runDays(70);
    return { emperor: [e.can, e.reasons.join('')], edict: [d.can, d.reasons.join('')], after: [h.records.vh_edict?.status, h.records.vh_emperor?.status], name: D.scenario.factions.find(x => x.id === 'chu').name, rank: c.court.rankOf('chu'), jin: !D.scenario.factions.find(x => x.id === 'jin').fallen }; });
  check('1 西晋があるうちは、洛陽・長安と15都市を持っても「漢室再興の詔」も「漢皇帝即位」も起こらない(楚王のまま)',
    !r1.emperor[0] && /西晋/.test(r1.emperor[1]) && !r1.edict[0] && /西晋/.test(r1.edict[1]) && r1.after.every(s => s !== 'occurred') && r1.name === '楚' && r1.rank !== 'emperor', r1);

  // ---------- 2. 司馬氏の皇統の断絶(316年でない年)で詔が出せる ----------
  const r2 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData;
    const r = c.rulerOf('jin'); const other = D.persons.find(x => x.factionId === 'jin' && x.role !== 'ruler' && !x.name.startsWith('司馬') && c.personStatus(x.id) === 'active');
    r.role = 'general'; other.role = 'ruler';
    const st = h.listState(h.def('vh_edict'));
    other.role = 'general'; r.role = 'ruler'; // もとに戻す
    const back = h.listState(h.def('vh_edict'));
    return { can: st.can, why: st.reasons, other: other.name, back: back.can }; });
  check('2 西晋の君主が司馬氏でなくなる(皇統の断絶)と、年に関係なく「漢室再興の詔」の条件がそろう。司馬氏に戻ると、またそろわない', r2.can && !r2.back, r2);

  // ---------- 3. 西晋の滅亡(304年)→ 詔 → 即位がAIの進行で起こる ----------
  const r3 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData;
    window.__fallJin();
    window.__runDays(70);
    const rec = c.court.emperors[0];
    return { year: c.calendar().year, edict: h.records.vh_edict?.status, emperor: h.records.vh_emperor?.status, name: D.scenario.factions.find(x => x.id === 'chu').name, rank: c.court.rankOf('chu'), rec: rec && { gen: rec.gen, name: rec.name, era: rec.era, acc: rec.accYear, heir: rec.heir, empress: rec.empress },
      title: D.persons.find(x => x.id === 'vh_liu_hao').title, heir: c.court.heirOf('chu')?.name, heirTitle: D.persons.find(x => x.id === 'vh_liu_cheng')?.title, era: c.court.eraText('chu'), palace: g.enterPalace() }; });
  check('3 西晋が304年に滅びると(316年に限らない)、「漢室再興の詔」→「漢皇帝即位」が起こる。国号は漢、劉皓は「漢皇帝」、元号は建武、皇太子は劉承、皇后は謝蓉。皇帝生活に入れる',
    r3.edict === 'occurred' && r3.emperor === 'occurred' && r3.year < 316 && r3.name === '漢' && r3.rank === 'emperor' && r3.rec?.gen === 1 && r3.rec.name === '劉皓' && r3.rec.era === '建武' && r3.title === '漢皇帝' && r3.heir === '劉承' && r3.heirTitle === '皇太子' && r3.rec.empress === '謝蓉' && /^建武/.test(r3.era) && r3.palace === null, r3);

  // ---------- 4. 劉皓の崩御:幼い皇太子 劉承が摂政つきで継ぎ、廟号・諡号が付く ----------
  const r4 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
    g.exitPalace?.();
    c.court.kill('vh_liu_hao', 'illness', 'テスト:劉皓の崩御');
    window.__runDays(40);
    const ru = c.rulerOf('chu'); const recs = c.court.emperors;
    return { ruler: ru?.name, age: c.court.age(ru), minor: c.court.isMinor(ru), regent: c.court.regentOf('chu')?.name ?? null, rulerTitle: ru?.title, haoTitle: D.persons.find(x => x.id === 'vh_liu_hao').title,
      recs: recs.map(r => ({ gen: r.gen, name: r.name, era: r.era, temple: r.templeName, post: r.posthumous, end: r.endReason, succ: r.successor, died: r.died })), name: D.scenario.factions.find(x => x.id === 'chu').name, rank: c.court.rankOf('chu') }; });
  check('4 劉皓が亡くなると、家臣ではなく皇太子の劉承(幼少)が摂政つきで継ぐ。劉皓の在位は「太祖・宣武皇帝」(称号「漢太祖宣武皇帝」)で閉じ、劉承が第2代(元号 永平)。国号・皇帝の位はそのまま',
    r4.ruler === '劉承' && r4.minor && !!r4.regent && r4.haoTitle === '漢太祖宣武皇帝' && r4.recs.length === 2 && r4.recs[0].temple === '太祖' && r4.recs[0].post === '宣武皇帝' && r4.recs[0].end === '崩御' && r4.recs[0].succ === '劉承' && r4.recs[1].gen === 2 && r4.recs[1].name === '劉承' && r4.recs[1].era === '永平' && r4.rulerTitle === '漢皇帝' && r4.name === '漢' && r4.rank === 'emperor', r4);

  // ---------- 5. セーブ・ロードで歴代皇帝の記録と称号が残る。Version 64 の形のセーブ ----------
  const r5 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
    const sv = JSON.parse(JSON.stringify(g.buildSave()));
    g.applySave(JSON.parse(JSON.stringify(sv)));
    const kept = { n: c.court.emperors.length, hao: D.persons.find(x => x.id === 'vh_liu_hao').title, ruler: c.rulerOf('chu')?.title };
    // Version 64 の形:記録・称号・戦績の集計と、詔の事件の記録がない
    const old = JSON.parse(JSON.stringify(sv)); const cs = old.campaign.court ?? old.court;
    const strip = (o) => { if (!o || typeof o !== 'object') return; for (const k of ['emperors', 'titles', 'tally']) delete o[k]; for (const v of Object.values(o)) if (v && typeof v === 'object') strip(v); };
    strip(old.campaign); delete old.campaign.history.records.vh_edict;
    let err = ''; try { g.applySave(old); window.__runDays(40); } catch (e) { err = String(e).slice(0, 200); }
    const recs = c.court.emperors;
    return { kept, err, recs: recs.map(r => [r.gen, r.name, r.endYear, r.achievements.join('・').slice(0, 60)]), rulerTitle: c.rulerOf('chu')?.title }; });
  check('5 セーブ・ロードで歴代皇帝の記録と称号(漢太祖宣武皇帝・漢皇帝)が残る。記録のない Version 64 の形のセーブも、エラーなく続き、いまの皇帝から記録を始める',
    r5.kept.n === 2 && r5.kept.hao === '漢太祖宣武皇帝' && r5.kept.ruler === '漢皇帝' && !r5.err && r5.recs.length === 1 && r5.recs[0][1] === '劉承' && r5.recs[0][2] === null && r5.rulerTitle === '漢皇帝', r5);
  await p.close();

  // ---------- 6. 即位の前に劉皓が亡くなる:皇族が継ぎ、皇帝の記録は作らない。母の亡い子は生まれない ----------
  p = await open('s304v');
  const r6 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    const at0 = ['vh_liu_cheng', 'vh_liu_wei', 'vh_liu_rui', 'vh_liu_ying', 'vh_liu_hong', 'vh_han_yao'].map(id => [id, !!D.persons.find(x => x.id === id)]);
    c.court.kill('vh_xie_rong', 'illness', 'テスト:楚王后が早く亡くなった場合');
    c.court.kill('vh_liu_hao', 'battle', 'テスト:劉皓が即位の前に亡くなった場合');
    window.__runDays(30);
    const ru = c.rulerOf('chu');
    const after1 = { ruler: ru?.name, bloodline: ru?.bloodline, minor: c.court.isMinor(ru), regent: c.court.regentOf('chu')?.name ?? null, emperors: c.court.emperors.length, hao: D.persons.find(x => x.id === 'vh_liu_hao').title };
    window.__runDays(360 * 3);
    const born = ['vh_liu_rui', 'vh_liu_ying'].filter(id => D.persons.some(x => x.id === id));
    return { at0, after1, born, emperors: c.court.emperors.length, retainerRuler: !!c.rulerOf('chu') && !c.rulerOf('chu').bloodline }; });
  // 韓瑤(302年生)は家臣 韓玄策の娘で、皇族ではないため開始時にいてよい(劉弘の母になるのは、劉承と結婚したときだけ)
  check('6 開始時にいる皇族の子は劉承・劉威だけ(劉睿・劉瑛・劉弘はまだいない)。即位の前に劉皓が亡くなると、劉氏の皇族(劉承)が摂政つきで継ぎ、家臣は継がない。皇帝の記録は作らない。母(謝蓉)が亡くなれば劉睿・劉瑛は生まれない',
    r6.at0.filter(x => x[1] && x[0] !== 'vh_han_yao').map(x => x[0]).join() === 'vh_liu_cheng,vh_liu_wei' && r6.after1.ruler === '劉承' && r6.after1.bloodline === 'xuandi' && r6.after1.minor && !!r6.after1.regent && r6.after1.emperors === 0 && r6.after1.hao !== '漢太祖宣武皇帝' && r6.born.length === 0 && r6.emperors === 0 && !r6.retainerRuler, r6);
  await p.close();

  // ---------- 7. 宣帝の血統:上限120・能力の受け継ぎ・型 ----------
  p = await open('s304v');
  const r7 = await p.evaluate(() => { const D = window.__gokoData, B = window.__gokoBlood; const P = (id) => D.persons.find(x => x.id === id);
    const fa = P('vh_liu_hao'), mo = P('vh_xie_rong'); const K = ['leadership', 'war', 'intelligence', 'politics', 'charisma'];
    const N = 400; let over = 0, under = 0, prod = 0, hasHao = 0, sum = 0, big = 0; const types = {}; let maxTraits = 0, typeTraitOk = 0;
    for (let i = 0; i < N; i++) { const r = B.inheritXuandi(fa, mo, (k) => mo[k], 'test|' + i); const v = K.map(k => r.stats[k]); const t = v.reduce((a, b) => a + b, 0);
      if (v.some(x => x > 120)) over++; if (v.some(x => x < 40)) under++; if (r.prodigy) prod++; if (r.traits.some(x => B.LIU_HAO_TRAITS.includes(x))) hasHao++; sum += t; if (t >= 500) big++;
      types[r.type] = (types[r.type] ?? 0) + 1; maxTraits = Math.max(maxTraits, r.traits.length); if (r.traits.some(x => B.TYPE_TRAITS[r.type].includes(x))) typeTraitOk++; }
    return { over, under, prod, hasHao, avg: Math.round(sum / N), big, types, maxTraits, typeTraitOk, N }; });
  check('7 宣帝の血統の子(劉皓と謝蓉の子を400人ぶん試算):能力は40〜120に収まる(上限120)。合計は平均500前後、500以上が多い。劉皓の固有能力の一部を受け継ぐ子が多い(全員ではない。劉皓の直接の子のため)。神童(劉皓並み)が数%。4つの型があり、型の能力を1つ持つ。能力は4つまで',
    r7.over === 0 && r7.under === 0 && r7.avg >= 480 && r7.big >= r7.N * 0.4 && r7.hasHao > 0 && r7.hasHao < r7.N * 0.95 && r7.prod > 0 && r7.prod < r7.N * 0.15 && Object.keys(r7.types).length === 4 && r7.typeTraitOk === r7.N && r7.maxTraits <= 4, r7);
  await p.close();

  // ---------- 8. 史実のシナリオには影響しない ----------
  p = await open('s304');
  const r8 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; c.speed = 0;
    return { virtual: !!D.scenario.virtual, edict: !!c.history.def('vh_edict') && c.history.listState(c.history.def('vh_edict')).state, vh: D.persons.filter(x => x.id.startsWith('vh_')).length, emperors: c.court.emperors.length }; });
  check('8 史実のシナリオ(304年)には、仮想の人物・詔の事件・歴代皇帝の記録が出ない', !r8.virtual && r8.vh === 0 && r8.emperors === 0 && (r8.edict === false || r8.edict === 'hidden' || r8.edict === 'other'), r8);
  await p.close();

  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length || errs.length) { console.log('失敗:', problems.join(' / ')); process.exit(1); }
})();
