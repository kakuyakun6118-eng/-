// 時間の上限:1800秒
// 仮想シナリオ「炎漢再興」Version 67:漢の正統・歴代皇帝の固有特性・皇帝の型・国家発展AI・歴代皇帝一覧。
// 漢の正統は、劉皓と直系の子孫が漢の正式な皇帝のときだけ、国に一度だけかかる(皇族の人数で重ならない・ほかの劉氏の国には付かない・
// 幼帝でも続く・血統でない者が君主になれば止まる)。効果は実際の計算(会戦・徴兵・兵糧・反乱・収入)に効く。
// 劉承などは台帳どおりの特性、自動で生まれた皇族は能力から型と3〜5の特性を得る。セーブ・ロードで変わらない。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1800)); if (!ok) problems.push(label); };
  const open = async (sc) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); p.on('pageerror', e => errs.push(sc + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    await p.evaluate(() => {
      window.__runDays = (days) => { const g = window.__goko, c = g.campaign, h = c.history; const d0 = c.day; let n = 0;
        while (c.day - d0 < days && n++ < 3e6) {
          if (c.gameOver) break;
          const aw = h.awaiting; if (aw) { const ro = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => ro[k] === c.playerFactionId) ?? Object.keys(aw.choices).find(k => ro[k]); h.choose(aw.id, role && ro[role] === c.playerFactionId ? aw.choices[role][0].id : h.aiPick(aw, ro, role)); }
          h.queue = h.queue.filter(q => q.mode === 'decide');
          for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); }
          for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping';
          if (c.spoils.pending) c.resolveCapture('preserve', true);
          c.speed = 8; c.update(0.25); } };
      // 国の補正をまとめて読む(上限つきの実際の値)
      window.__fx = (f) => { const c = window.__goko.campaign, V = window.__gokoVirtual; V.clearTraitCache(); const l = V.factionTraitEffects(f, Math.floor(c.day)); const inc = V.incomeMult(l);
        return { legit: l.filter(e => /漢の皇帝/.test(e.label)).length, battle: +V.factionMult(l, 'armyBattle', 1, 2).toFixed(3), con: +V.factionMult(l, 'conscript', 1, 1.6).toFixed(3), food: +V.factionMult(l, 'armyFood', 0.5, 1).toFixed(3), reb: +V.factionMult(l, 'rebellion', 0.2, 1).toFixed(3), growth: +V.factionMult(l, 'growth', 1, 2.5).toFixed(3), lm: V.factionFlat(l, 'loyaltyMonthly'), om: V.factionFlat(l, 'orderMonthly'), rec: +V.sumOf(l, 'recruit').toFixed(3), gold: +inc.gold.toFixed(3), amity: +V.prodOf(l, 'amity').toFixed(3) }; };
      // 徴兵:1,000人を集める金(同じ都市・同じ状態で比べる)
      window.__recruitCost = () => { const c = window.__goko.campaign, D = window.__gokoData; const k = c.cities.find(x => x.id === 'xiangyang'); const saved = JSON.parse(JSON.stringify(c.cityStates[k.id] ?? c.cityState(k))); const st = c.factionStates.chu; const g0 = st.gold, gr0 = st.grain;
        c.cityStates[k.id] = { ...c.cityState(k), garrison: 1000, order: 80, support: 80, recruitRecent: 0, recruitDay: undefined }; st.gold = 1e6; st.grain = 1e6; const r = c.recruit(k.id, 1000); const cost = 1e6 - st.gold; st.gold = g0; st.grain = gr0; c.cityStates[k.id] = saved; return { r, cost: Math.round(cost) }; };
    });
    return p; };

  // ---------- 1. 漢の正統:即位の前は無い。即位で国に1つだけ ----------
  let p = await open('s304v');
  const r1 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 0;
    const before = window.__fx('chu'); const costBefore = window.__recruitCost();
    const r = c.rulerOf('jin'); c.fallFaction('jin', r, 'chu'); window.__runDays(70);
    const after = window.__fx('chu'); const costAfter = window.__recruitCost();
    const royals = D.persons.filter(x => x.bloodline === 'xuandi' && x.factionId === 'chu' && c.personStatus(x.id) !== 'dead').length;
    const rec = c.court.emperors[0];
    return { before, after, costBefore, costAfter, royals, rank: c.court.rankOf('chu'), legit: c.court.isLegitEmperor('chu'), hanZhao: c.court.isLegitEmperor('han_zhao'), hanZhaoFx: window.__fx('han_zhao').legit, rec: rec && { type: rec.type, legit: rec.legit, traits: rec.traits, goals: rec.goals } }; });
  check('1 漢の正統:即位の前は無く、漢の皇帝に即位すると国に1つだけかかる(皇族が何人いても重ならない)。劉淵の漢には付かない',
    r1.before.legit === 0 && r1.after.legit === 1 && r1.royals >= 3 && r1.rank === 'emperor' && r1.legit && !r1.hanZhao && r1.hanZhaoFx === 0 && r1.rec?.legit === true, { before: r1.before.legit, after: r1.after.legit, royals: r1.royals, hz: r1.hanZhao });
  check('2 漢の正統の効果の値:全軍の戦闘力×1.3・徴兵の効率×1.25・兵糧の消費×0.75・反乱×0.5・皇族の伸び×1.5・忠誠と治安が毎月+2・登用+0.25・金の収入は上限の2倍まで・外交×1.3以上',
    r1.after.battle === 1.3 && r1.after.con === 1.25 && r1.after.food === 0.75 && r1.after.reb === 0.5 && r1.after.growth === 1.5 && r1.after.lm === 2 && r1.after.om === 2 && Math.abs(r1.after.rec - r1.before.rec - 0.25) < 0.001 && r1.after.gold <= 2 && r1.after.amity >= 1.3, { before: r1.before, after: r1.after });
  check('3 徴兵の効率が実際の計算に効く:同じ都市で1,000人を集める金が、即位のあと約0.8倍になる', r1.costBefore.r === null && r1.costAfter.r === null && Math.abs(r1.costAfter.cost / r1.costBefore.cost - 0.8) < 0.02, { before: r1.costBefore, after: r1.costAfter });
  check('4 劉皓は既存の8つの固有能力を保ち、型は覇王型、国家目標を持つ', r1.rec?.type === '覇王型' && r1.rec.traits.length === 8 && r1.rec.traits.includes('天命覇王') && r1.rec.goals.length >= 3, r1.rec);

  // ---------- 5. 会戦・兵糧・反乱に効く ----------
  const r5 = await p.evaluate(() => { const c = window.__goko.campaign, V = window.__gokoVirtual; V.clearTraitCache();
    const side = (f) => ({ role: 'attacker', kind: 'army', factionId: f, armyId: null, cityId: null, name: 't', commander: null, troops: { infantry: 1000, cavalry: 0, archer: 0 } });
    const chu = V.battleTraitMult(side('chu'), true, false, 'plain', false), jin = V.battleTraitMult(side('yue'), true, false, 'plain', false);
    // 兵糧:補給の届かない砂漠(西域)に置いた軍団の1日の消費を、漢の正統があるときと無いときで比べる(指揮官の能力は外す)
    const D = window.__gokoData; const a = c.armies.find(s => s.army.factionId === 'chu'); const keepA = { lon: a.army.lon, lat: a.army.lat, food: a.army.food, cmd: a.army.commanderId };
    const useOnce = () => { a.army.lon = 88.5; a.army.lat = 40.5; a.army.food = 50; a.army.commanderId = ''; c['dailyUpkeep'](a); return 50 - a.army.food; };
    V.clearTraitCache(); const usedLegit = useOnce();
    const ru = c.rulerOf('chu'); const other = D.persons.find(x => x.factionId === 'chu' && !x.bloodline && c.personStatus(x.id) === 'active' && x.role !== 'ruler'); ru.role = 'general'; other.role = 'ruler'; V.clearTraitCache();
    const usedPlain = useOnce(); other.role = 'general'; ru.role = 'ruler'; V.clearTraitCache();
    Object.assign(a.army, { lon: keepA.lon, lat: keepA.lat, food: keepA.food, commanderId: keepA.cmd });
    const used = { legit: +usedLegit.toFixed(3), plain: +usedPlain.toFixed(3) }; const st0 = a.status;
    const L = c.loyalty; const ret = window.__gokoData.persons.find(x => x.factionId === 'chu' && x.role !== 'ruler' && x.id.startsWith('vh_')); const keep = L.loyalty[ret.id]; L.loyalty[ret.id] = 20; const pr = L.unrestChance(ret); L.loyalty[ret.id] = keep;
    return { chu: chu.mult, yue: jin.mult, notes: chu.notes, used, status: st0, pr }; });
  check('5 実際の計算:漢の軍団は指揮官の能力がなくても会戦の強さ×1.3(ほかの国は×1)。補給の届かない所での兵糧の消費は0.75倍。反乱の見込みは下がる(上限の内側)',
    Math.abs(r5.chu - 1.3) < 0.001 && r5.yue === 1 && r5.used.plain > 0 && Math.abs(r5.used.legit / r5.used.plain - 0.75) < 0.03 && r5.pr >= 0 && r5.pr <= 0.5, r5);

  // ---------- 6. 劉承の即位:幼帝でも漢の正統が続き、台帳どおりの特性と型 ----------
  const r6 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
    c.court.kill('vh_liu_hao', 'illness', 'テスト'); window.__runDays(40);
    const ru = c.rulerOf('chu'); const rec = c.court.openReign('chu');
    return { ruler: ru.name, minor: c.court.isMinor(ru), regent: c.court.regentOf('chu')?.name ?? null, legit: c.court.isLegitEmperor('chu'), fx: window.__fx('chu'), type: rec?.type, label: rec?.typeLabel, traits: ru.traits, goals: rec?.goals, haoTitle: D.persons.find(x => x.id === 'vh_liu_hao').title }; });
  check('6 劉皓が亡くなると、幼い劉承が摂政つきで継ぎ、漢の正統は続く。劉承は守成型(万能型・守成の名君)で、帝王之器・文武隆盛・万民帰心と既存の仁政・皇統継承を持つ',
    r6.ruler === '劉承' && r6.minor && !!r6.regent && r6.legit && r6.fx.legit === 1 && r6.type === '守成型' && ['帝王之器', '文武隆盛', '万民帰心', '仁政', '皇統継承'].every(t => r6.traits.includes(t)) && r6.traits.length === 5 && r6.goals.length >= 3 && r6.haoTitle === '漢太祖宣武皇帝', r6);

  // ---------- 7. 血統でない者が君主になると止まる ----------
  const r7 = await p.evaluate(() => { const c = window.__goko.campaign, D = window.__gokoData;
    const ru = c.rulerOf('chu'); const other = D.persons.find(x => x.factionId === 'chu' && !x.bloodline && c.personStatus(x.id) === 'active' && x.role !== 'ruler');
    ru.role = 'general'; other.role = 'ruler'; const off = { legit: c.court.isLegitEmperor('chu'), fx: window.__fx('chu').legit };
    other.role = 'general'; ru.role = 'ruler'; const back = { legit: c.court.isLegitEmperor('chu'), fx: window.__fx('chu').legit };
    return { off, back, other: other.name }; });
  check('7 劉皓の直系でない者(家臣)が君主になると、漢の正統の補正は止まる。皇族に戻れば、また効く', !r7.off.legit && r7.off.fx === 0 && r7.back.legit && r7.back.fx === 1, r7);

  // ---------- 8. 自動で生まれた皇族:能力から型と3〜5の特性。何度でも同じで、セーブ・ロードで変わらない ----------
  const r8 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
    const mk = (id, st, traits) => { const q = { id, name: '劉試' + id.slice(-1), reading: '', gender: 'male', born: 330, died: null, factionId: 'chu', role: 'general', bloodline: 'xuandi', virtual: true, fictional: true, traits: [...traits], bio: '', title: '', leadership: st[0], war: st[1], intelligence: st[2], politics: st[3], charisma: st[4] }; D.persons.push(q); return q; };
    const a = mk('test_emp_a', [118, 119, 80, 70, 95], ['武神']), bq = mk('test_emp_b', [70, 60, 95, 119, 100], []), cq = mk('test_emp_c', [112, 110, 115, 113, 116], ['帝王之器']);
    const out = {};
    for (const q of [a, bq, cq]) { const t = c.court.assignEmperorTraits('chu', q); out[q.id] = { type: t.type, traits: [...q.traits] }; }
    // 2回目は同じ(決めた特性を使う)
    const again = c.court.assignEmperorTraits('chu', a); out.again = { type: again.type, traits: [...a.traits] };
    const sv = JSON.parse(JSON.stringify(g.buildSave())); a.traits = ['なにか']; g.applySave(sv);
    out.reload = [...(D.persons.find(x => x.id === 'test_emp_a')?.traits ?? [])];
    const TYPES = ['覇王型', '武帝型', '仁君型', '明君型', '賢帝型', '智帝型', '富国型', '中興型', '守成型'];
    out.ok = [a, bq, cq].every(q => TYPES.includes(out[q.id].type) && out[q.id].traits.length >= 3 && out[q.id].traits.length <= 5);
    return out; });
  check('8 自動で生まれた皇族:能力・特性から型が決まり(武の高い者は覇王型・武帝型、政治の高い者は富国型・仁君型など)、固有特性は3〜5。2回目も同じで、セーブ・ロードで変わらない',
    r8.ok && ['覇王型', '武帝型'].includes(r8.test_emp_a.type) && ['富国型', '仁君型', '賢帝型'].includes(r8.test_emp_b.type) && JSON.stringify(r8.again.traits) === JSON.stringify(r8.test_emp_a.traits) && JSON.stringify(r8.reload) === JSON.stringify(r8.test_emp_a.traits), r8);

  // ---------- 9. 国家発展AI:戦争がなくても「外交」で止まらず、国家目標で動く。届かない戦争は数えない ----------
  const r9 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData;
    const P = c.strategy.factionPersonality('chu'); const goals = c.strategy.hanGoals('chu');
    for (const f of D.scenario.factions) if (f.id !== 'chu' && c.atWar('chu', f.id)) c.setRelation('chu', f.id, 'peace');
    c.setRelation('chu', 'silla', 'war');
    window.__runDays(70);
    const post = c.strategy.posture.chu;
    return { pers: P.label, aggr: P.aggr, goals, posture: post?.posture, reason: post?.reason, reach: c.strategy.reachable('chu', 'silla', { reachKm: 300 }) }; });
  check('9 漢の皇帝の国は、型と特性で性格が決まり、国家目標で方針を決める(「外交で勢力を保つ」で止まらない)。海の向こうの新羅との戦争は「届かない戦争」として数えない',
    /型/.test(r9.pers) && r9.goals.length >= 3 && r9.posture !== 'diplomacy' && r9.reach === false, r9);

  // ---------- 10. 歴代皇帝一覧:型・能力・特性・漢の正統・国家目標・国力の増減・評価と、詳細(補正の実際の値) ----------
  const r10 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; g.changeSettings({ playerFactionId: 'chu' }); document.querySelector('#court-open').click();
    const heads = [...document.querySelectorAll('#court .court-emperors th')].map(x => x.textContent);
    const btn = [...document.querySelectorAll('#court .court-emperors button')].find(x => /劉承/.test(x.textContent)); btn?.click();
    const detail = document.querySelector('#court .court-emperor-detail')?.textContent ?? '';
    const first = c.court.emperors[0];
    return { heads, detail: detail.slice(0, 400), first: { score: first.score, grade: first.grade, pop: [first.popStart, first.popEnd], gold: [first.goldStart, first.goldEnd], troops: [first.troopsStart, first.troopsEnd] } }; });
  const need = ['型', '能力', '固有特性', '漢の正統', '国家目標', '領土', '人口', '財政(金)', '兵力', '征服・遠征', '属国化', '内政・外交', '評価'];
  check('10 歴代皇帝一覧に型・能力・固有特性・漢の正統・国家目標・領土・人口・財政・兵力・征服と遠征・属国化・内政外交・評価が並び、名前を押すと特性の説明と実際の補正の値が出る。崩御した劉皓には評価と国力の増減が付く',
    need.every(h => r10.heads.includes(h)) && /漢の正統/.test(r10.detail) && /全軍の戦闘力×1\.\d+/.test(r10.detail) && /万民帰心/.test(r10.detail) && typeof r10.first.score === 'number' && !!r10.first.grade && r10.first.pop.every(x => typeof x === 'number'), r10);

  // ---------- 11. Version 65 の形のセーブ(皇帝の型・特性・失った都市の記録が無い) ----------
  const r11 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const sv = JSON.parse(JSON.stringify(g.buildSave()));
    const cs = sv.campaign.court; for (const k of ['emperorTraits', 'emperorTypes', 'lostCities']) delete cs[k]; for (const r of cs.emperors) for (const k of ['type', 'typeLabel', 'traits', 'legit', 'stats', 'goals', 'popStart', 'popEnd', 'goldStart', 'goldEnd', 'troopsStart', 'troopsEnd', 'conquered', 'vassalsStart', 'vassalized', 'expeditions', 'score', 'grade']) delete r[k];
    let err = ''; try { g.applySave(sv); window.__runDays(40); } catch (e) { err = String(e).slice(0, 200); }
    return { err, legit: c.court.isLegitEmperor('chu'), n: c.court.emperors.length }; });
  check('11 Version 65 の形のセーブ(型・特性・国力の記録が無い)を読み込んでもエラーなく続き、漢の正統も効く', !r11.err && r11.legit && r11.n >= 2, r11);
  await p.close();

  // ---------- 12. 史実のシナリオには影響しない ----------
  p = await open('s304');
  const r12 = await p.evaluate(() => { const c = window.__goko.campaign, V = window.__gokoVirtual; V.clearTraitCache();
    return { fx: V.factionTraitEffects('jin', Math.floor(c.day)).length, legit: c.court.isLegitEmperor('jin'), mult: V.battleTraitMult({ role: 'attacker', kind: 'army', factionId: 'jin', armyId: null, cityId: null, name: 't', commander: null, troops: { infantry: 1000, cavalry: 0, archer: 0 } }, true, false, 'plain', false).mult }; });
  check('12 史実のシナリオでは、漢の正統・国の補正はかからない(会戦の倍率は1)', r12.fx === 0 && !r12.legit && r12.mult === 1, r12);
  await p.close();

  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length || errs.length) { console.log('失敗:', problems.join(' / ')); process.exit(1); }
})();
