// 時間の上限:3600秒
// 仮想シナリオ「炎漢再興」の長期の進行(AIだけ):20年・50年・100年。死者の復活・人物の重複・都市の持ち主の食い違い・兵と財政の異常・
// メモリを調べ、劉皓の国(楚→漢)の天下統一の成功・失敗の例(乱数の種を変えた3回と、劉皓が早く亡くなる場合)を記録する。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const errs = []; const problems = []; const report = {};
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 2000)); if (!ok) problems.push(label); };
  const run = async (label, years, marks, opt = {}) => {
    const p = await (await b.newContext({ viewport: { width: 1024, height: 700 } })).newPage(); p.on('pageerror', e => errs.push(label + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=s304v'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    const t0 = Date.now();
    await p.evaluate((opt) => { const g = window.__goko, c = g.campaign, D = window.__gokoData; if (opt.seed) window.__gokoSeed(opt.seed); g.changeSettings({ playerFactionId: 'silla', historyMode: 'normal' }); c.speed = 0;
      window.__dead = new Set(); window.__bad = { revived: [], dup: 0, owners: [], troops: [], money: [], stats: [] }; window.__first = {};
      window.__year = () => { const bad = window.__bad; const ids = D.persons.map(x => x.id); if (ids.length !== new Set(ids).size) bad.dup++;
        for (const x of D.persons) { const st = c.personStatus(x.id); if (st === 'dead') window.__dead.add(x.id); else if (window.__dead.has(x.id)) bad.revived.push(`${c.dateText()} ${x.name}`); }
        const owners = D.scenario.cityOwners;
        for (const k of c.cities) { const f = D.scenario.factions.find(y => y.id === owners[k.id]); if (!f) bad.owners.push(`持ち主の無い都市:${k.name}`); else if (f.fallen) bad.owners.push(`滅んだ国の都市:${k.name}`); }
        for (const m of g.cities.markers) if ((m.faction?.id ?? undefined) !== (owners[m.city.id] ?? undefined)) bad.owners.push(`地図と持ち主の不一致:${m.city.name}`);
        for (const s of c.armies) { const t = s.army.troops; const n = t.infantry + t.cavalry + t.archer; if (!(n >= 0) || n > 300000 || [t.infantry, t.cavalry, t.archer, s.army.food, s.army.morale].some(v => !Number.isFinite(v) || v < 0)) bad.troops.push(`${s.army.name}:${n}`); }
        for (const k of c.cities) { const st = c.cityState(k); if (!Number.isFinite(st.garrison) || st.garrison < 0 || st.garrison > 400000) bad.troops.push(`${k.name}:${st.garrison}`); }
        for (const [f, s] of Object.entries(c.factionStates)) { const floor = -4.5 * (c.economy.report(f)?.expense?.total ?? 0) - 500; /* 借金の下限は月ごとの支出で決まり、都市を失うと支出が減るので、幅を見る */ const cap = Math.max(5e6, (D.scenario.startTreasury?.[f]?.grain ?? 0) * 2); if (!Number.isFinite(s.gold) || !Number.isFinite(s.grain) || s.gold < floor || s.grain < 0 || s.gold > 5e6 || s.grain > cap) bad.money.push(`${f}:${Math.round(s.gold)}/${Math.round(s.grain)}`); }
        for (const x of D.persons) for (const k of ['leadership', 'war', 'intelligence', 'politics', 'charisma']) if (!(x[k] >= 1 && x[k] <= (x.virtual ? 120 : 100))) bad.stats.push(`${x.name}:${k}=${x[k]}`);
        const h = c.history; for (const id of ['vh_emperor', 'vh_unify']) if (!window.__first[id] && ['occurred', 'branched'].includes(h.records[id]?.status) && h.records[id].date) window.__first[id] = h.records[id].date;
        for (const k of Object.keys(bad)) if (Array.isArray(bad[k]) && bad[k].length > 30) bad[k].length = 30; };
      window.__run = (days) => { const h = c.history; const d0 = c.day; let n = 0; let ly = c.calendar().year; while (c.day - d0 < days && n++ < 9e6) {
        if (c.gameOver) { const nx = D.scenario.factions.filter(f => !f.fallen && c.cities.some(k => D.scenario.cityOwners[k.id] === f.id))[0]; if (!nx) break; c.gameOver = false; g.changeSettings({ playerFactionId: nx.id }); }
        const aw = h.awaiting; if (aw) { const ro = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => ro[k] === c.playerFactionId) ?? Object.keys(aw.choices).find(k => ro[k]); h.choose(aw.id, h.aiPick(aw, ro, role)); }
        h.queue = h.queue.filter(q => q.mode === 'decide');
        if (c.speed === 0) { for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
        c.update(0.25); const y = c.calendar().year; if (y !== ly) { ly = y; window.__year(); } } };
      if (opt.killHao) { window.__run(opt.killHao * 360); c.court.kill('vh_liu_hao', 'battle', 'テスト:劉皓が早く亡くなった場合'); }
      window.__snap = () => { const own = {}; for (const k of c.cities) { if (k.kind === 'pass') continue; const f = D.scenario.cityOwners[k.id]; own[f] = (own[f] || 0) + 1; }
        const fn = (f) => D.scenario.factions.find(x => x.id === f)?.name ?? f; const h = c.history; const hao = D.persons.find(x => x.id === 'vh_liu_hao');
        const core = c.cities.filter(k => k.kind !== 'pass' && k.lon >= 96 && !['wandu', 'pyongyang', 'hanseong', 'geumseong', 'tuyuhunting'].includes(k.id));
        return { date: c.dateText(), chuName: fn('chu'), chuCities: own.chu ?? 0, core: `${core.filter(k => D.scenario.cityOwners[k.id] === 'chu').length}/${core.length}`, chuFallen: !!D.scenario.factions.find(f => f.id === 'chu')?.fallen, ruler: c.rulerOf('chu')?.name ?? null, rank: c.court.rankOf('chu'),
          hao: hao ? `${c.personStatus(hao.id)}・${hao.role}` : '', top: Object.entries(own).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => fn(f) + n).join(' '), ev: h.defs.filter(d => d.id.startsWith('vh_')).map(d => `${d.id.slice(3)}:${h.records[d.id].status}`).join(' '),
          first: { ...window.__first }, fallen: D.scenario.factions.filter(f => f.fallen).length, persons: D.persons.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0, saveKB: Math.round(JSON.stringify(g.buildSave()).length / 1024), bad: window.__bad,
          news: c.news.filter(n => /対抗|臣従|降|英傑帰心|仮想/.test(String(n.text ?? n))).slice(-4).map(n => String(n.text ?? n).slice(0, 80)) }; };
    }, opt);
    const out = { start: await p.evaluate(() => window.__snap()) }; let done = 0;
    for (const y of [...marks, years]) { await p.evaluate((d) => window.__run(d), (y - done) * 360); done = y; out[`${y}年`] = await p.evaluate(() => window.__snap()); console.log(`INFO ${label} +${y}年(${Math.round((Date.now() - t0) / 1000)}秒)`, JSON.stringify({ ...out[`${y}年`], bad: undefined })); }
    report[label] = out; await p.close(); return out;
  };
  const clean = (r) => { const e = r[Object.keys(r).filter(k => /年$/.test(k)).pop()].bad; return { ok: e.revived.length === 0 && e.dup === 0 && e.owners.length === 0 && e.troops.length === 0 && e.money.length === 0 && e.stats.length === 0, e }; };

  const main = await run('炎漢再興・100年', 100, [20, 50]);
  check('V1 20年・50年・100年:死者の復活・人物の重複・都市の持ち主の食い違い・兵と財政の異常・能力値の範囲外(架空の人物は120まで)がない', clean(main).ok, clean(main).e);
  check('V2 100年でメモリが極端に増えず(+400MB未満)、セーブは3MB未満', main['100年'].heapMB - main.start.heapMB < 400 && main['100年'].saveKB < 3000, { heap: [main.start.heapMB, main['20年'].heapMB, main['50年'].heapMB, main['100年'].heapMB], save: [main.start.saveKB, main['100年'].saveKB] });
  check('V3 専用の事件は、未処理(選択待ち)のまま残らない', !/awaiting/.test(main['100年'].ev), main['100年'].ev);
  const seeds = [];
  for (const seed of ['han-a', 'han-b', 'han-c']) { const r = await run(`種 ${seed}・30年`, 30, [], { seed }); seeds.push({ seed, unify: r['30年'].first.vh_unify ?? null, emperor: r['30年'].first.vh_emperor ?? null, name: r['30年'].chuName, core: r['30年'].core, fallen: r['30年'].chuFallen }); }
  const early = await run('劉皓が306年に亡くなる・30年', 28, [], { killHao: 2 });
  check('V4 劉皓のAIの天下統一:乱数の種を変えた3回の結果と、劉皓が早く亡くなった場合を記録する(成功・失敗のどちらもありうる)。どの場合も整合の異常がない',
    [early].every(r => clean(r).ok) && seeds.length === 3, { seeds, early: { ruler: early['28年'].ruler, name: early['28年'].chuName, core: early['28年'].core, unify: early['28年'].first.vh_unify ?? null, fallen: early['28年'].chuFallen, bad: clean(early).e } });
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'virtual-longrun.json'), JSON.stringify({ report, seeds }, null, 1));
  check('V5 長期の進行のあいだ、画面の中でエラーが起きない', errs.length === 0, errs.slice(0, 3));
  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
})();
