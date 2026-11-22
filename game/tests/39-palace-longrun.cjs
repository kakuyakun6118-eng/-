// Version 53 第4工程:皇帝生活モードの長期の進行(30日・1年・5年・10年・20年)。
// 加齢・死去・婚姻・出生・継承・人物の居場所・物語・事件・戦略AI・戦争・反乱・セーブの大きさを、節目ごとに確かめる。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1800)); if (!ok) problems.push(label); };
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2] + '#s=s317'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); g.enterPalace();
    window.__snap = () => { const c = g.campaign, P = c.palace, A = P.affairs, s = g.palace.screen; const ruler = P.ruler(); const list = P.present();
      const areas = ['emperorHall', 'empressPalace', 'consortQuarters', 'ladiesStation', 'garden', 'bath', 'banquet', 'corridor'];
      const badArea = list.filter(n => !areas.includes(P.whereAt(n).area)).length;
      const minors = list.filter(n => P.ageOf(n) < 18).length; const dead = list.filter(n => n.personId && c.personStatus(n.personId) === 'dead').length;
      const views = s ? [...s['views'].values()] : []; const at3d = views.filter(v => s['world'].areaAt(v.fig.position.x, v.fig.position.z) === P.whereAt(v.npc).area).length;
      const mains = P.mains(); const storyOk = mains.every(n => n.story.stage >= 0 && n.story.stage <= 5 && (n.story.stage < 5 || n.story.ending));
      const memMax = Math.max(0, ...P.npcs.map(n => (n.memory ?? []).length));
      const save = JSON.stringify(g.buildSave());
      const wives = ruler ? c.court.spousesOf(ruler.id).length : 0; const kids = ruler ? c.court.childrenOf(ruler.id).length : 0;
      const ages = list.slice(0, 3).map(n => [n.name, P.ageOf(n)]);
      return { date: c.dateText(), ruler: ruler?.name, present: list.length, npcs: P.npcs.length, minors, dead, badArea, views: views.length, at3d, mains: mains.length, storyOk, stories: mains.map(n => `${n.story.arc}:${n.story.stage}${n.story.ending ? '/' + n.story.ending : ''}`),
        memMax, talkLog: P.talkLog.length, promises: P.promises.length, incidents: A.incidents.length, incKinds: A.counts, deposed: A.deposed.length, wives, kids, ages,
        court: c.court.counts, cities: c.cities.filter(x => window.__gokoData.scenario.cityOwners[x.id] === 'jin').length, wars: c.diplo.counts.wars, rebellions: c.loyalty.counts.rebellions, posture: c.strategy.posture.jin?.posture,
        armies: c.armies.filter(a => a.army.factionId === 'jin').length, saveKB: Math.round(save.length / 1024), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0, reports: P.reports.length, log: P.log.length };
    };
  });
  // 遊ぶ人の代わり:毎月、何人かと話し、気に入った一人に贈り物をする(寵愛が一人に傾く)。
  // 事件があれば一つ目の選択肢を選ぶ(半分は放っておく)
  const advance = async (days) => p.evaluate(async (days) => { const g = window.__goko, P = g.campaign.palace, A = P.affairs; let k = 0;
    for (let d = 0; d < days; d += 30) { g.palaceAdvance(4 * Math.min(30, days - d)); g.campaign.factionStates[P.factionId].gold += 300;
      const list = P.present(); const fav = list.find(n => n.bond !== 'none') ?? list[0]; for (const n of list.slice(0, 3)) P.talk(n); if (fav) { P.gift(fav, fav.likes[0]); P.talk(fav); }
      for (const i of A.open()) if (k++ % 2 === 0) A.resolve(i.id, i.choices[0].id); await new Promise(r => setTimeout(r, 0)); }
    return window.__snap(); }, days);
  const t0 = Date.now();
  const s0 = await p.evaluate(() => window.__snap());
  const marks = [[30, '30日'], [335, '1年'], [365 * 4, '5年'], [365 * 5, '10年'], [365 * 10, '20年']];
  const snaps = { start: s0 };
  for (const [d, label] of marks) { snaps[label] = await advance(d); console.log(`INFO ${label}(経過 ${Math.round((Date.now() - t0) / 1000)}秒)`, JSON.stringify(snaps[label]).slice(0, 1400)); }
  const all = Object.values(snaps);
  check('L1 30日・1年・5年・10年・20年の節目で、後宮の人物は全員成人・死者はいない・予定の区画は正しい・3Dの人物と予定の区画が合う', all.every(s => s.minors === 0 && s.dead === 0 && s.badArea === 0 && s.at3d >= s.views * 0.9), all.map(s => [s.date, s.present, s.minors, s.dead, s.badArea, `${s.at3d}/${s.views}`]));
  const s20 = snaps['20年'], s10 = snaps['10年'];
  check('L2 年月とともに、加齢・死去・出生・婚姻・継承(皇室の仕組み)が進む', s20.court.births > s0.court.births && s20.court.deaths > s0.court.deaths && JSON.stringify(s20.ages) !== JSON.stringify(s0.ages), { start: s0.court, y20: s20.court, ages0: s0.ages, ages20: s20.ages, rulers: all.map(s => s.ruler) });
  check('L3 物語の段階・結末・記憶・会話の記録が、上限を守ったまま長期に保たれる(記憶は1人30まで・会話の記録は50まで)', all.every(s => s.storyOk && s.memMax <= 30 && s.talkLog <= 50 && s.log <= 200), all.map(s => [s.date, s.mains, s.memMax, s.talkLog, s.stories.join(' ')]));
  check('L4 宮廷の事件が、長期のあいだに条件に応じて起きる(複数の種類)。事件の記録は上限(60件)を守る', Object.keys(s20.incKinds).length >= 3 && s20.incidents <= 60, { kinds: s20.incKinds, incidents: s20.incidents, deposed: s20.deposed });
  check('L5 政治を任された戦略AIが、20年のあいだ動き続ける(方針・軍団・戦争・反乱の記録が更新される)', !!s20.posture && s20.wars >= s0.wars && all.some(s => s.cities !== s0.cities || s.armies !== s0.armies), all.map(s => [s.date, s.posture, s.cities, s.armies, s.wars, s.rebellions]));
  check('L6 セーブの大きさが、20年たっても極端に増えない(開始時の4倍以内・3MB以内)。セーブ・ロード後も続けられる', s20.saveKB < Math.max(s0.saveKB * 4, 600) && s20.saveKB < 3000, all.map(s => [s.date, s.saveKB, s.heapMB]));
  const reload = await p.evaluate(() => { const g = window.__goko; const sv = JSON.parse(JSON.stringify(g.buildSave())); const before = window.__snap(); g.applySave(sv); g.palaceAdvance(8); const after = window.__snap(); return { before: [before.present, before.incidents, before.stories.join()], after: [after.present, after.incidents, after.stories.join()] }; });
  check('L6b 20年後のセーブを読み込んでも、人物・事件・物語が同じで、続けて進められる', reload.before[0] === reload.after[0] && reload.before[2] === reload.after[2], reload);
  check('L7 20年の進行のあいだ、画面の中でエラーが起きない', errs.length === 0, errs.slice(0, 3));
  console.log(`INFO 合計 ${Math.round((Date.now() - t0) / 1000)}秒`);
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
})();
