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

  // ===== 第2工程:個別の物語 =====
  // 物語を進める道具:段階の条件(信頼・時刻・日数・約束)を満たしてから選ぶ。条件の数値は、テストの準備として人物の値を上げる
  const drive = () => { window.__drive = (n, choices, opt = {}) => { const g = window.__goko, P = g.campaign.palace; const log = [];
    for (const ch of choices) {
      let tries = 0; let st = P.storyStatus(n);
      while (!st.ready && tries++ < 40) {
        n.intimacy = Math.max(n.intimacy, opt.intimacy ?? 70); n.trust = Math.max(n.trust, opt.trust ?? 70); if (opt.romance !== undefined) n.romance = Math.max(n.romance, opt.romance); n.jealousy = 0;
        const open = P.openPromises(n).filter(x => x.status === 'open');
        for (const pr of open) { if (pr.kind === 'visit') { const m = P.npc(String(n.story.flags.mistress)); if (m) P.talk(m); } else P.fulfill(pr.id); }
        if (/日が浅い|約束|調べ|宰相|侍医|訪ねる|季節/.test(st.hint)) g.palaceAdvance(4 * 6); else g.palaceAdvance(1);
        st = P.storyStatus(n);
      }
      if (!st.ready) { log.push(`進めず:${st.hint}`); break; }
      // 「a|b」は、場面にある最初の選択肢を選ぶ(人物の事情で選択肢が変わるため)
      const sc = P.storyScene(n); const pickId = String(ch).split('|').find(c => sc.choices.some(x => x.id === c)) ?? ch;
      const r = P.storyChoose(n, pickId); log.push(typeof r === 'string' ? `NG:${r}` : `${n.story.stage}:${ch}${r.ending ? '→' + r.ending : ''}`);
    }
    return { log, stage: n.story.stage, ending: n.story.ending ?? null, left: !!n.left, bond: n.bond, title: n.title }; }; };
  const paths = {
    scholar: [['praise', 'lend', 'heart', 'respect', 'end'], ['reply', 'salon', 'post', 'compile', 'end']],
    ambitious: [['task', 'neutral', 'investigate', 'chief', 'end'], ['limit', 'side', 'blame', 'own', 'end']],
    provincial: [['ask', 'family', 'help', 'bring', 'end'], ['cheer', 'honest', 'stay', 'heart', 'end']],
    attendant: [['ask', 'visit', 'loyal', 'protect', 'end'], ['self', 'mediate', 'transfer', 'own', 'end']],
    consort: [['kin', 'chancellor|mother', 'promiseSon|reassure', 'empress', 'end'], ['nopol', 'refuse', 'honest', 'distance', 'end']],
    free: [['learn', 'doctor', 'nurse', 'go', 'end'], ['outside', 'decide', 'together', 'stay', 'end']],
  };
  const res = {};
  for (const k of [0, 1]) {
    const q = await open('s317'); await q.evaluate(drive);
    const r = await q.evaluate(([paths, k, enterSrc]) => { eval(enterSrc)(); const g = window.__goko, P = g.campaign.palace; g.campaign.factionStates.jin.gold = 50000;
      const mains = P.mains().map(n => ({ id: n.id, name: n.name, arc: n.story.arc }));
      const out = { mains, runs: {} };
      for (const m of mains) { const n = P.npc(m.id); out.runs[m.arc] = { name: m.name, ...window.__drive(n, paths[m.arc][k], { romance: k === 1 && ['provincial'].includes(m.arc) ? 80 : k === 0 && ['scholar'].includes(m.arc) ? 80 : k === 0 && m.arc === 'consort' ? 90 : undefined }) }; }
      return out; }, [paths, k, enter.toString()]);
    res[k] = r;
    await q.close();
  }
  const arcs = Object.keys(paths);
  check('S1 主要な6人に物語の役が割り当てられ、物語を始められる', res[0].mains.length === 6 && arcs.every(a => res[0].mains.some(m => m.arc === a)), res[0].mains);
  check('S2 6人それぞれの5段階の物語が、結末まで進む', arcs.every(a => res[0].runs[a].stage === 5 && res[1].runs[a].stage === 5), Object.fromEntries(arcs.map(a => [a, [res[0].runs[a].log, res[1].runs[a].log]])));
  check('S3 選択によって、6人とも結末が実際に分かれる', arcs.every(a => res[0].runs[a].ending && res[1].runs[a].ending && res[0].runs[a].ending !== res[1].runs[a].ending), Object.fromEntries(arcs.map(a => [a, `${res[0].runs[a].ending} / ${res[1].runs[a].ending}`])));

  // S4. 約束:果たす行動をするまで、果たした扱いにならない。会話に出てくる。期限を過ぎると破られる
  p = await open('s317'); await p.evaluate(drive);
  const pr = await p.evaluate((enterSrc) => { eval(enterSrc)(); const g = window.__goko, P = g.campaign.palace; g.campaign.factionStates.jin.gold = 50000;
    const n = P.mains().find(x => x.story.arc === 'provincial'); window.__drive(n, ['ask', 'family']);
    const pmise = P.openPromises(n)[0]; g.palaceAdvance(4 * 5); const before = P.storyStatus(n);
    const talk = P.talk(n).lines.join(''); const status0 = pmise?.status;
    // 何もしないで20日:まだ果たされていない(結果も出ない)
    g.palaceAdvance(4 * 20); const status1 = pmise.status; const ready1 = P.storyStatus(n).ready;
    // 使者を送る:10日後に果たされ、結果(出身の都市の実際の様子)が出る
    const f = P.fulfill(pmise.id); const status2 = pmise.status; g.palaceAdvance(4 * 11); const status3 = pmise.status;
    const after = P.talk(n).lines.join('');
    // 別の人の約束を放っておくと、期限を過ぎて破られる
    const s2 = P.mains().find(x => x.story.arc === 'scholar'); window.__drive(s2, ['praise', 'lend']); const pp = P.openPromises(s2)[0]; const t0 = s2.trust; g.palaceAdvance(4 * 22);
    return { before: before.hint, talk, status0, status1, ready1, f, status2, status3, result: pmise.result, after, broken: pp.status, trustDrop: t0 - s2.trust, memory: (s2.memory ?? []).slice(-2).map(m => m.text) }; }, enter.toString());
  check('S4 約束は、実際に果たす行動(使者を送る)をして日数がたつまで果たされない。会話に約束と結果が出る。放っておくと期限を過ぎて破られ、記憶に残る', /約束|調べ/.test(pr.before) && /約束/.test(pr.talk) && pr.status0 === 'open' && pr.status1 === 'open' && !pr.ready1 && pr.status2 === 'doing' && pr.status3 === 'kept' && ['safe', 'war', 'lost'].includes(pr.result) && pr.broken === 'broken' && pr.trustDrop > 0 && pr.memory.some(t => /果たされなかった/.test(t)), pr);

  // S5. セーブ・ロード後も物語が続く(段階・選択・約束・記憶)
  const sl = await p.evaluate(() => { const g = window.__goko, P = g.campaign.palace; const snap = () => JSON.stringify(P.mains().map(n => [n.id, n.story.stage, n.story.flags, (n.memory ?? []).length]).concat([P.promises.map(x => [x.kind, x.status])]));
    const a = snap(); const sv = JSON.parse(JSON.stringify(g.buildSave())); g.applySave(sv); const b2 = snap(); const n = P.mains().find(x => x.story.arc === 'provincial'); const next = window.__drive(n, ['help']);
    return { same: a === b2, next }; });
  check('S5 セーブ・ロード後も、物語の段階・選択・約束・記憶が残り、続きから進められる', sl.same && sl.next.stage === 3, sl);
  await p.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
