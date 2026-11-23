// Version 54:皇帝生活モードの2D化(背景画・肖像画・表情差分・一枚絵・画像の手元の控え・PC と iPhone の画面)
// この試験は、もとは「写実寄りの3Dの頭」(Version 54 の途中の試作)の試験だった。皇帝生活モードを完全2Dにする仕様変更で3Dの頭を使わなくなったため、
// 同じ番号のまま、2Dの肖像画と背景画の試験に置き換えた(3Dの頭の試験の目的=顔の読み込み・表情・人ごとの違い・資源の片づけ・旧セーブ は、2Dで確かめる)。
const { chromium, devices } = require('playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1500)); if (!ok) problems.push(label); };
  const dist = path.dirname(process.argv[2]);
  const open = async (ctx = { viewport: { width: 1280, height: 800 } }) => { const p = await (await b.newContext(ctx)).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); await p.goto('file://' + process.argv[2] + '#s=s317'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const p = await open();

  // 試験用の画像を書き出す(ブラウザで色つきの絵を描いて PNG にし、目録の名前で置く)。試験のあとで消す
  const made = [];
  const writeImg = async (rel, w, h, color, text) => {
    const data = await p.evaluate(({ w, h, color, text }) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText(text, 20, 60); return c.toDataURL('image/png').split(',')[1]; }, { w, h, color, text });
    for (const tag of ['l', 's']) { const f = path.join(dist, 'palace2d', rel + `-${tag}.webp`); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(data, 'base64')); made.push(f); }
  };
  await writeImg('p/A1_normal', 400, 600, '#a04040', 'A1 normal');
  await writeImg('p/A1_smile', 400, 600, '#40a040', 'A1 smile');
  await writeImg('p/L01_normal', 400, 600, '#4040a0', 'L01 normal');
  await writeImg('bg/garden_day', 800, 533, '#5a8a40', 'garden day');
  await writeImg('bg/garden_night', 800, 533, '#102040', 'garden night');
  await writeImg('ev/ev_scholar', 800, 533, '#806020', 'event scholar');
  await p.evaluate(() => { const R = window.__gokoPalace2D.registerForTest; R('portraits', 'A1', 'normal'); R('portraits', 'A1', 'smile'); R('portraits', 'L01', 'normal'); R('bg', 'garden', 'day'); R('bg', 'garden', 'night'); R('ev', 'scholar'); });
  await p.evaluate(() => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); g.enterPalace(); });

  // T1. 8区画すべてへ移れ、区画ごとに背景が替わる
  const t1 = await p.evaluate(async () => { const g = window.__goko, s = g.palace.screen; const w = ms => new Promise(r => setTimeout(r, ms)); const out = [];
    for (const a of ['emperorHall', 'empressPalace', 'consortQuarters', 'ladiesStation', 'garden', 'bath', 'banquet', 'corridor']) { s.moveTo(a); await w(1100); const on = document.querySelector('.p2-bg.on'); out.push({ a, cur: s.currentArea, bg: on?.style.backgroundImage ?? '', stage: document.querySelector('.p2-stage').dataset.area }); }
    return out; });
  check('T1 8区画すべてへ移れる。区画ごとに背景が替わる(画像の無い区画は、区画ごとの仮の背景)', t1.every(x => x.cur === x.a && x.stage === x.a && x.bg.length > 10) && new Set(t1.map(x => x.bg)).size === 8, t1.map(x => [x.a, x.bg.slice(5, 40)]));

  // T2. 時刻が背景に出る:昼と夜で絵が替わる(夜の絵があれば夜の絵)。朝・夕の絵が無ければ昼の絵に色を重ねる
  const t2 = await p.evaluate(async () => { const g = window.__goko, s = g.palace.screen, P = g.campaign.palace; const w = ms => new Promise(r => setTimeout(r, ms)); s.moveTo('garden'); const out = {};
    for (const slot of [0, 1, 2, 3]) { P.slot = slot; s.onSlotChanged(); await w(1200); const t = document.querySelector('.p2-tint'); out[slot] = { bg: document.querySelector('.p2-bg.on').style.backgroundImage.replace(/^url\("?/, '').slice(0, 40), time: t.dataset.time, native: t.dataset.native }; }
    P.slot = 1; s.onSlotChanged(); return out; });
  check('T2 時刻が背景に出る:昼は昼の絵、夜は夜の絵。朝・夕は(絵が無いので)昼の絵に朝もや・夕焼けの色を重ねる', /garden_day/.test(t2[1].bg) && /garden_night/.test(t2[3].bg) && /garden_day/.test(t2[0].bg) && t2[0].native === '0' && t2[3].native === '1' && t2[2].time === 'evening', t2);

  // T3. その区画にいる人の肖像が出る(画像が無い人は、必要な ID を書いた仮の絵)
  const t3 = await p.evaluate(async () => { const g = window.__goko, s = g.palace.screen; const w = ms => new Promise(r => setTimeout(r, ms)); let a = 'ladiesStation'; for (const x of ['ladiesStation', 'garden', 'consortQuarters', 'empressPalace']) { s.moveTo(x); if (s.here().length >= 2) { a = x; break; } } await w(300);
    const els = [...document.querySelectorAll('.p2-person')]; return { a, here: s.here().length, shown: els.length, srcs: els.map(e => e.querySelector('img').src.slice(0, 30)), placeholder: els.some(e => decodeURIComponent(e.querySelector('img').src).includes('画像未登録')) }; });
  check('T3 その区画にいる人の肖像が、人数分出る。画像がまだ無い人は、登録の要る ID を書いた仮の絵が出る', t3.here > 0 && t3.shown === t3.here && t3.placeholder, t3);

  // T4. 人物 ID と画像が合う:物語の役を持つ人は、その役の専用の肖像(A1〜A6)。割り当てはセーブ・ロードのあとも同じで、宮にいる人どうしで重ならない
  const t4 = await p.evaluate(async () => { const g = window.__goko, P = g.campaign.palace; const mains = P.mains().map(n => [n.name, n.story.arc, n.portrait]);
    const all = P.present().map(n => [n.id, n.portrait]); const dup = all.length - new Set(all.map(x => x[1])).size;
    const sv = JSON.parse(JSON.stringify(g.buildSave())); g.applySave(sv); await new Promise(r => setTimeout(r, 600));
    const after = g.campaign.palace.present().map(n => [n.id, n.portrait]); const scholar = g.campaign.palace.mains().find(n => n.story.arc === 'scholar');
    return { mains, dup, same: JSON.stringify(all) === JSON.stringify(after), scholar: scholar ? [scholar.id, scholar.portrait] : null }; });
  const arcId = { scholar: 'A1', ambitious: 'A2', provincial: 'A3', attendant: 'A4', consort: 'A5', free: 'A6' };
  check('T4 人物 ID と肖像が正しく結びつく:物語の6人は役の専用の肖像(A1〜A6)、ほかの人は重ならない肖像。セーブ・ロードのあとも同じ', t4.mains.length === 6 && t4.mains.every(([, arc, pid]) => arcId[arc] === pid) && t4.dup === 0 && t4.same, t4);

  // T5. 表情差分:会話の相手の大きな肖像が、表情で替わる(登録した表情はその絵、無い表情は近い表情の絵)
  const t5 = await p.evaluate(async () => { const g = window.__goko, P = g.campaign.palace, s = g.palace.screen; const w = ms => new Promise(r => setTimeout(r, ms)); const n = P.mains().find(x => x.story.arc === 'scholar');
    s.moveTo(P.whereAt(n).area); g.palace.hud.openNpc(n.id); s.setTalking(n.id); const out = {};
    for (const e of ['normal', 'smile', 'joy', 'sad']) { n.expr = e; await w(500); const img = document.querySelector('.p2-focus img.on'); out[e] = { cast: img.dataset.cast, expr: img.dataset.expr, file: img.src.split('/').pop() }; }
    g.palace.hud.closeNpc(); n.expr = undefined; return out; });
  check('T5 表情差分が切り替わる:通常・微笑みは登録した絵、喜びは(絵が無いので)微笑み、悲しみは通常の絵で代わりにする。どれも同じ人物 A1 の絵', t5.normal.file.startsWith('A1_normal') && t5.smile.file.startsWith('A1_smile') && t5.joy.file.startsWith('A1_smile') && t5.sad.file.startsWith('A1_normal') && Object.values(t5).every(x => x.cast === 'A1'), t5);

  // T6. 物語の結末で、一枚絵が出る(絵があれば)。押すと閉じる
  const t6 = await p.evaluate(async () => { const g = window.__goko, P = g.campaign.palace, s = g.palace.screen; const w = ms => new Promise(r => setTimeout(r, ms)); const n = P.mains().find(x => x.story.arc === 'scholar');
    s.moveTo(P.whereAt(n).area); g.palace.hud.openNpc(n.id); s.setTalking(n.id); n.story.ending = 'colleague'; n.story.stage = 5; await w(600); const box = document.querySelector('.p2-event'); const shown = !box.hidden; const src = box.querySelector('img').src.split('/').pop();
    box.click(); await w(100); const closed = box.hidden; g.palace.hud.closeNpc(); return { shown, src, closed }; });
  check('T6 物語の結末で、特別な場面の一枚絵が出る。押すと閉じる', t6.shown && t6.src.startsWith('ev_scholar') && t6.closed, t6);

  // T7. 画像の手元の控え:何度も場所を巡っても、控えは上限(24枚)を超えず、古い画像は手放す。メモリを測れる
  const t7 = await p.evaluate(async () => { const g = window.__goko, s = g.palace.screen; const w = ms => new Promise(r => setTimeout(r, ms)); window.gc?.(); const h0 = Math.round(performance.memory.usedJSHeapSize / 1e6);
    for (let k = 0; k < 6; k++) for (const a of ['emperorHall', 'empressPalace', 'consortQuarters', 'ladiesStation', 'garden', 'bath', 'banquet', 'corridor']) { s.moveTo(a); await w(20); }
    for (let i = 0; i < 40; i++) void s.cache.get(`palace2d/p/fake_${i}-l.webp`); await w(300); window.gc?.();
    return { cached: s.cache.size, released: s.cache.released, heap0: h0, heap1: Math.round(performance.memory.usedJSHeapSize / 1e6), stats: s.stats() }; });
  check('T7 画像の手元の控えは上限(24枚)を超えず、古いものは手放す。2Dの画面のメモリを測れる', t7.cached <= 24 && t7.released > 0 && t7.heap1 < t7.heap0 + 30 && t7.stats.images > 0, t7);

  // T8. Version 53 のセーブ(3Dの宮殿の位置があり、2Dの区画・肖像の項目が無い)を読み込むと、その位置の区画に移る
  const t8 = await p.evaluate(async () => { const g = window.__goko; const sv = JSON.parse(JSON.stringify(g.buildSave())); const pal = sv.campaign.palace; delete pal.area; pal.avatar = { x: 10, z: 30, facing: 0 }; for (const n of pal.npcs) delete n.portrait; pal.v = 53;
    g.applySave(sv); await new Promise(r => setTimeout(r, 800)); const s = g.palace.screen; return { screen: !!s, area: s?.currentArea, label: document.querySelector('.ph-area')?.textContent, portraits: g.campaign.palace.present().every(n => !!n.portrait) }; });
  check('T8 Version 53 のセーブ(3Dの宮殿の中の位置)を読み込むと、その位置の区画(庭園)の2Dの画面に戻る。肖像も割り当てられる', t8.screen && t8.area === 'garden' && t8.label === '後宮の庭園' && t8.portraits, t8);

  // T9. 絵の登録の欄:配役ごとの登録の数と、使っている人が出る
  const t9 = await p.evaluate(async () => { const g = window.__goko; g.palace.hud.sheet('portraits'); await new Promise(r => setTimeout(r, 200)); const rows = [...document.querySelectorAll('.ph-sheet .ph-reg')].map(r => r.textContent); const head = document.querySelector('.ph-sheet h3').textContent; document.querySelector('.ph-sheet .ph-close').click(); return { n: rows.length, head, a1: rows.find(r => r.startsWith('A1')) }; });
  check('T9 「絵の登録」の欄に、22人の配役それぞれの表情の登録の数と、使っている人が出る', t9.n === 22 && /肖像 3枚/.test(t9.head) && /表情 2\/8/.test(t9.a1 ?? ''), t9);
  await p.screenshot({ path: path.join(__dirname, 'out', '40-2d-pc.png') });

  // T10. PC と iPhone 相当の画面で、地図・人物・会話の欄が画面からはみ出さない
  const ui = async (pg, label) => pg.evaluate(async (label) => { const g = window.__goko, s = g.palace.screen; const w = ms => new Promise(r => setTimeout(r, ms));
    for (const a of ['ladiesStation', 'garden', 'consortQuarters']) { s.moveTo(a); if (s.here().length) break; } const n = s.here()[0]; g.palace.hud.openNpc(n.id); s.setTalking(n.id); await w(500);
    const inside = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.width > 0; };
    const over = (a, b) => { const r1 = document.querySelector(a).getBoundingClientRect(), r2 = document.querySelector(b).getBoundingClientRect(); return !(r1.right <= r2.left || r2.right <= r1.left || r1.bottom <= r2.top || r2.bottom <= r1.top); };
    const sideShown = getComputedStyle(document.querySelector('.ph-side')).display !== 'none';
    g.palace.hud.closeNpc(); await w(300); const sideIdle = inside('.ph-side'); g.palace.hud.openNpc(n.id); s.setTalking(n.id); await w(300);
    return { label, map: inside('.p2-map'), panel: inside('.ph-panel'), side: sideIdle, panelOverSide: sideShown && over('.ph-panel', '.ph-side'), hscroll: document.documentElement.scrollWidth > innerWidth + 1, w: innerWidth, h: innerHeight }; }, label);
  const pc = await ui(p, 'PC');
  const q = await open({ ...devices['iPhone 13 landscape'] });
  await q.evaluate(() => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); g.enterPalace(); });
  const ip = await ui(q, 'iPhone');
  await q.screenshot({ path: path.join(__dirname, 'out', '40-2d-iphone.png') });
  check('T10 PC(1280×800)と iPhone(横向き)の画面で、地図・会話の欄・右の列が画面に収まり、会話の欄が右の列に重ならない(iPhone では会話中だけ右の列を隠す)。横にはみ出さない', [pc, ip].every(x => x.map && x.panel && x.side && !x.panelOverSide && !x.hscroll), { pc, ip });

  for (const f of made) try { fs.unlinkSync(f); } catch { /* 消せなくても試験は続ける */ }
  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
})();
