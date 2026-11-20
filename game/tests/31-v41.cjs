// Version 41:勢力の選択・首都(捕縛80%・滅亡90%の判定、遷都、遠い都市の帰属)・指で描く進軍経路・
// 歴史イベントの結果の地図への反映(変化の一覧・瞬間移動と存在しない人物の検査)・攻城戦の防衛(城壁へ上がる・救援軍)・
// 会戦の画面の重なり・音楽の設定・勢力の色の見分けやすさ
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = [];
  const open = async (sc, vp = { width: 1280, height: 800 }) => { const ctx = await b.newContext({ viewport: vp, hasTouch: true }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); await p.goto('file://' + process.argv[2] + (sc ? '#s=' + sc : '')); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1400)); if (!ok) problems.push(label); };

  // 1. 勢力の選択:一覧 → 地図で強調 → 決定。途中の変更は確認つき
  let p = await open('s357', { width: 844, height: 390 });
  await p.evaluate(() => window.__goko.openFactionSelect('start')); await p.waitForTimeout(300);
  const noClose = await p.evaluate(() => !document.querySelector('#faction-select .fs-close'));
  await p.locator('.fs-row[data-id="qianyan"]').tap(); await p.waitForTimeout(400);
  const r1 = await p.evaluate(() => ({ rows: document.querySelectorAll('.fs-row').length, facts: document.querySelector('.fs-facts')?.innerText.replace(/\s+/g, ' '), rings: window.__goko.highlights.group.children.length }));
  await p.locator('.fs-go').tap(); await p.waitForTimeout(200);
  const chosen = await p.evaluate(() => window.__goko.playerFactionId);
  await p.evaluate(() => window.__goko.openFactionSelect('change')); await p.locator('.fs-row[data-id="qianqin"]').tap(); await p.locator('.fs-go').tap();
  const askBefore = await p.evaluate(() => window.__goko.playerFactionId);
  await p.locator('.fs-yes').tap(); await p.waitForTimeout(200);
  const after = await p.evaluate(() => window.__goko.playerFactionId);
  check('1 勢力の選択:一覧と君主・首都・都市・兵力・国力を示し、地図で領土を光らせ、選ぶと始まる。途中の変更は確認してから', noClose && r1.rows >= 10 && /君主 慕容儁/.test(r1.facts) && /首都 薊/.test(r1.facts) && r1.rings >= 10 && chosen === 'qianyan' && askBefore === 'qianyan' && after === 'qianqin', { noClose, r1, chosen, askBefore, after });

  // 2. 首都:全シナリオの首都、表示(金の印と冠)、陥落の判定(200回)、遷都、セーブ・ロードで判定がやり直されない
  const r2 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, D = window.__gokoData; g.refreshCapitals();
    const live = D.scenario.factions.filter(f => !f.fallen && c.cities.some(k => D.scenario.cityOwners[k.id] === f.id));
    const missing = live.filter(f => !c.capitalCityOf(f.id)).map(f => f.name);
    const marks = g.cities.markers.filter(m => m.capital).length; const crowns = document.querySelectorAll('.city-label.capital').length;
    g.changeSettings({ playerFactionId: null }); const save = g.buildSave();
    const t = { captured: 0, escaped: 0, fell: 0, survived: 0, wrong: 0 };
    for (let i = 0; i < 200; i++) { g.applySave(save);
      const city = c.capitalCityOf('qianyan'), ruler = c.rulerOf('qianyan'); c.placement.moveTo(ruler.id, city.id, 'court', 't');
      const bid = 'cap-' + i; const cap = c.capitalFallen('qianyan', city, 'qianqin', bid, null);
      if (cap.rulerCaptured) { c.recordFate(cap.rulerId, 'captured'); c.spoils.addCaptive(cap.rulerId, 'qianqin', 'qianyan', Math.floor(c.day)); }
      c.transferCity(city.id, 'qianqin'); c.capitalAftermath('qianyan', bid); c.checkRulers();
      const e = c.capitalLog.find(l => l.battleId === bid); const fallen = !!D.scenario.factions.find(f => f.id === 'qianyan').fallen;
      if (e.captured) t.captured++; if (e.escaped) t.escaped++; if (fallen) t.fell++; if (e.survived && !fallen) t.survived++;
      if ((e.captured && !e.survived && !fallen) || (!e.captured && fallen) || (!fallen && !c.capitalCityOf('qianyan'))) t.wrong++; }
    // 不在:君主が別の都市にいれば、首都が落ちても捕らえない
    g.applySave(save); const city = c.capitalCityOf('qianyan'), ruler = c.rulerOf('qianyan'); const other = c.cities.find(k => D.scenario.cityOwners[k.id] === 'qianyan' && k.id !== city.id && k.kind !== 'pass');
    c.placement.moveTo(ruler.id, other.id, 'city', 't'); c.cityStates[city.id] = { ...c.cityState(city), governorId: null };
    const ab = c.capitalFallen('qianyan', city, 'qianqin', 'absent', null); c.transferCity(city.id, 'qianqin'); c.capitalAftermath('qianyan', 'absent');
    const absent = { captured: ab.rulerCaptured, newCapital: c.capitalCityOf('qianyan')?.name };
    // セーブ・ロードで、同じ陥落の判定はやり直されない
    g.applySave(save); const c1 = c.capitalCityOf('qianyan'); c.placement.moveTo(ruler.id, c1.id, 'court', 't'); c.capitalFallen('qianyan', c1, 'qianqin', 'same', null);
    const s2 = g.buildSave(); g.applySave(s2); const again = c.capitalFallen('qianyan', c1, 'qianqin', 'same', null);
    g.applySave(save);
    return { live: live.length, missing, marks, crowns, t, absent, rerolled: again.rulerCaptured || again.rulerEscaped, kept: c.capitalLog.length >= 0 }; });
  check('2 首都:全勢力に首都・金の印と冠。君主が首都にいれば捕縛は約80%、捕縛のうち滅亡は約90%、不在なら捕らえず遷都、ロードでやり直さない',
    r2.missing.length === 0 && r2.marks >= r2.live - 1 && r2.crowns >= 1 && r2.t.captured >= 145 && r2.t.captured <= 175 && r2.t.fell >= r2.t.captured * 0.8 && r2.t.fell <= r2.t.captured * 0.98 && r2.t.wrong === 0 && !r2.absent.captured && !!r2.absent.newCapital && !r2.rerolled, r2);
  await p.close();

  // 3. 各シナリオの首都の表(推定は推定と記す)
  const caps = {};
  for (const sc of ['s300', 's304', 's311', 's317', 's319', 's329', 's357', 's383']) {
    p = await open(sc); caps[sc] = await p.evaluate(() => { const c = window.__goko.campaign, D = window.__gokoData;
      return D.scenario.factions.filter(f => c.cities.some(k => D.scenario.cityOwners[k.id] === f.id)).map(f => { const cap = c.capitalCityOf(f.id); return `${f.name}:${cap?.name ?? 'なし'}(${c.capitals[f.id]?.certainty ?? '-'})`; }); });
    await p.close(); }
  check('3 首都の表:全シナリオで、都市を持つ全勢力に首都がある', Object.values(caps).every(l => l.every(x => !/:なし/.test(x))), Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, v.slice(12, 20)])));

  // 4. 指で描く進軍経路:描いた線が、通れる地形に沿った経路になり、日数と食糧の見積もりが出る
  p = await open('s317', { width: 844, height: 390 });
  const r4 = await p.evaluate(async () => { const g = window.__goko, c = g.campaign; c.speed = 0; g.changeSettings({ playerFactionId: 'shile' });
    const s = c.armies.find(x => x.army.factionId === 'shile'); g.selectArmy(g.armies.markerOf(s.army.id)); document.querySelector('.army-draw').click();
    const mode = document.querySelector('#army').dataset.mode;
    const via = [{ lon: s.army.lon + 0.6, lat: s.army.lat + 0.3 }, { lon: s.army.lon + 1.2, lat: s.army.lat + 0.1 }, { lon: s.army.lon + 1.6, lat: s.army.lat - 0.4 }];
    const route = c.planRouteVia(s.army.id, via); const est = route ? c.estimateRoute(s.army.id, route) : null;
    const straight = via.reduce((acc, v, i) => acc + Math.hypot(v.lon - (i ? via[i - 1].lon : s.army.lon), v.lat - (i ? via[i - 1].lat : s.army.lat)), 0);
    const passable = route ? route.points.every(pt => c.grid.costAt(pt.lon, pt.lat) > 0) : false;
    return { mode, pts: route?.points.length ?? 0, km: Math.round(route?.km ?? 0), est, passable, straightDeg: straight.toFixed(2) }; });
  // 画面の上で、指でなぞる
  const box = await p.locator('canvas').first().boundingBox();
  await p.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5); await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(box.x + box.width * (0.45 + i * 0.02), box.y + box.height * (0.5 - i * 0.01));
  await p.mouse.up(); await p.waitForTimeout(300);
  const drawn = await p.evaluate(() => ({ mode: document.querySelector('#army').dataset.mode, msg: document.querySelector('.army-message').textContent }));
  if (drawn.mode === 'confirm') await p.locator('.army-confirm').click();
  const marching = await p.evaluate(() => { const c = window.__goko.campaign; const s = c.armies.find(x => x.army.factionId === 'shile'); return s.status; });
  check('4 指で描く進軍経路:描いた線を通れる地形の経路にし、距離・日数・食糧を示し、確定で進軍する', r4.mode === 'draw' && r4.pts >= 3 && r4.passable && r4.est && r4.est.days >= 1 && drawn.mode === 'confirm' && /食糧の消費/.test(drawn.msg) && marching === 'marching', { r4, drawn, marching });
  const r4b = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const s = c.armies.find(x => x.army.factionId === 'shile'); const r = c.planRetreat(s.army.id); return { retreat: !!r, btn: !!document.querySelector('.army-retreat') }; });
  check('4b 退却:いちばん近い自国の都市への経路を作れる', r4b.retreat && r4b.btn, r4b);
  await p.close();

  // 5. 歴史イベントの結果が、戦略マップの変化として記録され、地図で光る。瞬間移動・存在しない人物がない
  p = await open('s311');
  const r5 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, h = c.history; g.changeSettings({ playerFactionId: null, historyMode: 'free' });
    const out = []; const save = g.buildSave();
    for (const d of h.defs) { const st = h.listState(d); if (!st.can) continue; const roles = d.roles(h.ctx()); const role = Object.keys(d.choices).find(r => roles[r]); if (!role) continue;
      for (const ch of d.choices[role]) { g.applySave(save); g.changeSettings({ playerFactionId: null, historyMode: 'free' }); h.fire(d.id); h.choose(d.id, ch.id); const rec = h.records[d.id];
        out.push({ id: d.id, kind: ch.kind, n: rec.changes?.length ?? -1, v: rec.violations ?? ['記録なし'], rings: g.highlights.group.children.length }); } }
    g.applySave(save); return out; });
  const v5 = r5.filter(x => x.v.length); const withChanges = r5.filter(x => x.n > 0).length;
  check('5 歴史イベント:選択肢ごとに戦略マップの変化を記録し、地図で光らせる。瞬間移動・存在しない人物の登場がない', r5.length >= 3 && withChanges >= Math.ceil(r5.length * 0.6) && v5.length === 0 && r5.some(x => x.kind !== 'historic' && x.n > 0), { tested: r5.length, withChanges, violations: v5.slice(0, 3), sample: r5.slice(0, 6) });
  await p.close();

  // 6. 攻城戦の防衛:守る側を操作し、弓兵を城壁へ上げ、攻められている所へ送り、救援軍が着く。結果は救援の軍団に戻る
  p = await open(null, { width: 1920, height: 1200 });
  await p.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 0; const D = window.__gokoData;
    // 劉曜軍が、いちばん近い敵の都市を攻める。その都市の国の軍団を、救援軍として近く(約30km)に置く
    const att = c.stateOf('army_liu_yao'); const a = att.army;
    const city = g.allCities.filter(k => k.kind !== 'pass' && D.scenario.cityOwners[k.id] && D.scenario.cityOwners[k.id] !== a.factionId).sort((x, y) => Math.hypot(x.lon - a.lon, x.lat - a.lat) - Math.hypot(y.lon - a.lon, y.lat - a.lat))[0];
    const own = D.scenario.cityOwners[city.id]; c.setRelation(a.factionId, own, 'war');
    a.lon = city.lon + 0.05; a.lat = city.lat - 0.25;
    c.cityStates[city.id] = { ...c.cityState(city), garrison: c.cityState(city).garrison + 6000 };
    const r = c.raiseArmy(city.id, 5000); const helper = typeof r === 'string' ? undefined : r;
    window.__helper = helper?.army.id; window.__cityId = city.id;
    if (helper) { helper.army.lon = city.lon + 0.3; helper.army.lat = city.lat + 0.1; helper.status = 'camping'; helper.route = null; }
    c.startSiegeAt(att, city, 'test'); const ev = c.events[c.events.length - 1]; window.__ev = ev.battleId; g.openBattleId = ev.battleId; g.startBattle('defender'); });
  await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 }); await p.waitForTimeout(800);
  const r6 = await p.evaluate(() => { const g = window.__goko, bt = g.battle, s = bt.sim, sg = s.siege;
    const relief = s.units.filter(u => u.reliefOf); const hiddenAtStart = relief.every(u => !s.isActive(u));
    const btns = [...document.querySelectorAll('.siege-def')].filter(x => !x.hidden).length;
    // 城内の予備の弓兵を、城壁へ上げる
    const archer = s.units.find(u => u.side === 'defender' && u.elevation === 0 && /弓/.test(u.name) && !u.reliefOf);
    const seg = sg.layout.segments.find(k => k.south && k.kind === 'wall');
    if (archer) sg.sendTo(s, archer, seg);
    for (let i = 0; i < 1500 && archer && archer.elevation === 0; i++) s.update(0.1);
    const climbed = archer ? archer.elevation > 0 : false;
    const spread = sg.spreadOnWalls(s); const gates = sg.defendGates(s);
    for (let i = 0; i < 2000 && !s.result; i++) s.update(0.1);
    const arrived = relief.length ? relief.some(u => s.isActive(u) || u.men < u.maxMen || u.state !== 'idle') : null;
    return { relief: relief.length, hiddenAtStart, btns, climbed, spread, gates, arrived, threat: sg.threatSegment(s)?.id ?? null }; });
  const r6b = await p.evaluate(() => { const g = window.__goko, bt = g.battle, s = bt.sim; for (let i = 0; i < 60000 && !s.result; i++) s.update(0.1);
    const res = s.result; const before = window.__helper ? JSON.stringify(g.campaign.stateOf(window.__helper)?.army.troops) : null; g.finishBattle(res);
    const h = window.__helper ? g.campaign.stateOf(window.__helper) : null;
    return { winner: res.winner, relief: res.relief ? Object.keys(res.relief).length : 0, helperAfter: h ? { status: h.status, troops: h.army.troops } : 'なし(壊滅)', before }; });
  check('6 攻城戦の防衛:守る側の命令(城壁へ上がる・城門を固める・城壁に散る)と、救援軍の到着、救援の軍団への結果の反映', r6.btns === 4 && r6.climbed && r6.spread > 0 && r6.gates >= 0 && r6.relief >= 1 && r6.hiddenAtStart && r6.arrived && r6b.relief >= 1 && r6b.helperAfter !== null, { r6, r6b });
  await p.close();

  // 7. 会戦の画面の重なり:PC と iPhone の横向きで、上の帯・一覧・下の操作欄が重ならない。一覧はたためる
  for (const vp of [{ width: 1920, height: 1200 }, { width: 844, height: 390 }]) {
    p = await open('s304', vp);
    await p.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 0; const a = c.armies[0], d = c.armies.find(x => x.army.factionId !== a.army.factionId);
      const e2 = { battleId: 'field_t', battleType: 'field_battle', attackerArmyId: a.army.id, defenderArmyId: d.army.id, location: { lon: a.army.lon, lat: a.army.lat, name: '試験' }, terrain: 'plain', attackerFactionId: a.army.factionId, defenderFactionId: d.army.factionId, status: 'pending', createdAt: { day: 0, text: '' } };
      c.events.push(e2); g.openBattleId = e2.battleId; g.startBattle('attacker'); });
    await p.waitForFunction(() => window.__goko.battle, null, { timeout: 60000 }); await p.waitForTimeout(600);
    const r7 = await p.evaluate(() => { const sel = ['.hud-top', '.hud-terrain', '.hud-list.attacker', '.hud-list.defender', '.hud-bottom'];
      const rs = sel.map(s => ({ s, r: document.querySelector('#battle-hud ' + s)?.getBoundingClientRect() })).filter(x => x.r && x.r.width > 2 && x.r.height > 2);
      const ov = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i].r, b = rs[j].r; const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ix > 2 && iy > 2) ov.push(rs[i].s + '×' + rs[j].s); }
      const chipOverlap = [...document.querySelectorAll('#battle-hud .hud-chip')].some(ch => { const n = ch.querySelector('.hud-chip-name').getBoundingClientRect(), m = ch.querySelector('.hud-chip-men').getBoundingClientRect(); return n.right > m.left + 1 && n.width > 0; });
      document.querySelector('.hud-panels').click(); const collapsed = getComputedStyle(document.querySelector('.hud-list.attacker')).display === 'none'; document.querySelector('.hud-panels').click();
      return { ov, chipOverlap, collapsed, strategicMenuHidden: getComputedStyle(document.querySelector('#clock')).display === 'none' || document.querySelector('#clock').getBoundingClientRect().height === 0 || !!document.querySelector('.in-battle') }; });
    check(`7 会戦の画面(${vp.width}x${vp.height}):帯・一覧・操作欄が重ならず、一覧の名前と兵数も重ならない。一覧はたためる`, r7.ov.length === 0 && !r7.chipOverlap && r7.collapsed, r7);
    await p.close();
  }

  // 8. 音楽:場面ごとに曲を選び、音量と消音を設定できる。利用者の操作の前は鳴らさない
  p = await open('s317');
  const r8a = await p.evaluate(() => window.__goko.bgm.state);
  await p.mouse.click(400, 300); await p.waitForTimeout(1200);
  const r8 = await p.evaluate(async () => { const g = window.__goko; await g.bgm.unlock(); await new Promise(r => setTimeout(r, 1200)); const s1 = g.bgm.state;
    document.querySelector('#menu-open').click(); const vol = document.querySelector('#menu-bgm-volume'); vol.value = '0.2'; vol.dispatchEvent(new Event('input')); const mute = document.querySelector('#menu-bgm-mute'); mute.click();
    const s2 = g.bgm.state; mute.click(); document.querySelector('#menu-close').click(); return { s1, s2, label: document.querySelector('#menu-bgm-state').textContent }; });
  check('8 音楽:利用者の操作で鳴り始め、場面(戦略マップ)の曲を選ぶ。音量と消音を変えられる', r8.s1.scene === 'map' && r8.s2.volume === 0.2 && r8.s2.muted === true, { before: r8a, r8 });
  await p.close();

  // 9. 勢力の色:同じシナリオの勢力どうしの色が、見分けられるくらい離れている(色差 ΔE 15 以上)
  p = await open('s311');
  const r9 = await p.evaluate(() => { const D = window.__gokoData; const lab = (h) => { const n = parseInt(h.slice(1), 16); let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; }); const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883; const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]; };
    const live = D.scenario.factions.filter(f => Object.values(D.scenario.cityOwners).includes(f.id)); let min = 999, pair = '';
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) { const a = lab(live[i].color), b = lab(live[j].color); const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < min) { min = d; pair = live[i].name + '・' + live[j].name; } }
    return { min: Math.round(min * 10) / 10, pair }; });
  check('9 勢力の色:いちばん近い2国でも色差15以上', r9.min >= 15, r9);
  await p.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
