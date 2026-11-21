// 皇帝生活モード(Version 41 の仕様変更):3Dの後宮・自由な移動・人物ごとの性格と会話・交流・恋愛(本人の同意)・
// 後宮の人間関係・皇室との連動・政治の委任(AIが自動で進める)・セーブ・ロード・iPhone の操作
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; const problems = []; const path = require('path');
  const open = async (sc, ctx = { viewport: { width: 1280, height: 800 } }) => { const p = await (await b.newContext(ctx)).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1500)); if (!ok) problems.push(label); };
  const out = (n) => path.join(__dirname, 'out', n);

  let p = await open('s317');
  // ---- 1. 宮殿に入る:人物の人数・性格・会話 ----
  const r1 = await p.evaluate(() => { const g = window.__goko, c = g.campaign; c.speed = 0; g.changeSettings({ playerFactionId: 'jin' });
    const err = g.enterPalace(); const P = c.palace; const list = P.present();
    const tempers = new Set(list.map(n => n.temper)); const arts = new Set(list.map(n => n.art));
    const talks = list.slice(0, 6).map(n => P.talk(n).lines.join('')); const distinct = new Set(talks).size;
    const adults = list.every(n => P.ageOf(n) >= 18);
    const fields = Object.keys(P.card(list[0]));
    return { err, n: list.length, hist: list.filter(n => !n.fictional).map(n => n.name), tempers: [...tempers], arts: [...arts], distinct, adults, fields, court: c.playerFactionId, inPalace: document.querySelector('#app').classList.contains('in-palace'), hudShown: !document.querySelector('#palace-hud').hidden }; });
  await p.waitForTimeout(800);
  await p.screenshot({ path: out('palace-pc.png') });
  check('1 宮殿に入れる。成人の人物が10人以上いて、性格・好きなことが人ごとに違い、会話も人ごとに違う。政治は重臣に委任される', !r1.err && r1.n >= 10 && r1.tempers.length >= 4 && r1.arts.length >= 4 && r1.distinct >= 4 && r1.adults && r1.court === '__court__' && r1.inPalace && r1.hudShown && ['名前', '年齢', '出身', '身分', '性格', '好み', '将来の希望', '親しい人', '合わない人'].every(k => r1.fields.includes(k)), r1);

  // ---- 2. 自由な移動:キーで歩く・指した所へ歩く・壁を抜けない ----
  const r2 = await p.evaluate(async () => { const s = window.__goko.palace.screen; const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const p0 = { x: s.pos.x, z: s.pos.z }; s.yaw = 0; s.press('w', true); await wait(1200); s.press('w', false); const p1 = { x: s.pos.x, z: s.pos.z };
    s.walkTo(-10, 20); for (let i = 0; i < 60 && Math.hypot(s.pos.x + 10, s.pos.z - 20) > 0.6; i++) await wait(250); const p2 = { x: s.pos.x, z: s.pos.z, area: s.currentArea };
    // 寝殿の背の壁に向かって歩き続けても、壁を抜けない
    s.pos.set(0, 0, -60); s.walkTo(0, -90); await wait(4000); const p3 = { x: s.pos.x, z: s.pos.z };
    const inWall = s.world.obstacles.some(o => p3.x > o.x0 && p3.x < o.x1 && p3.z > o.z0 && p3.z < o.z1);
    // 区画を巡る:8つの区画すべてに行ける
    const seen = new Set(); for (const a of Object.keys(s.world.spots)) { const sp = s.world.spots[a][0]; s.pos.set(sp.x, 0, sp.z); seen.add(s.currentArea); }
    s.pos.set(8, 0, 76);
    return { p0, p1, p2, p3, inWall, areas: [...seen] }; });
  check('2 皇帝が自由に歩ける(キーで前へ・指した所へ)。壁を抜けない。8つの区画(寝殿・皇后の宮殿・妃の居所・女官の詰所・庭園・浴殿・宴会場・回廊)がある', Math.hypot(r2.p1.x - r2.p0.x, r2.p1.z - r2.p0.z) > 2 && r2.p1.z < r2.p0.z && Math.hypot(r2.p2.x + 10, r2.p2.z - 20) < 1 && r2.p3.z > -66 && !r2.inWall && r2.areas.length === 8, r2);

  // ---- 3. 時刻で居場所が変わる ----
  const r3 = await p.evaluate(() => { const g = window.__goko, P = g.campaign.palace; const list = P.present();
    const at = (slot) => list.map(n => P.whereAt(n, slot, Math.floor(g.campaign.day)).area).join(',');
    const d0 = g.campaign.dateText(); const s0 = P.slot; g.palaceAdvance(1); const s1 = P.slot; const d1 = g.campaign.dateText();
    return { morning: at(0), noon: at(1), evening: at(2), night: at(3), s0, s1, d0, d1 }; });
  check('3 朝・昼・夕・夜で、人物の居場所が変わる。時を進めると刻が変わる', new Set([r3.morning, r3.noon, r3.evening, r3.night]).size >= 3 && r3.s1 === (r3.s0 + 1) % 4, r3);

  // ---- 4. 交流:話す・贈り物(好み)・誘い(信頼)・詩歌・相談・宴 ----
  const r4 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace; c.factionStates.jin.gold = 5000; if (P.slot === 3) g.palaceAdvance(1); if (P.slot === 0) g.palaceAdvance(1);
    const ladies = P.present().filter(n => n.rank === 'lady' && n.fictional); const a = ladies[0], b = ladies[1];
    const i0 = a.intimacy; P.talk(a); const i1 = a.intimacy; P.talk(a); const i2 = a.intimacy;
    const like = a.likes[0], dis = a.dislikes[0]; const x0 = b.intimacy; const gl = P.gift(b, b.likes[0]); const x1 = b.intimacy; const gd = P.gift(b, b.dislikes[0]); const x2 = b.intimacy;
    const low = ladies[2]; low.trust = 0; low.intimacy = 0; const inv0 = P.invite(low, 'garden');
    const hi = ladies[3]; hi.trust = 70; hi.intimacy = 50; const inv1 = P.invite(hi, 'meal');
    const ar = P.arts(ladies[4]);
    const cs = ladies[5]; cs.trust = 60; cs.hope = 'family'; cs.concern = { kind: 'family', day: Math.floor(c.day), text: '故郷の母が病で' }; const opts = P.consultOptions(cs).map(o => o.id); const t0 = cs.trust; const res = P.consult(cs, 'help'); const t1 = cs.trust;
    return { talk: [i0, i1, i2], gift: [x0, x1, x2, gl.effect, gd.effect], inv0, inv1, ar: ar.effect, opts, consult: [t0, t1, typeof res === 'string' ? res : res.effect] }; });
  check('4 交流:話すと親密度が上がる(同じ日の繰り返しは小さい)。好みの贈り物は喜び、苦手な物は喜ばない。信頼が低いと誘いを断り、高いと応じる。相談に乗ると信頼が上がる', r4.talk[1] > r4.talk[0] && (r4.talk[2] - r4.talk[1]) < (r4.talk[1] - r4.talk[0]) && r4.gift[1] - r4.gift[0] > r4.gift[2] - r4.gift[1] && !r4.inv0.ok && r4.inv1.ok && r4.consult[1] > r4.consult[0] && r4.opts.includes('help'), r4);

  // ---- 5. 恋愛は本人の意思:気持ちが無ければ断られ、時を置く。断りを無視して進める道はない ----
  const r5 = await p.evaluate(() => { const g = window.__goko, P = g.campaign.palace; const n = P.present().filter(x => x.rank === 'lady' && x.fictional)[6];
    n.intimacy = 60; n.trust = 50; n.romance = 10; n.hope = 'quiet';
    const first = P.propose(n, 'confess'); const again = P.canDo(n, 'confess'); const forced = P.propose(n, 'confess');
    // 地位を使う(妃にする)のも、想いが通じていなければできない
    const other = P.present().filter(x => x.rank === 'lady' && x.fictional && !x.coolUntil && x.bond === 'none')[1]; const consort = P.canDo(other, 'consort');
    return { first, again, forced, consort, bond: n.bond, cool: n.coolUntil - Math.floor(g.campaign.day) }; });
  check('5 恋愛は本人の意思:気持ちが無いと断られ、30日は同じ申し出をしない(断りを無視して進められない)。想いが通じていなければ妃にもできない', r5.first.ok === false && typeof r5.again === 'string' && /尊重/.test(r5.again) && typeof r5.forced === 'string' && r5.bond === 'none' && /想いが通じて/.test(r5.consort) && r5.cool === 30, r5);

  // ---- 6. 想いが通じる → 妃に迎える → 皇后に立てる(本人の同意)。皇室の家系図・婚姻と一致する ----
  const r6 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace, D = window.__gokoData; const ruler = P.ruler();
    const n = P.present().filter(x => x.rank === 'lady' && x.fictional && !x.coolUntil)[0];
    n.intimacy = 80; n.trust = 80; n.romance = 70; n.hope = 'favor'; n.jealousy = 0;
    const others = P.present().filter(x => x !== n && x.romance >= 40); const jealous0 = others.map(o => o.jealousy);
    const c1 = P.propose(n, 'confess'); n.romance = 85; const c2 = P.propose(n, 'consort');
    const person = D.persons.find(x => x.id === n.personId); const wives = c.court.spousesOf(ruler.id).map(x => x.id);
    const kind = c.diplo.marriages.find(m => m.husband === ruler.id && m.wife === n.personId)?.kind;
    const pri0 = c.court.primaryOf(ruler.id)?.name ?? null;
    n.romance = 90; n.trust = 90; n.regard = 80; const c3 = P.propose(n, 'empress'); const pri1 = c.court.primaryOf(ruler.id)?.id ?? null;
    return { c1, c2: typeof c2 === 'string' ? c2 : c2.effect, c3: typeof c3 === 'string' ? c3 : c3.effect, person: person ? { name: person.name, fictional: person.fictional, gender: person.gender, f: person.factionId } : null, inWives: wives.includes(n.personId), kind, pri0, priIsHer: pri1 === n.personId, rank: n.rank, jealous: [jealous0, others.map(o => o.jealousy)], hasOthers: others.length, ruler: ruler.name }; });
  check('6 想いが通じ(恋人)、妃に迎え(人物の台帳と婚姻に加わる)、皇后に立てられる。どれも本人の同意による。皇室の家系図と一致する', r6.c1.ok && /妃に迎えました/.test(r6.c2) && r6.person && r6.person.fictional && r6.inWives && (/皇后に立てました/.test(r6.c3) ? r6.priIsHer && r6.rank === 'empress' : r6.pri0 !== null), r6);

  // ---- 7. 恋愛の相手にならない人(皇族・近親・ほかの人の妻)、未成年は交流の相手にならない。子女は養育の画面だけ ----
  const r7 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace, D = window.__gokoData; const ruler = P.ruler();
    const blocked = P.present().filter(n => P.romanceBlock(n)).map(n => `${n.name}:${P.romanceBlock(n)}`);
    const married = P.present().find(n => n.personId && c.court.spousesOf(n.personId).some(h => h.id !== ruler.id));
    // 子を1人生ませて(皇室の誕生の仕組みで)、未成年が後宮の名簿に入らないこと
    const minors = D.persons.filter(x => x.factionId === 'jin' && x.gender === 'female' && c.court.age(x) !== null && c.court.age(x) < 18).map(x => x.id);
    const inList = P.present().filter(n => minors.includes(n.personId)).length;
    const kids = P.children(); const minorKids = kids.filter(k => k.minor).map(k => k.p.name);
    return { blocked, married: married ? `${married.name}:${P.romanceBlock(married)}` : null, inList, minors: minors.length, kids: kids.map(k => `${k.p.name}(${k.age})`), minorKids, kidNpc: kids.some(k => P.present().some(n => n.personId === k.p.id && k.minor)) }; });
  check('7 皇族・近親・ほかの人の妻には恋愛の選択肢がない。未成年は後宮の名簿に入らず、子女は養育の画面だけで扱う', r7.inList === 0 && !r7.kidNpc && (!r7.married || /ほかの人の妻/.test(r7.married)), r7);

  // ---- 8. 後宮の人間関係:寵愛で嫉妬が増える・招かれない妃は寂しく思う・派閥 ----
  const r8 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace; c.factionStates.jin.gold = 5000; while (P.slot < 2) g.palaceAdvance(1);
    const spouses = P.present().filter(n => n.bond === 'spouse'); const fav = P.present().find(n => n.bond === 'none' && n.rank === 'lady');
    for (const s of spouses) { s.romance = Math.max(s.romance, 50); s.jealousy = 0; }
    const j0 = spouses.map(s => s.jealousy); P.gift(fav, fav.likes[0]); P.arts(fav); const j1 = spouses.map(s => s.jealousy);
    const ban = P.banquet([fav]); const fac = P.factions().map(f => `${f.leader.name}:${f.members.length}`);
    return { spouses: spouses.map(s => s.name), j0, j1, ban: typeof ban === 'string' ? ban : ban.effects, fac }; });
  check('8 後宮の人間関係:ほかの人への寵愛で、妃の嫉妬が増える。宴に招かれない妃は寂しく思う。派閥ができる', r8.spouses.length >= 1 && r8.j1.some((v, i) => v > r8.j0[i]) && Array.isArray(r8.ban) && r8.ban.some(t => /招かれず/.test(t)) && r8.fac.length >= 1, r8);

  // ---- 9. 政治の委任:宮殿にいるあいだも、自国はAIが動かし、他国・歴史の事件も進む。重要なことは上奏される ----
  const r9 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace, h = c.history;
    const d0 = c.day; const log0 = c.strategy.log.filter(l => l.factionId === 'jin').length; const rec0 = Object.values(h.records).filter(r => r.status !== 'pending').length; const news0 = c.news.length;
    for (let i = 0; i < 6; i++) g.palaceAdvance(30 * 4);
    const ministers = P.ministers().map(m => `${m.role}:${m.person?.name ?? '-'}`);
    return { days: Math.round(c.day - d0), jinLog: c.strategy.log.filter(l => l.factionId === 'jin').length - log0, events: Object.values(h.records).filter(r => r.status !== 'pending').length - rec0, news: c.news.length - news0, reports: P.reports.length, sample: P.reports.slice(-3).map(r => r.text), ministers, still: !!g.palace.screen, court: c.playerFactionId, prep: !document.querySelector('#battle').hidden }; });
  check('9 宮殿にいるあいだも、自国の政治・軍事はAI(重臣)が動かし、他国・歴史の事件が進む。会戦の準備画面は開かない。重要なことは上奏される。重臣は4人', r9.days >= 170 && r9.jinLog >= 1 && r9.news >= 5 && !r9.prep && r9.ministers.length === 4 && r9.court === '__court__' && (r9.still || r9.reports >= 0), r9);

  // ---- 10. セーブ・ロード:宮殿にいる状態・人物の気持ち・妃が残る ----
  const r10 = await p.evaluate(() => { const g = window.__goko, c = g.campaign, P = c.palace;
    const snap = () => JSON.stringify({ npcs: P.npcs.map(n => [n.id, Math.round(n.intimacy), Math.round(n.trust), Math.round(n.romance), n.bond, n.rank, n.personId ?? null]), slot: P.slot, wives: c.court.spousesOf(P.ruler().id).map(x => x.id).sort() });
    const a = snap(); const sv = JSON.parse(JSON.stringify(g.buildSave())); P.npcs[0].intimacy = 1; g.exitPalace(); g.applySave(sv); const b2 = snap();
    return { same: a === b2, back: !!g.palace.screen, court: c.playerFactionId, active: P.active }; });
  check('10 セーブ・ロード:宮殿の状態・人物の気持ち・妃が元どおりに戻り、宮殿に戻る', r10.same && r10.back && r10.court === '__court__' && r10.active, r10);

  // ---- 11. 画面の操作:人物をクリックして話しかけ、欄の釦で交流する。政務に戻る ----
  await p.evaluate(() => { const g = window.__goko, s = g.palace.screen; const n = g.campaign.palace.present()[0]; const q = s.npcPos(n.id); s.pos.set(q.x + 1.5, 0, q.z + 1.5); s.yaw = Math.atan2(1.5, 1.5); s.dist = 6; s.pitch = 0.35; window.__n0 = n.id; });
  await p.waitForTimeout(700);
  const box = await p.evaluate(() => { const g = window.__goko, s = g.palace.screen; const q = s.npcPos(window.__n0).clone(); q.y += 1.0; q.project(s.camera); const r = document.querySelector('#map').getBoundingClientRect(); return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height }; });
  await p.mouse.click(box.x, box.y);
  await p.waitForTimeout(300);
  const ui1 = await p.evaluate(() => ({ panel: !document.querySelector('.ph-panel').hidden, name: document.querySelector('.ph-name')?.textContent, buttons: [...document.querySelectorAll('.ph-actions button')].map(b => b.textContent) }));
  if (ui1.panel) await p.click('.ph-actions button[data-a="talk"]');
  const ui2 = await p.evaluate(() => ({ talk: document.querySelector('.ph-talk')?.textContent ?? '' }));
  await p.screenshot({ path: out('palace-talk-pc.png') });
  await p.click('.ph-side button[data-s="roster"]');
  const roster = await p.$$eval('.ph-sheet .ph-row', els => els.length);
  await p.click('.ph-side button[data-s="ministers"]');
  const mins = await p.$$eval('.ph-sheet .ph-row', els => els.map(e => e.textContent.slice(0, 40)));
  await p.click('.ph-side .ph-exit');
  const ui3 = await p.evaluate(() => ({ inPalace: document.querySelector('#app').classList.contains('in-palace'), court: window.__goko.campaign.playerFactionId, rail: getComputedStyle(document.querySelector('#court-open')).display }));
  check('11 画面:人物をクリックすると交流の欄が開き、「話す」で会話が出る。後宮の人々・重臣の一覧が出る。「政務に戻る」で戦略マップと操作に戻る', ui1.panel && ui1.buttons.includes('話す') && ui2.talk.length > 4 && roster >= 10 && mins.length === 4 && !ui3.inPalace && ui3.court === 'jin' && ui3.rail !== 'none', { ui1, ui2, roster, mins, ui3 });
  // 性能(ソフトウェア描画での目安。実機の値ではない)
  await p.evaluate(() => window.__goko.enterPalace());
  await p.waitForTimeout(2500);
  const fps = await p.evaluate(() => Math.round(window.__goko.palace.screen.fps * 10) / 10);
  console.log('INFO 宮殿の描画(ソフトウェア描画・1280×800):', fps, 'FPS');
  await p.close();

  // ---- 12. iPhone:タップで歩き、人物をタップして話す。欄が画面に収まる ----
  const q = await open('s317', { ...devices['iPhone 13 landscape'] });
  await q.evaluate(() => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); g.enterPalace(); });
  await q.waitForTimeout(800);
  const t0 = await q.evaluate(() => ({ x: window.__goko.palace.screen.pos.x, z: window.__goko.palace.screen.pos.z }));
  const vp = q.viewportSize();
  await q.touchscreen.tap(vp.width * 0.5, vp.height * 0.45);
  await q.waitForTimeout(2500);
  const t1 = await q.evaluate(() => ({ x: window.__goko.palace.screen.pos.x, z: window.__goko.palace.screen.pos.z }));
  await q.evaluate(() => { const g = window.__goko, s = g.palace.screen; const n = g.campaign.palace.present()[1]; const pp = s.npcPos(n.id); s.pos.set(pp.x + 1.2, 0, pp.z + 1.2); s.yaw = Math.atan2(1.2, 1.2); s.dist = 6; s.pitch = 0.35; window.__n1 = n.id; });
  await q.waitForTimeout(600);
  await q.tap('.ph-near');
  await q.waitForTimeout(300);
  const ip = await q.evaluate(() => { const el = document.querySelector('.ph-panel'); const r = el.getBoundingClientRect(); return { open: !el.hidden, fits: r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1, scroll: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
  if (ip.open) await q.tap('.ph-actions button[data-a="talk"]');
  const ipTalk = await q.evaluate(() => document.querySelector('.ph-talk')?.textContent ?? '');
  await q.screenshot({ path: out('palace-iphone.png') });
  check('12 iPhone(横向き・タッチの模擬):タップした所へ歩き、近くの人物に「話しかける」で欄が開く。欄が画面に収まる', Math.hypot(t1.x - t0.x, t1.z - t0.z) > 1 && ip.open && ip.fits && ip.scroll && ipTalk.length > 4, { t0, t1, ip, ipTalk: ipTalk.slice(0, 60) });
  await q.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
