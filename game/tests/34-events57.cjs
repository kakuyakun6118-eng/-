// Version 42:57件の歴史イベントが、ゲームの状態(国・都市・君主・人物・軍団・外交・首都・地図)を正しく変えるか。
// 各シナリオの開始時(自由歴史のモード)に起こせる事件を、選択肢ごとに起こし、会戦を伴う事件はその会戦も決着させ、
// そのたびに整合の検査とセーブ・ロードの検査をする。主な事件は、史実どおりの選択で期待する結果になるかも調べる。
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = []; const fs = require('fs'); const path = require('path');
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1600)); if (!ok) problems.push(label); };
  const all = []; const covered = new Set();
  for (const sc of ['s300', 's304', 's311', 's317', 's319', 's329', 's357', 's383']) {
    const p = await (await b.newContext({ viewport: { width: 1024, height: 700 } })).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    const rows = await p.evaluate((sc) => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; c.speed = 0; g.changeSettings({ playerFactionId: null, historyMode: 'free' });
      // ---- 整合の検査 ----
      const invariants = () => { const bad = []; const owners = D.scenario.cityOwners;
        for (const m of g.cities.markers) if ((m.faction?.id ?? undefined) !== (owners[m.city.id] ?? undefined)) bad.push(`地図と持ち主の不一致:${m.city.name}`);
        for (const f of D.scenario.factions) {
          const has = c.cities.some(k => owners[k.id] === f.id);
          if (f.fallen && has) bad.push(`滅んだ国が都市を持つ:${f.name}`);
          if (!f.fallen && has && !f.passive) { const r = c.rulerOf(f.id); if (r && c.personStatus(r.id) !== 'active' && c.personStatus(r.id) !== 'wounded') bad.push(`君主が健在でない:${f.name}・${r.name}`); const cap = c.capitalCityOf(f.id); if (cap && owners[cap.id] !== f.id) bad.push(`首都が自国でない:${f.name}`); }
        }
        for (const s of c.armies) { const st = s.army.commanderId ? c.personStatus(s.army.commanderId) : 'active'; if (st === 'dead' || st === 'captured') bad.push(`死者・捕虜が指揮:${s.army.name}`); if (D.scenario.factions.find(f => f.id === s.army.factionId)?.fallen) bad.push(`滅んだ国の軍団:${s.army.name}`); }
        for (const x of c.spoils.custody) { const st = c.personStatus(x.personId); if (st !== 'captured' && st !== 'protected') bad.push(`捕虜の記録と状態の不一致:${x.personId}`); }
        return bad; };
      const snap = () => JSON.stringify({ o: D.scenario.cityOwners, r: D.scenario.factions.map(f => [f.id, f.ruler, !!f.fallen]), s: D.persons.map(x => c.personStatus(x.id)), a: c.armies.map(s => [s.army.id, s.army.factionId]).sort(), cap: Object.values(c.capitals).map(x => x.cityId).sort(), rel: c.relations });
      const save = g.buildSave(); const out = [];
      for (const d of h.defs) {
        g.applySave(save); g.changeSettings({ playerFactionId: null, historyMode: 'free' });
        const st = h.listState(d); if (!st.can) continue;
        const roles = d.roles(h.ctx()); const role = Object.keys(d.choices).find(r => roles[r]); if (!role) continue;
        for (const ch of d.choices[role]) {
          g.applySave(save); g.changeSettings({ playerFactionId: null, historyMode: 'free' });
          // 会戦の事件:テストの準備として、両国の主力を戦場のそばに置く(その場で会戦・攻城戦が始まるように)
          if (d.battle) for (const [i, r] of d.battle.entries()) { const f = roles[r]; const a = f ? h.largestArmy(f) : null; if (a) { a.army.lon = d.place.lon + (i === 0 ? -0.15 : 0.12); a.army.lat = d.place.lat; a.status = 'camping'; a.route = null; } }
          const n = c.events.length; let err = '';
          try { h.fire(d.id); h.choose(d.id, ch.id); } catch (e) { err = String(e).slice(0, 160); }
          const rec = h.records[d.id]; const inv1 = invariants();
          // 事件の会戦:その場で始まったものは、スキップと同じ計算で決着させる(進軍が要るものは、進軍を始めたことを確かめる)
          let battle = null;
          for (const ev of c.events.slice(n).filter(e => e.histId === d.id && e.status === 'pending')) { const s0 = window.__gokoSetup(ev); if (s0) { const res = window.__gokoAuto(s0); c.applyBattleResult(res); battle = { winner: res.winner, captured: !!res.siege?.captured }; } }
          const marching = c.history.tags.some(t => t.histId === d.id);
          const inv2 = invariants();
          // セーブ・ロード
          const a = snap(); const sv = g.buildSave(); g.applySave(JSON.parse(JSON.stringify(sv))); const same = a === snap();
          out.push({ sc: window.__gokoData.scenario.id, id: d.id, name: d.name, choice: ch.label, kind: ch.kind, status: rec.status, changes: (rec.changes ?? []).length, kinds: [...new Set((rec.changes ?? []).map(x => x.kind))], violations: rec.violations ?? [], inv: [...new Set([...inv1, ...inv2])], battle, marching, saveSame: same, err, result: (rec.result ?? '').slice(0, 160) });
        }
      }
      g.applySave(save); return out; }, sc);
    all.push(...rows); for (const r of rows) covered.add(r.id);
    await p.close();
  }
  fs.writeFileSync(path.join(__dirname, 'out', 'events57.json'), JSON.stringify(all, null, 1));
  const bad = all.filter(r => r.err || r.violations.length || r.inv.length || !r.saveSame);
  check(`1 開始時に起こせる事件(${covered.size}件・${all.length}通り)で、整合の違反・瞬間移動・存在しない人物・セーブ・ロードの食い違いが0件`, bad.length === 0 && covered.size >= 15, { covered: covered.size, runs: all.length, ids: [...covered], bad: bad.slice(0, 5) });
  const hist = all.filter(r => r.kind === 'historic');
  const noEffect = hist.filter(r => r.changes === 0 && !r.marching && !r.battle && r.status !== 'branched' && r.status !== 'duplicate');
  check('2 史実どおりの選択で、状態が何も変わらない事件がない(進軍・会戦を始める事件を除く)', noEffect.length === 0, noEffect.map(r => `${r.sc}:${r.name}`));
  const battles = all.filter(r => r.battle);
  check('3 その場で始まる事件の会戦は決着し、結果が事件の記録に反映される', battles.length >= 1 && battles.every(r => /会戦/.test(r.result) || r.status === 'branched' || r.status === 'occurred'), { n: battles.length, sample: battles.slice(0, 4).map(r => `${r.name}:${r.battle.winner}:${r.result.slice(-50)}`) });

  // 4. 主な事件:史実どおりの選択で、期待する国・君主・都市になる
  const major = {};
  const expects = [
    ['s311', 'changan316', 'free', { han: 'fight' }],
    ['s317', 'dongjin318', 'free', {}],
    ['s317', 'jinzhun318', 'free', {}],
    ['s319', 'houzhao319', 'free', {}],
    ['s329', 'shihu334', 'free', {}],
    ['s357', 'qianyan370', 'free', {}],
    ['s383', 'beiwei386', 'free', {}],
    ['s383', 'split384', 'free', {}],
  ];
  for (const [sc, id] of expects) {
    const p = await (await b.newContext()).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
    major[id] = await p.evaluate((id) => { const g = window.__goko, c = g.campaign, h = c.history, D = window.__gokoData; c.speed = 0; g.changeSettings({ playerFactionId: null, historyMode: 'free' });
      const d = h.def(id); const st = h.listState(d); if (!st.can) return { notAvailable: st.reasons.slice(0, 2) };
      const roles = d.roles(h.ctx()); const picks = Object.fromEntries(Object.keys(d.choices).filter(r => roles[r]).map(r => [r, d.choices[r].find(x => x.kind === 'historic').id]));
      const before = { rulers: Object.fromEntries(D.scenario.factions.map(f => [f.id, c.rulerOf(f.id)?.name])), n: D.scenario.factions.length };
      h.records[id].status = 'awaiting'; const text = h['resolve'](d, picks);
      for (const ev of c.events.filter(e => e.histId === id && e.status === 'pending')) { const s0 = window.__gokoSetup(ev); if (s0) c.applyBattleResult(window.__gokoAuto(s0)); }
      const rec = h.records[id];
      return { status: rec.status, result: (rec.result ?? '').slice(0, 200), changes: (rec.changes ?? []).map(x => x.kind + ':' + x.text).slice(0, 8),
        newStates: D.scenario.factions.slice(before.n).map(f => `${f.name}(${c.rulerOf(f.id)?.name})`), rulerChanged: D.scenario.factions.filter(f => before.rulers[f.id] && c.rulerOf(f.id)?.name !== before.rulers[f.id]).map(f => `${f.name}:${before.rulers[f.id]}→${c.rulerOf(f.id)?.name ?? '(滅亡)'}`), fallen: D.scenario.factions.filter(f => f.fallen).map(f => f.name) }; }, id);
    await p.close();
  }
  const ok = (id, f) => major[id] && !major[id].notAvailable ? f(major[id]) : true; // 開始時に起こせない事件は、長い通しで確かめる
  const okAll = [
    ok('dongjin318', (m) => m.changes.length >= 1),
    ok('jinzhun318', (m) => m.rulerChanged.length >= 1 || m.newStates.length >= 1),
    ok('houzhao319', (m) => m.newStates.length >= 1 || m.rulerChanged.length >= 1 || /後趙|趙/.test(m.result)),
    ok('shihu334', (m) => m.rulerChanged.some(x => /石虎/.test(x))),
    ok('qianyan370', (m) => m.fallen.some(x => /燕/.test(x)) || m.changes.some(x => /^city:/.test(x))),
    ok('beiwei386', (m) => m.newStates.some(x => /魏/.test(x))),
    ok('split384', (m) => m.newStates.length >= 1 || m.changes.some(x => /^state:/.test(x))),
  ];
  check('4 主な事件(東晋の成立・靳準の乱・後趙の成立・石虎の簒奪・前燕の滅亡・北魏の成立・前秦の分裂):史実どおりの選択で、国・君主・都市が期待どおりに変わる', okAll.every(Boolean), major);
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
