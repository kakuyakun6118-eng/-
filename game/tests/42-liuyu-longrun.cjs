// 時間の上限:3600秒
// 劉裕の北伐の長期の進行:409年開始+20年(と50年)、416年開始+20年、383年開始→430年。
// 死者の復活・人物の重複・都市の持ち主の食い違い・兵や財政の異常・メモリの増え方を、1年ごとに調べる。AIの遠征(南燕・後秦・関中)の成否も記録する。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 2000)); if (!ok) problems.push(label); };
  const report = {};
  const run = async (sc, years, label, marks = []) => {
    const p = await (await b.newContext({ viewport: { width: 1024, height: 700 } })).newPage();
    p.on('pageerror', e => errs.push(sc + ' ' + String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    const t0 = Date.now();
    await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla', historyMode: 'historic' }); c.speed = 0;
      window.__dead = new Set(); window.__bad = { revived: [], dup: 0, owners: [], troops: [], money: [] }; window.__heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      window.__year = () => { const bad = window.__bad; const ids = D.persons.map(x => x.id); if (ids.length !== new Set(ids).size) bad.dup++;
        for (const x of D.persons) { const st = c.personStatus(x.id); if (st === 'dead') window.__dead.add(x.id); else if (window.__dead.has(x.id)) bad.revived.push(`${c.dateText()} ${x.name}`); }
        const owners = D.scenario.cityOwners;
        for (const k of c.cities) { const f = D.scenario.factions.find(y => y.id === owners[k.id]); if (!f) bad.owners.push(`持ち主の無い都市:${k.name}`); else if (f.fallen) bad.owners.push(`滅んだ国の都市:${k.name}(${f.name})`); }
        for (const m of g.cities.markers) if ((m.faction?.id ?? undefined) !== (owners[m.city.id] ?? undefined)) bad.owners.push(`地図と持ち主の不一致:${m.city.name}`);
        for (const s of c.armies) { const t = s.army.troops; const n = t.infantry + t.cavalry + t.archer; if (!(n >= 0) || n > 250000 || [t.infantry, t.cavalry, t.archer, s.army.food, s.army.morale].some(v => !Number.isFinite(v) || v < 0)) bad.troops.push(`${s.army.name}:${n}`); }
        for (const k of c.cities) { const st = c.cityState(k); if (!Number.isFinite(st.garrison) || st.garrison < 0 || st.garrison > 400000) bad.troops.push(`${k.name}の守備兵:${st.garrison}`); }
        // 財政:金はゲームの決まりで借金(マイナス)になりうる(下限は毎月の支出の3倍。未払いの罰がある)。その下限を割る・数でない・極端に大きいものを異常とする
        for (const [f, s] of Object.entries(c.factionStates)) { const floor = -4.5 * (c.economy.report(f)?.expense?.total ?? 0) - 100; /* 下限は月ごとの支出で決まり、都市を失うと支出が減るので、1.5倍の幅を見る */ if (!Number.isFinite(s.gold) || !Number.isFinite(s.grain) || s.gold < floor || s.grain < 0 || s.gold > 5e6 || s.grain > 5e6) bad.money.push(`${f}:${Math.round(s.gold)}/${Math.round(s.grain)}(下限${Math.round(floor)})`); }
        for (const k of Object.keys(bad)) if (Array.isArray(bad[k]) && bad[k].length > 30) bad[k].length = 30; };
      window.__run = (days) => { const h = c.history; const d0 = c.day; let n = 0; let lastYear = c.calendar().year;
        while (c.day - d0 < days && n++ < 9000000) {
          if (c.gameOver) { const nx = D.scenario.factions.filter(f => !f.fallen && c.cities.some(k => D.scenario.cityOwners[k.id] === f.id))[0]; if (!nx) break; c.gameOver = false; g.changeSettings({ playerFactionId: nx.id }); }
          const aw = h.awaiting; if (aw) { const roles = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => roles[k] === c.playerFactionId) ?? Object.keys(aw.choices).find(k => roles[k]); h.choose(aw.id, h.aiPick(aw, roles, role)); }
          h.queue = h.queue.filter(q => q.mode === 'decide');
          if (c.speed === 0) { for (const ev of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(ev); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(ev.battleId, 'cancelled'); } for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true); c.speed = 8; }
          c.update(0.25);
          const y = c.calendar().year; if (y !== lastYear) { lastYear = y; window.__year(); } } };
      window.__snap = () => { const own = {}; for (const k of c.cities) { if (k.kind === 'pass') continue; const f = D.scenario.cityOwners[k.id]; own[f] = (own[f] || 0) + 1; }
        const fn = (f) => D.scenario.factions.find(x => x.id === f)?.name ?? f; const h = c.history;
        const ev = ['nanyan409', 'linqu409', 'guanggu410', 'luxun410', 'yaoxing416', 'beifa416', 'luoyang416', 'queyue417', 'changan417', 'muzhi417', 'guanzhong418', 'song420'].map(i => `${i}:${h.records[i]?.status}`);
        const ly = D.persons.find(x => x.id === 'liu_yu_song');
        const notes = (c.strategy.log ?? []).filter(l => /広固|洛陽|長安|統万|東莱|彭城|潼関/.test(l.text ?? '')).slice(-8).map(l => `${l.date} ${l.text}`.slice(0, 120));
        return { date: c.dateText(), owners: Object.entries(own).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([f, n]) => fn(f) + n).join(' '), key: ['guanggu', 'luoyang', 'changan', 'jiankang', 'shuofang', 'pingcheng'].map(k => `${k}=${fn(D.scenario.cityOwners[k])}`).join(' '),
          fallen: D.scenario.factions.filter(f => f.fallen).map(f => f.name).join(' '), liuyu: ly ? `${fn(ly.factionId)}・${c.personStatus(ly.id)}・${ly.role}` : 'なし', ev, song: h.flags.song_founded ? fn(h.flags.song_founded) : null,
          persons: D.persons.length, alive: D.persons.filter(x => c.personStatus(x.id) !== 'dead').length, armies: c.armies.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0, saveKB: Math.round(JSON.stringify(g.buildSave()).length / 1024),
          bad: window.__bad, notes, court: c.court.counts.debuts ?? 0 };
      };
    });
    const out = { start: await p.evaluate(() => window.__snap()) };
    let done = 0;
    for (const y of [...marks, years]) { await p.evaluate((d) => window.__run(d), (y - done) * 360); done = y; out[`${y}年`] = await p.evaluate(() => window.__snap()); console.log(`INFO ${label} +${y}年(${Math.round((Date.now() - t0) / 1000)}秒)`, JSON.stringify({ ...out[`${y}年`], bad: undefined, notes: undefined })); }
    out.sec = Math.round((Date.now() - t0) / 1000);
    report[label] = out;
    await p.close();
    return out;
  };
  const okRun = (r) => { const e = r[Object.keys(r).filter(k => /年$/.test(k)).pop()]; const bad = e.bad; return { pass: bad.revived.length === 0 && bad.dup === 0 && bad.owners.length === 0 && bad.troops.length === 0 && bad.money.length === 0, bad }; };

  const a = await run('s409', 50, '409年開始', [20]);
  const a20 = a['20年'], a50 = a['50年'];
  check('L1 409年開始+20年・+50年:死者の復活・人物の重複・都市の持ち主の食い違い・兵と財政の異常がない', okRun(a).pass, okRun(a).bad);
  check('L2 409年開始:劉裕の事件が、実際の情勢に応じて起きる・分岐する(未処理のまま残らない)', a20.ev.every(x => !/pending|awaiting/.test(x)), a20.ev);
  check('L3 409年開始:メモリが極端に増えない(50年で+400MB未満)・セーブは3MB未満', a50.heapMB - a.start.heapMB < 400 && a50.saveKB < 3000, { heap: [a.start.heapMB, a20.heapMB, a50.heapMB], save: [a.start.saveKB, a20.saveKB, a50.saveKB] });

  const c1 = await run('s416', 20, '416年開始');
  const c20 = c1['20年'];
  check('L4 416年開始+20年:死者の復活・人物の重複・都市の持ち主の食い違い・兵と財政の異常がない', okRun(c1).pass, okRun(c1).bad);
  check('L5 416年開始:第二次北伐・長安攻略・劉宋の建国などの事件が、情勢に応じて起きるか分岐する', c20.ev.slice(5).every(x => !/pending|awaiting/.test(x)), c20.ev);

  const d = await run('s383', 47, '383年開始→430年', [26]);
  const d47 = d['47年'];
  check('L6 383年開始→430年:死者の復活・人物の重複・都市の持ち主の食い違い・兵と財政の異常がない', okRun(d).pass, okRun(d).bad);
  check('L7 383年開始:途中から史実の人物が登場する(劉裕などの登場の表)', d['26年'].court > 10, { debuts: d['26年'].court, liuyu: d['26年'].liuyu });

  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'liuyu-longrun.json'), JSON.stringify(report, null, 1));
  check('L8 長期の進行のあいだ、画面の中でエラーが起きない', errs.length === 0, errs.slice(0, 3));
  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
})();
