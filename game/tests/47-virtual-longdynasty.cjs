// 時間の上限:7200秒
// 仮想シナリオ「炎漢再興」Version 65:漢(劉皓の国)の長い王朝。AIだけで300年進め、100年・200年・300年の時点で調べる。
// ・宣帝の血統の皇族がいるあいだ、家臣が君主にならない(はっきりした簒奪・反乱・国の滅亡は除く)
// ・歴代皇帝一覧と家系図が合う(代の番号・後継・在位の順・皇帝が劉皓の子孫であること)
// ・血統の能力は120を超えない、死者の復活・人物の重複がない
// 王朝が何年続いたか(滅びた年)は結果として記録する(乱数で変わるので、合否には使わない)。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 2400)); if (!ok) problems.push(label); };
  const p = await (await b.newContext({ viewport: { width: 1024, height: 700 } })).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2] + '#s=s304v'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.changeSettings({ playerFactionId: 'silla' }); c.speed = 8;
    window.__w = { usurp: [], dead: new Set(), fell: null, months: 0 };
    window.__step = (days) => { const h = c.history; const d0 = c.day; let lastM = -1;
      while (c.day - d0 < days) {
        if (c.gameOver) { const nx = D.scenario.factions.filter(f => !f.fallen && f.id !== 'chu' && c.cities.some(k => D.scenario.cityOwners[k.id] === f.id))[0]; if (!nx) break; c.gameOver = false; g.changeSettings({ playerFactionId: nx.id }); }
        const aw = h.awaiting; if (aw) { const ro = aw.roles(h.ctx()); const role = Object.keys(aw.choices).find(k => ro[k]); h.choose(aw.id, h.aiPick(aw, ro, role)); } h.queue = [];
        for (const e of c.events.filter(e => e.status === 'pending')) { const st = window.__gokoSetup(e); if (st) c.applyBattleResult(window.__gokoAuto(st)); else c.setEventStatus(e.battleId, 'cancelled'); }
        for (const s of c.armies) if (s.status === 'fighting' && !c.openEventOfArmy(s.army.id)) s.status = 'camping'; if (c.spoils.pending) c.resolveCapture('preserve', true);
        c.speed = 8; c.update(0.25);
        const m = Math.floor(c.day / 30); if (m === lastM) continue; lastM = m; window.__w.months++;
        // 毎月:漢(楚)の君主が血統でないのに、同じ国に血統の皇族がいれば記録する
        const W = window.__w;
        if (!W.fell && (c.isFallen('chu') || D.scenario.factions.find(f => f.id === 'chu').fallen)) W.fell = c.dateText();
        const r = c.rulerOf('chu');
        if (r && !r.bloodline) { const roy = D.persons.filter(x => x.bloodline === 'xuandi' && x.factionId === 'chu' && c.personStatus(x.id) === 'active' && !c.spoils.custodyOf(x.id)); if (roy.length && W.usurp.length < 20) W.usurp.push(c.dateText() + ' ' + r.name + ' 皇族' + roy.length + '人'); }
        for (const x of D.persons) { if (c.personStatus(x.id) === 'dead') W.dead.add(x.id); }
      } };
    window.__snap = () => { const W = window.__w, ct = c.court, recs = ct.emperors.filter(r => r.factionId === 'chu');
      const P = (id) => D.persons.find(x => x.id === id);
      const descends = (id) => { let cur = id, n = 0; while (cur && n++ < 40) { if (cur === 'vh_liu_hao') return true; cur = ct.fatherOf(cur); } return false; };
      const issues = [];
      recs.forEach((r, i) => { if (r.gen !== i + 1) issues.push('代の番号 ' + r.name);
        if (!descends(r.personId)) issues.push('劉皓の子孫でない ' + r.name);
        if (i > 0) { const pr = recs[i - 1]; if (pr.endYear === null) issues.push('前の代が閉じていない ' + pr.name); if (pr.successor && pr.successor !== r.name) issues.push('後継の名が合わない ' + pr.successor + '/' + r.name); if (r.accYear < pr.accYear) issues.push('在位の順 ' + r.name); }
        if (r.endYear !== null && (!r.posthumous)) issues.push('諡号がない ' + r.name); });
      const posts = recs.map(r => r.posthumous).filter(Boolean); if (posts.length !== new Set(posts).size) issues.push('同じ諡号 ' + posts.join(','));
      const temples = recs.map(r => r.templeName).filter(Boolean); if (temples.length !== new Set(temples).size) issues.push('同じ廟号 ' + temples.join(','));
      if (recs.filter(r => r.achievements.includes('天下統一')).length > 1) issues.push('天下統一が2代以上');
      const numbered = D.persons.filter(x => x.bloodline && /[0-9]/.test(x.name)).map(x => x.name); if (numbered.length) issues.push('番号の付いた名 ' + numbered.slice(0, 3).join(','));
      const open = recs.filter(r => r.endYear === null);
      const ids = D.persons.map(x => x.id); const dup = ids.length - new Set(ids).size;
      const revived = [...W.dead].filter(id => c.personStatus(id) !== 'dead');
      const blood = D.persons.filter(x => x.bloodline === 'xuandi');
      const over = blood.filter(x => ['leadership', 'war', 'intelligence', 'politics', 'charisma'].some(k => x[k] > 120 || (ct.base[x.id] && ct.base[x.id][k] > 120))).map(x => x.name);
      const alive = blood.filter(x => c.personStatus(x.id) !== 'dead');
      const totals = alive.map(x => { const bs = ct.base[x.id] ?? x; return ['leadership', 'war', 'intelligence', 'politics', 'charisma'].reduce((a, k) => a + bs[k], 0); });
      const f = D.scenario.factions.find(x => x.id === 'chu'); const r = c.rulerOf('chu');
      return { date: c.dateText(), name: f.name, fallen: !!W.fell, fell: W.fell, ruler: r ? r.name + '(' + (r.bloodline ? '血統' : '血統外') + '・' + (r.title ?? '') + ')' : null, rank: ct.rankOf('chu'), cities: c.cities.filter(k => D.scenario.cityOwners[k.id] === 'chu').length,
        emperors: recs.map(r => `${r.gen}代 ${r.name}(${r.born ?? '?'}〜${r.died ?? ''}) ${r.era} ${r.accYear}〜${r.endYear ?? ''} ${r.templeName ?? ''}${r.posthumous ?? ''} 領土${r.citiesStart}→${r.citiesEnd ?? ''} 会戦${r.wins + (r.endYear === null ? (ct.tally.chu?.wins ?? 0) : 0)}勝${r.losses + (r.endYear === null ? (ct.tally.chu?.losses ?? 0) : 0)}敗 ${r.endReason ?? '在位中'}`),
        n: recs.length, open: open.length, issues, usurp: W.usurp.slice(0, 5), dup, revived: revived.length, bloodAll: blood.length, bloodAlive: alive.length, over, avgTotal: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0, over500: totals.filter(t => t >= 500).length,
        prodigies: D.persons.filter(x => x.bloodline && /天賦の才/.test(x.bio ?? '')).length, persons: D.persons.length, heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576), jin: D.scenario.factions.find(x => x.id === 'jin').fallen || c.isFallen('jin') };
    }; });
  const out = {};
  for (const [label, yrs] of [['100年', 100], ['200年', 200], ['300年', 300]]) {
    const t0 = Date.now();
    while (true) { const s = await p.evaluate(() => window.__goko.campaign.calendar().year); if (s >= 304 + yrs) break; await p.evaluate(() => window.__step(360)); if (await p.evaluate(() => { const c = window.__goko.campaign; return !window.__gokoData.scenario.factions.some(f => !f.fallen && f.id !== 'chu' && c.cities.some(k => window.__gokoData.scenario.cityOwners[k.id] === f.id)) && c.gameOver; })) break; }
    const s = await p.evaluate(() => window.__snap());
    s.sec = Math.round((Date.now() - t0) / 1000);
    out[label] = s;
    console.log(label, JSON.stringify(s).slice(0, 3000));
    check(`${label} 歴代皇帝一覧と家系図が合う(代の番号・後継・在位の順・皇帝はみな劉皓の子孫・終わった代に諡号、諡号と廟号は重ならない、天下統一は1代だけ、皇族の名に番号が付かない)。在位中の皇帝は1人まで`, s.issues.length === 0 && s.open <= 1 && (s.fallen || s.rank !== 'emperor' || s.open === 1), { issues: s.issues, n: s.n, open: s.open });
    check(`${label} 血統の皇族が国にいるあいだ、家臣が君主にならない`, s.usurp.length === 0, s.usurp);
    check(`${label} 血統の能力は120を超えない。死者の復活・人物の重複がない`, s.over.length === 0 && s.revived === 0 && s.dup === 0, { over: s.over, revived: s.revived, dup: s.dup });
    if (s.fallen) break;
  }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'v65-longdynasty.json'), JSON.stringify(out, null, 1));
  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length || errs.length) { console.log('失敗:', problems.join(' / ')); process.exit(1); }
})();
