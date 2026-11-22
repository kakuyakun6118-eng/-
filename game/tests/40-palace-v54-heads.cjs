// Version 54:写実寄りの3Dの頭(MakeHuman CC0 の素材から作った GLB)の読み込み・表情・動き・人ごとの顔・会話のカメラ・資源の片づけ・画質・旧セーブ
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const errs = []; const problems = [];
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1500)); if (!ok) problems.push(label); };
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto('file://' + process.argv[2] + '#s=s317'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
  // 準備:宮殿に入り、全員に写実の顔を付ける(画質:高)
  const setup = await p.evaluate(async () => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); g.enterPalace(); const w = ms => new Promise(r => setTimeout(r, ms));
    g.setPalaceQuality('high'); await w(500); const s = g.palace.screen; s.realHeads = 'all';
    for (let i = 0; i < 80 && !s['kit']; i++) await w(250);
    const v = [...s.views.values()][0]; v.path = []; v.seat = undefined; v.wanderAt = 1e12; v.fig.position.set(9, 0, 20.5); v.fig.rotation.y = 0; s.pos.set(9, 0, 22.5);
    for (let i = 0; i < 40 && !v.body.real; i++) await w(250);
    window.__v = v; return { kit: !!s['kit'], head: !!v.body.real }; });

  // H1. 頭の素が読み込め、形を持った顔(三角形の数・表情のモーフ)がある
  const h1 = await p.evaluate(() => { const s = window.__goko.palace.screen, k = s['kit']; const parts = k.parts.map(x => x.name); const skin = k.parts.find(x => x.name === 'skin');
    const tris = skin.geometry.index.count / 3; const morphs = (skin.geometry.morphAttributes.position ?? []).length; const h = window.__v.body.real;
    return { parts, tris, morphs, active: h.root.children[0].morphTargetInfluences.length, landmarks: k.landmarks }; });
  check('H1 写実の頭(GLB)が読み込め、肌・まつげ・眼球・角膜・歯・髪の部分がある。顔は形を持つメッシュ(三角形 8,000 以上)で、表情のモーフが 10 ある', setup.kit && setup.head && ['skin', 'lashes', 'eyes', 'cornea', 'mouth', 'hair'].every(n => h1.parts.includes(n)) && h1.tris > 8000 && h1.morphs >= 29 && h1.active === 10, h1);

  // H2. 顔の絵(肌の色・化粧)が貼られている
  const h2 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); await w(500); const k = window.__goko.palace.screen['kit']; const out = {};
    for (const [st, m] of Object.entries(k.skinMats)) out[st] = { map: !!m.map, w: m.map?.image?.width ?? 0, rough: !!m.roughnessMap };
    return out; });
  check('H2 顔の絵(皇后・妃・女官の3種の化粧)と、肌の粗さの絵が貼られている(2048×2048)', Object.values(h2).every(x => x.map && x.w >= 1024 && x.rough), h2);

  // H3. 表情を変えても、形が崩れない(位置が有限・大きさがほぼ同じ)。表情のモーフが実際に効く
  const h3 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const v = window.__v, h = v.body.real; const out = {};
    const mesh = h.root.children[0]; const base = mesh.geometry.boundingSphere.radius;
    for (const e of ['normal', 'smile', 'joy', 'shy', 'sad', 'angry', 'puzzled', 'surprised']) {
      v.npc.expr = e; await w(700);
      const inf = h.influences(); const pos = mesh.geometry.attributes.position.array; let finite = true; for (let i = 0; i < pos.length; i += 97) if (!Number.isFinite(pos[i])) finite = false;
      // モーフを足した後の位置の、最大のずれ(m)
      let maxd = 0; const morphs = mesh.geometry.morphAttributes.position; const infl = mesh.morphTargetInfluences;
      for (let k = 0; k < morphs.length; k++) { if (!infl[k]) continue; const a = morphs[k].array; for (let i = 0; i < a.length; i += 3) maxd = Math.max(maxd, Math.hypot(a[i], a[i + 1], a[i + 2]) * infl[k]); }
      out[e] = { main: e === 'normal' ? 0 : inf[e], finite, maxd: +maxd.toFixed(4) };
    }
    v.npc.expr = 'normal'; return { base: +base.toFixed(3), out }; });
  check('H3 8つの表情で、顔の形が崩れない(位置は有限、動く量は 2.5cm 以内)。各表情のモーフが実際に効く', Object.entries(h3.out).every(([e, x]) => x.finite && x.maxd < 0.025 && (e === 'normal' || x.main > 0.5)), h3);

  // H4. 歩く・座る・話す:骨組みが動き、話すと口が開け閉めする(写実の頭を付けたまま)
  const h4 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const v = window.__v, f = v.body, h = f.real; const samp = (pose, n, dt) => { const out = []; for (let i = 0; i < n; i++) { f.setPose(pose); f.update(dt, performance.now() / 1000 + i * dt, pose === 'walk' ? 1.5 : 0); out.push(f.joints()); } return out; };
    const walk = samp('walk', 8, 0.15); const sit = samp('sit', 12, 0.2); const talkOpen = []; for (let i = 0; i < 16; i++) { f.setPose('talk'); f.update(0.05, i * 0.05, 0); talkOpen.push(h.influences().talkA + h.influences().talkO); }
    const sp = (a, k) => Math.max(...a.map(j => j[k])) - Math.min(...a.map(j => j[k]));
    f.setPose('stand'); return { walkFoot: sp(walk, 'footL'), sitHips: walk[0].hipsY - sit[sit.length - 1].hipsY, talkMax: Math.max(...talkOpen), talkMin: Math.min(...talkOpen), stillReal: !!f.real }; });
  check('H4 写実の頭を付けたまま、歩く(足が振れる)・座る(腰が下がる)・話す(口が開け閉めする)が動く', h4.walkFoot > 0.1 && h4.sitHips > 0.15 && h4.talkMax > 0.2 && h4.talkMin < h4.talkMax * 0.6 && h4.stillReal, h4);

  // H5. 人ごとに顔の形が違う(同じ顔の色違いではない)
  const h5 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const g = window.__goko, s = g.palace.screen;
    const vs = [...s.views.values()].slice(0, 5); vs.forEach((v, i) => { v.path = []; v.seat = undefined; v.wanderAt = 1e12; v.fig.position.set(8 + i * 0.9, 0, 20.5); }); s.pos.set(10, 0, 22.5); await w(2500);
    const heads = vs.filter(v => v.body.real); const arr = heads.map(v => v.body.real.root.children[0].geometry.attributes.position.array);
    let minDiff = 1; for (let a = 0; a < arr.length; a++) for (let c = a + 1; c < arr.length; c++) { let sum = 0, n = 0; for (let i = 0; i < arr[a].length; i += 3) { sum += Math.hypot(arr[a][i] - arr[c][i], arr[a][i + 1] - arr[c][i + 1], arr[a][i + 2] - arr[c][i + 2]); n++; } minDiff = Math.min(minDiff, sum / n); }
    return { n: heads.length, minDiffMm: +(minDiff * 1000).toFixed(2), styles: heads.map(v => v.body.real.style), shapes: heads.slice(0, 3).map(v => Object.entries(v.body.real.shape).filter(([, x]) => x > 0.3).map(([k]) => k).join(',')) }; });
  check('H5 人ごとに、顔の形(輪郭・鼻・唇・目など)が違う。どの2人も、頂点の平均で 0.5mm 以上違う', h5.n >= 3 && h5.minDiffMm > 0.5, h5);

  // H6. 会話中は、カメラが相手の顔に寄り、顔が画面の上の方に見える
  const h6 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const g = window.__goko, s = g.palace.screen; const v = window.__v; s.pos.set(v.fig.position.x + 0.6, 0, v.fig.position.z + 1.5);
    const far = s.camera.position.distanceTo(v.body.faceWorld()); s.setTalking(v.npc.id); await w(2500); const face = v.body.faceWorld(); const d = s.camera.position.distanceTo(face); const ndc = face.clone().project(s.camera); s.setTalking(null);
    return { far: +far.toFixed(2), d: +d.toFixed(2), ndcY: +ndc.y.toFixed(2), ndcX: +ndc.x.toFixed(2) }; });
  await p.screenshot({ path: require('path').join(__dirname, 'out', '40-talk.png') });
  check('H6 会話中は、カメラが相手の顔に近づき(2m 以内)、顔が画面の上半分・中ほどに入る', h6.d < 2 && h6.d < h6.far && h6.ndcY > 0 && h6.ndcY < 1 && Math.abs(h6.ndcX) < 0.8, h6);

  // H7. 戦略マップとの往復10回で、頭の形・絵が残らない(人ごとの頭は片づけられ、共有の素だけが残る)
  const h7 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const g = window.__goko, R = g['renderer']; g.exitPalace(); await w(400); gc?.(); const k = g.palace.screen; const kit0 = window.__v.body;
    const before = { geo: R.info.memory.geometries, tex: R.info.memory.textures, heap: Math.round(performance.memory.usedJSHeapSize / 1e6) };
    for (let i = 0; i < 10; i++) { g.enterPalace(); const s = g.palace.screen; s.realHeads = 'all'; await w(1200); g.exitPalace(); await w(150); }
    await w(800); gc?.(); gc?.();
    return { before, after: { geo: R.info.memory.geometries, tex: R.info.memory.textures, heap: Math.round(performance.memory.usedJSHeapSize / 1e6) } }; });
  check('H7 戦略マップとの往復10回(毎回、写実の頭を付ける)で、形・絵の数とメモリが増え続けない', h7.after.geo <= h7.before.geo + 3 && h7.after.tex <= h7.before.tex + 2 && h7.after.heap < h7.before.heap + 40, h7);

  // H8. 画質の低・中・高で、写実の頭の人数の上限が変わる(低:1人・中:4人・高:7人まで)
  const h8 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const g = window.__goko; g.enterPalace(); const out = {};
    for (const q of ['low', 'mid', 'high']) { g.setPalaceQuality(q); await w(400); const s = g.palace.screen; s.realHeads = 'all'; for (let i = 0; i < 40 && !s['kit']; i++) await w(100);
      const vs = [...s.views.values()].slice(0, 9); vs.forEach((v, i) => { v.path = []; v.seat = undefined; v.wanderAt = 1e12; v.fig.position.set(6 + i * 0.7, 0, 20.5); }); s.pos.set(9, 0, 22); await w(2500);
      out[q] = s.realHeadIds().length; }
    g.setPalaceQuality('mid'); return out; });
  check('H8 画質の低・中・高で、写実の頭を付ける人数が変わる(低 1・中 4・高 7 まで。どの画質でも付く)', h8.low >= 1 && h8.low <= 1 && h8.mid <= 4 && h8.mid > h8.low && h8.high <= 7 && h8.high > h8.mid, h8);

  // H9. 2年進めても、ゲームの記録が壊れず、写実の頭も付く(20年は試験39で確かめる)
  const h9 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const g = window.__goko, P = g.campaign.palace; for (let i = 0; i < 24; i++) { g.palaceAdvance(120); await w(0); }
    const s = g.palace.screen; s.realHeads = 'all'; const v = [...s.views.values()][0]; v.path = []; v.seat = undefined; v.wanderAt = 1e12; s.pos.set(v.fig.position.x, 0, v.fig.position.z + 1.5); await w(2500);
    const sv = JSON.stringify(g.buildSave()); return { date: g.campaign.dateText(), present: P.present().length, head: !!v.body.real, saveKB: Math.round(sv.length / 1024), ok: P.present().every(n => n.name && n.relations) }; });
  check('H9 2年進めても、後宮の人物の記録が壊れず、写実の頭も付く', h9.ok && h9.present > 5 && h9.head, h9);

  // H10. Version 53 のセーブ(顔の形の項目が無い)を読み込める。顔の形は人ごとの種から決まる
  const h10 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const g = window.__goko; const sv = JSON.parse(JSON.stringify(g.buildSave()));
    const pal = sv.campaign.palace; for (const n of pal.npcs) delete n.shape; pal.v = 53; g.applySave(sv); await w(800);
    const s = g.palace.screen; if (!s) return { noScreen: true }; s.realHeads = 'all'; const v = [...s.views.values()][0]; v.path = []; v.seat = undefined; v.wanderAt = 1e12; s.pos.set(v.fig.position.x, 0, v.fig.position.z + 1.5); for (let i = 0; i < 40 && !v.body.real; i++) await w(150);
    return { head: !!v.body.real, shapeKeys: v.body.real ? Object.keys(v.body.real.shape).length : 0, present: g.campaign.palace.present().length }; });
  check('H10 Version 53 のセーブ(顔の形の項目が無い)を読み込め、宮殿に戻り、写実の頭が付く', h10.head && h10.shapeKeys > 10 && h10.present > 5, h10);

  // H11. 画面の「顔」のボタンで、試作の3人・全員・従来を切り替えられる
  const h11 = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const g = window.__goko, s = g.palace.screen; const btn = document.querySelector('.ph-faces'); const seen = [];
    for (let i = 0; i < 3; i++) { btn.click(); await w(1200); seen.push([btn.textContent, s.realHeads, s.realHeadIds().length]); } return seen; });
  check('H11 画面の「顔」ボタンで、写実の顔を付ける人(試作の3人・全員・従来)を切り替えられる。「従来」では、写実の頭を外す', h11.some(x => x[1] === 'off' && x[2] === 0) && h11.some(x => x[1] === 'all') && h11.some(x => x[1] === 'proto'), h11);

  console.log('errors:', errs.slice(0, 3));
  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
})();
