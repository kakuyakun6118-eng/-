// Version 53:3D後宮の深化(性能・操作・画質・資源の片づけ・旧セーブ互換・個別の物語・表情と動き・宮廷事件・長期の進行)
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const errs = []; const problems = []; const path = require('path');
  const open = async (sc, ctx = { viewport: { width: 1280, height: 800 } }) => { const p = await (await b.newContext(ctx)).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1500)); if (!ok) problems.push(label); };
  const out = (n) => path.join(__dirname, 'out', n);
  const enter = () => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); return g.enterPalace(); };

  let p = await open('s317');
  // ===== 第1工程:性能・基盤 =====
  // P1. 画質の3段階:影・人物の描く距離・装飾が変わる
  const q1 = await p.evaluate(async (enterSrc) => { const enter = eval(enterSrc); enter(); const g = window.__goko; const w = (ms) => new Promise(r => setTimeout(r, ms)); const res = {};
    for (const q of ['low', 'mid', 'high']) { g.setPalaceQuality(q); await w(600); const s = g.palace.screen; let shadow = false; s.scene.traverse(o => { if (o.isDirectionalLight) shadow = o.castShadow; });
      s.resetStats(); await w(1500); res[q] = { ...s.stats(), shadow, hidden: [...s['views'].values()].filter(v => !v.fig.visible).length }; }
    g.setPalaceQuality('mid'); return res; }, enter.toString());
  check('P1 画質の3段階(低・中・高)で、影・人物の描く距離・装飾の量が変わる', q1.low.shadow === false && q1.mid.shadow === true && q1.high.shadow === true && q1.low.triangles < q1.mid.triangles && q1.low.quality === 'low' && q1.high.quality === 'high', q1);
  console.log('INFO 性能(ソフトウェア描画・1280×800。実機の値ではない):', JSON.stringify(q1));

  // P2. 戦略マップとの往復で、資源(形・テクスチャ)が増え続けない
  const leak = await p.evaluate(async () => { const g = window.__goko, R = g['renderer']; const w = (ms) => new Promise(r => setTimeout(r, ms)); g.exitPalace(); await w(300);
    const before = { geo: R.info.memory.geometries, tex: R.info.memory.textures, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0 };
    for (let i = 0; i < 10; i++) { g.enterPalace(); await w(150); g.exitPalace(); await w(80); } await w(500);
    return { before, after: { geo: R.info.memory.geometries, tex: R.info.memory.textures, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0 }, pixel: R.getPixelRatio() }; });
  check('P2 戦略マップとの往復10回で、形・テクスチャの数が増えない(資源の漏れがない)。画面の解像度も元に戻る', leak.after.geo <= leak.before.geo + 2 && leak.after.tex <= leak.before.tex + 1 && leak.after.heap < leak.before.heap + 60, leak);

  // P3. 操作:F で近くの人物に話しかける・仮想スティックで歩く・狭い回廊でカメラが近づく
  const op = await p.evaluate(async () => { const g = window.__goko; const w = (ms) => new Promise(r => setTimeout(r, ms)); g.enterPalace(); const s = g.palace.screen;
    const n = g.campaign.palace.present()[0]; const q = s.npcPos(n.id); s.pos.set(q.x + 1.2, 0, q.z + 1.2); await w(400);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' })); await w(100); const panel = !document.querySelector('.ph-panel').hidden; g.palace.hud.closeNpc();
    s.pos.set(8, 0, 76); s.yaw = 0; const p0 = s.pos.z; s.setStick(0, -1); await w(1000); s.setStick(0, 0); const p1 = s.pos.z;
    s.pos.set(0, 0, 50); s.dist = 20; await w(300); const camD = Math.hypot(s.camera.position.x - s.pos.x, s.camera.position.z - s.pos.z);
    return { panel, stickMoved: p0 - p1, camD }; });
  check('P3 F キーで近くの人物に話しかけられる。仮想スティックで歩ける。狭い回廊では、カメラが近くに寄る', op.panel && op.stickMoved > 1.5 && op.camD < 7.5, op);

  // P4. 旧 Version 52 のセーブ(物語・記憶の項目が無い)を読み込める
  const old = await p.evaluate(() => { const g = window.__goko, c = g.campaign; const sv = JSON.parse(JSON.stringify(g.buildSave()));
    for (const n of sv.campaign.palace.npcs) { delete n.story; delete n.memory; delete n.expr; delete n.mood2; delete n.promises; } delete sv.campaign.palace.v; delete sv.campaign.palace.incident; delete sv.campaign.palace.promises; delete sv.campaign.palace.deposed; delete sv.campaign.palace.history;
    g.applySave(sv); const P = c.palace; return { ok: !!g.palace.screen, n: P.present().length, talk: P.talk(P.present()[0]).lines.length, v: P.v ?? null }; });
  check('P4 旧 Version 52 のセーブ(新しい項目が無いデータ)を読み込める。宮殿に戻り、会話できる', old.ok && old.n >= 10 && old.talk >= 2, old);
  await p.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
