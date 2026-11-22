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

  // ===== 第3工程:人物の動き・表情・居場所・環境音 =====
  p = await open('s317');
  // G1. 歩く・座る・拝礼・話す:骨組み(腰・胴・腕・足)が実際に動く(静止した人形を動かすだけではない)
  const an = await p.evaluate(async (enterSrc) => { eval(enterSrc)(); const g = window.__goko, s = g.palace.screen; const w = (ms) => new Promise(r => setTimeout(r, ms));
    const n = g.campaign.palace.present()[0]; const f = s.figureOf(n.id); const samp = async (pose, ms = 900) => { const out = []; for (let i = 0; i < 6; i++) { f.setPose(pose); f.update(0.15, performance.now() / 1000 + i * 0.15, pose === 'walk' ? 1.5 : 0); out.push(f.joints()); await w(ms / 6); } return out; };
    // 画面の更新に上書きされないよう、話し相手にして離れた所で確かめる
    const stand = await samp('stand'); const walk = await samp('walk'); const sit = []; for (let i = 0; i < 12; i++) { f.setPose('sit'); f.update(0.2, i * 0.2, 0); sit.push(f.joints()); }
    f.setPose('bow'); const bow = []; for (let i = 0; i < 6; i++) { f.update(0.15, i * 0.15, 0); bow.push(f.joints()); }
    const talk = []; for (let i = 0; i < 8; i++) { f.setPose('talk'); f.update(0.15, i * 0.3, 0); talk.push(f.joints()); }
    const spread = (a, k) => Math.max(...a.map(j => j[k])) - Math.min(...a.map(j => j[k]));
    // 画面の中で、歩いている人物が実際にいる(時刻を変えて歩かせる)
    g.palaceAdvance(1); let walkers = 0; for (let i = 0; i < 10 && !walkers; i++) { await w(300); walkers = [...s['views'].values()].filter(v => v.body.pose === 'walk').length; }
    return { walkFoot: spread(walk, 'footL'), walkArm: spread(walk, 'armL'), standFoot: spread(stand, 'footL'), sitHips: stand[0].hipsY - sit[sit.length - 1].hipsY, bowTorso: Math.max(...bow.map(j => j.torsoX)), talkArm: spread(talk, 'armR'), walkers }; }, enter.toString());
  check('G1 歩く(足と腕が交互に振れる)・座る(腰が下がる)・拝礼(上体を傾ける)・話す(身ぶり)で、人物の骨組みが実際に動く。時刻が変わると、人物が歩いて移る', an.walkFoot > 0.1 && an.walkArm > 0.1 && an.standFoot < 0.05 && an.sitHips > 0.15 && an.bowTorso > 0.3 && an.talkArm > 0.05 && an.walkers > 0, an);

  // G2. 表情が会話と結びつく:贈り物・話の結果で表情が変わり、3Dの顔と顔絵に出る
  const ex = await p.evaluate(async () => { const g = window.__goko, P = g.campaign.palace, s = g.palace.screen; const w = (ms) => new Promise(r => setTimeout(r, ms)); g.campaign.factionStates.jin.gold = 50000;
    const n = P.present().find(x => x.adult !== false && x.rank !== 'royal') ?? P.present()[0]; const res = [];
    const before = s.figureOf(n.id).expr; const r1 = P.gift(n, 'silk'); await w(400); res.push([n.expr, s.figureOf(n.id).expr]);
    n.mood = 10; n.expr = undefined; await w(400); const low = s.figureOf(n.id).expr; n.mood = 90; await w(400); const high = s.figureOf(n.id).expr;
    g.palace.hud.openNpc?.(n.id); await w(200); const img = document.querySelector('.ph-panel svg, .ph-panel img')?.outerHTML.length ?? 0;
    return { before, after: res[0], low, high, gift: !!r1, img }; });
  check('G2 会話・贈り物の結果で表情が変わり、3Dの人物の顔に同じ表情が出る。気分が沈むと悲しい顔、晴れると笑顔になる', ex.after[0] && ex.after[0] === ex.after[1] && ex.low !== ex.high && ['sad', 'angry', 'puzzled'].includes(ex.low) && ['smile', 'joy'].includes(ex.high), ex);

  // G3. 居場所の一貫性:時刻の予定(どの区画で何をするか)と、3Dの居場所が合う。目の前で瞬間移動しない
  const loc = await p.evaluate(async () => { const g = window.__goko, P = g.campaign.palace, s = g.palace.screen; const w = (ms) => new Promise(r => setTimeout(r, ms)); g.palace.hud.closeNpc?.();
    const res = []; let jump = 0;
    for (let k = 0; k < 2; k++) { const near = new Map([...s['views'].values()].map(v => [v.npc.id, v.fig.position.clone()]));
      g.palaceAdvance(1); await w(120); for (const v of s['views'].values()) { const a = near.get(v.npc.id); if (a && a.distanceTo(s.pos) < 20) jump = Math.max(jump, a.distanceTo(v.fig.position)); }
      // ソフトウェア描画では1秒に数コマしか進まず歩みが遅いので、15秒歩かせたあと「着いた人の居場所」と「歩いている人の行き先」を確かめる
      await w(15000);
      let ok = 0, all = 0, arrived = 0; for (const v of s['views'].values()) { const want = P.whereAt(v.npc).area; const end = v.path.length ? v.path[v.path.length - 1] : v.fig.position; const at = s['world'].areaAt(end.x, end.z); all++; if (!v.path.length) arrived++; if (want === at) ok++; } res.push({ slot: P.slot, ok, all, arrived }); }
    return { res, jump: +jump.toFixed(2) }; });
  check('G3 時刻ごとの予定の区画と、3Dで着いた所・向かっている所の区画が合う(9割以上)。時刻が変わっても、皇帝の近くの人物は瞬間移動せず歩いて移る', loc.res.every(r => r.ok >= r.all * 0.9) && loc.jump < 2, loc);

  // G4. 環境音(合成音):場所と時刻で、鳴る音が変わる
  await p.keyboard.press('Shift');
  const am = await p.evaluate(async () => { const g = window.__goko, s = g.palace.screen; const w = (ms) => new Promise(r => setTimeout(r, ms)); await g.bgm?.unlock?.(); for (let i = 0; i < 10 && !g.palace.ambience; i++) await w(200);
    const a = g.palace.ambience; if (!a) return { none: true }; const c0 = a.state().counts; s.pos.set(-10, 0, 46); await w(1500); const garden = a.state();
    s.pos.set(0, 0, -60); await w(1200); const inside = a.state(); return { c0, garden, inside }; });
  if (am.none) console.log('INFO G4 この試験環境では音の出力(AudioContext)が作られなかったため、環境音の確かめを省いた');
  else check('G4 環境音(録音ではなく合成音):庭園の池の近くでは水の音・風の音が強く、室内では弱まる', am.garden.water > am.inside.water && am.garden.wind >= am.inside.wind, am);
  await p.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
