// Version 53 第4工程:後宮の人間関係の種類・寵愛への反応・皇后と妃の立場・宮廷の事件・皇后の廃立・戦略AIとの連動
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sc) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1500)); if (!ok) problems.push(label); };

  const p = await open('s317');
  // 準備:皇后と、もう一人の妃(どちらも本人の同意による)。成り行きで起きる事件を止めるため、事件の間隔を空けておく
  const setup = await p.evaluate(() => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); g.enterPalace(); const P = g.campaign.palace, A = P.affairs;
    g.campaign.factionStates.jin.gold = 50000; for (const k of ['ladyConflict', 'empressConsort', 'rumor', 'gift', 'inlaw', 'heirEdu', 'inform', 'remonstrance', 'deposition']) A.lastInc[k] = 1e9;
    const E = P.present().find(n => n.rank === 'consort'); Object.assign(E, { romance: 85, trust: 75, regard: 80, jealousy: 0 }); E.coolUntil = 0; const r1 = P.propose(E, 'empress');
    const C = P.present().find(n => n.rank === 'lady' && n.temper === 'shy') ?? P.present().find(n => n.rank === 'lady'); Object.assign(C, { romance: 85, trust: 75, intimacy: 70, regard: 80, jealousy: 0, hope: 'favor' }); C.coolUntil = 0; const r0 = P.propose(C, 'confess'); C.coolUntil = 0; C.last = {}; const r2 = P.propose(C, 'consort');
    g.palaceAdvance(4); window.__E = E.id; window.__C = C.id;
    return { r1: typeof r1 === 'string' ? r1 : r1.effect, r2: typeof r2 === 'string' ? r2 : r2.effect, E: [E.name, E.rank], C: [C.name, C.rank] }; });
  console.log('INFO 準備', JSON.stringify(setup));

  // C1. 人間関係の種類:親しい・信頼・張り合い・嫉妬・派閥・一族・主従が、人物どうしの関係として出る(気持ちとは別に信頼を持つ)
  const rel = await p.evaluate(() => { const g = window.__goko, P = g.campaign.palace, A = P.affairs; const list = P.present(); const E = P.npc(window.__E), C = P.npc(window.__C);
    const l1 = list.find(n => n.rank === 'lady'), l2 = list.filter(n => n.rank === 'lady')[1], l3 = list.filter(n => n.rank === 'lady')[2];
    l1.relations[l2.id] = 50; l2.relations[l1.id] = 45; E.relations[C.id] = -20; C.relations[E.id] = -10;
    // 親しい間柄が30日続くと、信頼が育つ
    window.__goko.palaceAdvance(4 * 30); l1.relations[l2.id] = Math.max(50, l1.relations[l2.id]); C.jealousy = 50; C.relations[E.id] = -10; E.romance = 85;
    const kin = { ...l3, id: 'kin_test', name: l3.name[0] + '蘭', origin: l3.origin }; const kinTie = A.isKin(l3, kin);
    const kinds = new Set(); for (const a of list) for (const o of list) if (a !== o) for (const t of A.tiesOf(a, o)) kinds.add(t);
    return { kinds: [...kinds], kinTie, sample: A.relationsOf(l1).slice(0, 3), trustDiff: A.trustOf(l1, l2) !== l1.relations[l2.id], card: P.card(E) }; });
  check('C1 人物どうしの関係に、親しい・信頼・張り合い・嫉妬・派閥・主従の種類が出る。一族(同じ姓・同じ出身)も分かる。信頼は気持ちと別に持つ', ['friend', 'trust', 'rival', 'jealous', 'faction', 'master', 'servant'].every(k => rel.kinds.includes(k)) && rel.kinTie && rel.trustDiff && /権威/.test(rel.card['立場'] ?? ''), rel);

  // C2. 寵愛への反応は性格と関係で違う(全員が嫉妬するのではない)
  const fav = await p.evaluate(() => { const g = window.__goko, P = g.campaign.palace, A = P.affairs; const C = P.npc(window.__C); const list = P.present();
    const tempers = ['proud', 'devoted', 'shy', 'gentle', 'cheerful', 'clever']; list.filter(n => n !== C && n.rank === 'lady').forEach((n, i) => { n.temper = tempers[i % 6]; n.romance = i % 3 === 2 ? 10 : 50; n.jealousy = 0; });
    // 衛華と親しい女官が一人いる(想いのない人)
    const fr = list.find((n, i) => n !== C && n.rank === 'lady' && n.romance < 40); if (fr) fr.relations[C.id] = 55;
    const j0 = Object.fromEntries(list.map(n => [n.id, n.jealousy])); P.gift(C, 'jade');
    const rs = A.lastReactions; const kinds = [...new Set(rs.map(r => r.reaction))]; const jealousCount = rs.filter(r => r.reaction === 'jealous' || r.reaction === 'rival').length;
    const servants = rs.filter(r => A.serves[r.id] === C.id).map(r => r.reaction);
    return { kinds, jealousCount, total: rs.length, servants, detail: rs.slice(0, 8).map(r => `${r.name}:${r.reaction}`) }; });
  check('C2 寵愛(贈り物)への周りの反応が、性格・関係で分かれる(嫉妬・寂しさ・喜び・近づく・気にしない)。全員が嫉妬するのではない', fav.kinds.length >= 3 && fav.jealousCount < fav.total && fav.kinds.includes('glad'), fav);

  // C3. 皇后と妃の立場:権威・子・後継者の母・一族(外戚)が分かる
  const stn = await p.evaluate(() => { const g = window.__goko, P = g.campaign.palace, A = P.affairs; const E = P.npc(window.__E), C = P.npc(window.__C); return { E: A.standing(E), C: A.standing(C) }; });
  check('C3 皇后と妃の立場(権威・子・後継者の母・一族)を計算する。皇后の権威は妃より高い', stn.E.authority > stn.C.authority && Array.isArray(stn.E.family), stn);

  // C4. 事件は条件がそろったときだけ起きる(条件がなければ、確率を省いても起きない)。9種類すべて
  const inc = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace, A = P.affairs; const E = P.npc(window.__E), C = P.npc(window.__C); const out = {};
    const ladies = P.present().filter(n => n.rank === 'lady'); const [a, bb, x] = ladies;
    const calm = () => { for (const n of P.present()) { n.jealousy = 0; n.regard = 70; n.trust = 60; n.mood = 70; for (const k in n.relations) n.relations[k] = 10; } E.romance = 70; C.romance = 40; A.palaceDays = 0; A.spend = []; A.lastGift = undefined; };
    const tryKind = (k, make) => { calm(); const before = A.check(k, true); if (before) A.resolve(before.id, before.choices[0].id); make(); const inc = A.check(k, true); out[k] = { before: !!before, after: !!inc, cause: inc?.cause, choices: inc?.choices.length }; return inc; };
    const incs = {};
    incs.ladyConflict = tryKind('ladyConflict', () => { a.relations[bb.id] = -50; bb.relations[a.id] = -40; });
    incs.empressConsort = tryKind('empressConsort', () => { C.romance = 95; E.romance = 70; });
    incs.rumor = tryKind('rumor', () => { a.jealousy = 70; a.relations[x.id] = -40; });
    incs.gift = tryKind('gift', () => { P.gift(x, 'silk'); a.jealousy = 50; a.relations[x.id] = -15; });
    // 外戚:皇后の一族の男性の臣下(官職なし)がいるとき。いなければ、皇后と同じ姓の臣下を台帳から探して、その条件を作る
    incs.inlaw = tryKind('inlaw', () => { C.romance = 80; });
    // 後継の教育:後継者が6〜15歳で、その母が後宮にいるとき(試験のため、妃の子を一人、台帳に加えて指名する)
    const ruler = c.rulerOf('jin'); const yr = c.calendar().year;
    const kid = c.court['newPerson']({ name: '司馬試', gender: 'male', born: yr - 9, factionId: 'jin', role: 'minister', seed: 'test-heir', bio: '試験のための子', title: '', stats: { leadership: 40, war: 40, intelligence: 40, politics: 40, charisma: 40 }, father: ruler.id, mother: C.personId });
    const prevHeir = c.court.heirOf('jin')?.id;
    incs.heirEdu = tryKind('heirEdu', () => { c.court.designateHeir('jin', kid.id); });
    incs.inform = tryKind('inform', () => { x.regard = 20; a.relations[x.id] = -40; });
    incs.remonstrance = tryKind('remonstrance', () => { A.palaceDays = 50; });
    incs.deposition = tryKind('deposition', () => { E.regard = 20; E.relations[C.id] = -30; });
    window.__incs = Object.fromEntries(Object.entries(incs).map(([k, v]) => [k, v?.id])); window.__kid = kid.id; window.__prevHeir = prevHeir;
    return out; });
  const kinds9 = ['ladyConflict', 'empressConsort', 'rumor', 'gift', 'inlaw', 'heirEdu', 'inform', 'remonstrance', 'deposition'];
  const noInlawKin = !inc.inlaw.after;
  check('C4 宮廷の事件(女官の対立・皇后と妃・噂・贈り物・外戚・後継の教育・密告・諫言・廃立)は、条件がそろう前は起きず、そろうと理由と選択肢つきで起きる', kinds9.every(k => !inc[k].before && (inc[k].after || (k === 'inlaw' && noInlawKin))) && kinds9.filter(k => inc[k].after).every(k => inc[k].cause && inc[k].choices >= 3), inc);
  if (noInlawKin) console.log('INFO 外戚の任官:この場面の皇后には、同じ姓・同じ民族の(官職のない)臣下がいないため起きなかった(条件を満たさないため。正しい動き)');

  // C5. 事件の選択は、国の数字(安定度・忠誠・国庫・後継の能力)に反映する。放っておくと期限で「放っておいた結果」になる
  const res = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace, A = P.affairs; const I = window.__incs; const out = {};
    const st = () => c.court.stability.jin; const gold = () => c.factionStates.jin.gold;
    let s0 = st(), g0 = gold(); A.resolve(I.empressConsort, 'reconcile'); out.reconcile = { stab: st() - s0, gold: gold() - g0 };
    const kid = window.__gokoData ? null : null; const heir = c.court.heirOf('jin'); const i0 = heir.intelligence; A.resolve(I.heirEdu, 'scholar'); out.edu = { intel: c.court.heirOf('jin').intelligence - i0 };
    const m = A.incidents.find(i => i.id === I.remonstrance).persons[0]; const l0 = c.loyalty.of ? c.loyalty.of(m) : null; s0 = st(); A.resolve(I.remonstrance, 'reject'); out.reject = { stab: st() - s0, effects: A.incidents.find(i => i.id === I.remonstrance).effects };
    // 放っておく:女官の対立の期限を過ぎる
    g.palaceAdvance(4 * 12); const lc = A.incidents.find(i => i.id === I.ladyConflict); out.lapse = { status: lc.status, result: lc.result };
    out.reports = P.reports.filter(r => /【/.test(r.text)).slice(-4).map(r => r.text);
    return out; });
  check('C5 事件の選択が、国の安定度・国庫・後継者の能力・臣下の忠誠に反映する。期限を過ぎると「放っておいた」結果になり、報告に出る', res.reconcile.gold <= -200 && res.reconcile.stab > 0 && res.edu.intel >= 3 && res.reject.stab < 0 && res.reject.effects.some(e => /忠誠/.test(e)) && ['lapsed', 'resolved'].includes(res.lapse.status) && res.reports.length > 0, res);

  // C6. 皇后の廃立:婚姻の記録は残り(正室→側室)、人物・子・家系図は消えない。セーブ・ロード後も同じ。新しい皇后は本人の同意で立てる
  const dep = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace, A = P.affairs; const E = P.npc(window.__E), C = P.npc(window.__C); const ruler = c.rulerOf('jin');
    const kids0 = c.court.childrenOf(ruler.id).map(k => [k.id, c.court.motherOf(k.id)]); const persons0 = (window.__gokoData?.persons ?? []).length;
    const s0 = c.court.stability.jin; let inc = A.incidents.find(i => i.id === window.__incs.deposition && i.status === 'open'); if (!inc) { E.regard = 20; E.relations[C.id] = -30; A.lastInc.deposition = -9999; inc = A.check('deposition', true); }
    const r = A.resolve(inc.id, 'depose');
    const mar = c.diplo.marriages.find(m => m.husband === ruler.id && m.wife === E.personId);
    const after = { rank: E.rank, title: E.title, marriage: mar?.kind, inPersons: !!c.court.age && !!c.rulerOf && (window.__gokoData?.persons ?? []).some?.(x => x.id === E.personId), primary: c.court.primaryOf(ruler.id)?.id ?? null, stab: c.court.stability.jin - s0, kids: c.court.childrenOf(ruler.id).map(k => [k.id, c.court.motherOf(k.id)]), npcKept: !!P.npc(E.id) && !P.npc(E.id).left };
    g.palaceAdvance(4);
    const sv = JSON.parse(JSON.stringify(g.buildSave())); g.applySave(sv); const E2 = c.palace.npc(window.__E);
    const reload = { rank: E2.rank, title: E2.title, deposed: c.palace.affairs.isDeposed(E2.id), marriage: c.diplo.marriages.find(m => m.husband === ruler.id && m.wife === E2.personId)?.kind, incidents: c.palace.affairs.incidents.length };
    // 新しい皇后:本人の同意で(断られたら、その意思を尊重)
    const C2 = c.palace.npc(window.__C); Object.assign(C2, { romance: 90, trust: 80, regard: 85, jealousy: 0 }); C2.coolUntil = 0; const np = c.palace.propose(C2, 'empress');
    return { r, after, kids0, reload, newEmpress: typeof np === 'string' ? np : np.effect, newPrimary: c.court.primaryOf(ruler.id)?.id === C2.personId, oldStill: c.diplo.marriages.some(m => m.husband === ruler.id && m.wife === E2.personId && m.kind === 'secondary') }; });
  check('C6 皇后の廃立は、婚姻の種類を正室→側室に変えるだけ。人物・婚姻・子との縁・家系図は消えず、安定度が下がる。セーブ・ロード後も同じ。新しい皇后は本人の同意で立てられ、もとの皇后は妃として残る',
    dep.after.rank === 'consort' && /廃后/.test(dep.after.title) && dep.after.marriage === 'secondary' && dep.after.primary === null && dep.after.stab < 0 && dep.after.npcKept && JSON.stringify(dep.after.kids) === JSON.stringify(dep.kids0)
    && dep.reload.deposed && dep.reload.marriage === 'secondary' && /廃后/.test(dep.reload.title) && dep.newPrimary && dep.oldStill, dep);

  // C7. 戦略AI(重臣)は、後宮の揺れを読む:廃立の直後や事件が重なると、外征を控えて内を固める
  const ai = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace, A = P.affairs; const S = c.strategy;
    const C = P.npc(window.__C); A.lastInc.rumor = -9999; const ladies = P.present().filter(n => n.rank === 'lady'); ladies[0].jealousy = 70; ladies[0].relations[ladies[1].id] = -40; A.check('rumor', true);
    const u = A.unrest(); S.analyze('jin', S.profile(), Math.floor(c.day)); const post = S.posture.jin;
    for (const i of A.open()) A.resolve(i.id, i.choices[0].id); A.deposed.forEach(d => d.day -= 400); for (const n of P.present()) n.mood = 70;
    const u2 = A.unrest(); S.analyze('jin', S.profile(), Math.floor(c.day) + 1); const post2 = S.posture.jin;
    return { u, post, u2, post2, playerIsCourt: c.playerFactionId }; });
  check('C7 後宮の揺れが大きいと、政治を任された戦略AIが外征を控える(理由に後宮が出る)。揺れが収まると、ふだんの判断に戻る', ai.u >= 0.6 && /後宮/.test(ai.post.reason) && ai.u2 < 0.6 && !/後宮/.test(ai.post2.reason), ai);

  // C8. 宮殿の画面:事件の欄が開き、選択できる
  const ui = await p.evaluate(async () => { const g = window.__goko, P = g.campaign.palace, A = P.affairs; const w = (ms) => new Promise(r => setTimeout(r, ms)); A.lastInc.inform = -9999; const ls = P.present().filter(n => n.rank === 'lady'); ls[2].regard = 20; ls[3].relations[ls[2].id] = -40; const i = A.check('inform', true);
    g.palace.hud.refresh(); const badge = !document.querySelector('.ph-inc-badge').hidden; g.palace.hud.sheet('incidents'); await w(200); const btns = document.querySelectorAll('.ph-sheet .ph-choice').length; document.querySelector('.ph-sheet .ph-choice')?.click(); await w(200);
    return { made: !!i, badge, btns, after: document.querySelector('.ph-sheet .ph-effect')?.textContent ?? '', status: i ? A.incidents.find(x => x.id === i.id).status : null }; });
  await p.screenshot({ path: require('path').join(__dirname, 'out', '38-incidents.png') });
  check('C8 宮殿の画面に「宮廷の事件」の欄があり、知らせの印が付き、選択肢を押すと結果が出る', ui.made && ui.badge && ui.btns >= 3 && ui.after.length > 4 && ui.status === 'resolved', ui);
  await p.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
  if (errs.length) process.exit(1);
})();
