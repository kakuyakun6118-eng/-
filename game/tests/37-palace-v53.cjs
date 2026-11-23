// Version 53:3D後宮の深化(性能・操作・画質・資源の片づけ・旧セーブ互換・個別の物語・表情と動き・宮廷事件・長期の進行)
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const errs = []; const problems = []; const path = require('path');
  const open = async (sc, ctx = { viewport: { width: 1280, height: 800 } }) => { const p = await (await b.newContext(ctx)).newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 300))); await p.goto('file://' + process.argv[2] + '#s=' + sc); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 }); return p; };
  const check = (label, ok, info) => { console.log((ok ? 'OK ' : 'NG ') + label, info === undefined ? '' : JSON.stringify(info).slice(0, 1500)); if (!ok) problems.push(label); };
  const out = (n) => path.join(__dirname, 'out', n);
  const enter = () => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); return g.enterPalace(); };

  let p = await open('s317');
  // ===== 第1工程:性能・基盤 =====
  // Version 54 で皇帝生活モードを完全2Dにしたため、3Dの画質(影・描く距離)・3Dの資源・3Dの操作(F キー・スティック・カメラ)の試験を、
  // 2Dの画面の同じ目的の試験(時刻の光・往復での片づけ・人物を押して話す)に置き換えた。
  // P1. 時刻(朝・昼・夕・夜)で、背景の光が変わる
  const q1 = await p.evaluate(async (enterSrc) => { eval(enterSrc)(); const g = window.__goko, s = g.palace.screen, P = g.campaign.palace; const w = (ms) => new Promise(r => setTimeout(r, ms)); const res = {};
    for (const slot of [0, 1, 2, 3]) { P.slot = slot; s.onSlotChanged(false); await w(150); const t = document.querySelector('.p2-tint'); res[slot] = { time: t.dataset.time, bg: getComputedStyle(t).backgroundImage.slice(0, 40) }; }
    return res; }, enter.toString());
  check('P1 (2D化)朝・昼・夕・夜で、背景に重ねる光(朝もや・夕焼け・夜の灯火)が変わる', ['morning', 'day', 'evening', 'night'].every((t, i) => q1[i].time === t) && q1[3].bg !== q1[1].bg, q1);

  // P2. 戦略マップとの往復で、2Dの画面の部品・画像が残らない(資源の漏れがない)。3Dの宮殿の形・テクスチャは作られない
  const leak = await p.evaluate(async () => { const g = window.__goko, R = g['renderer']; const w = (ms) => new Promise(r => setTimeout(r, ms)); g.exitPalace(); await w(300);
    const count = () => ({ geo: R.info.memory.geometries, tex: R.info.memory.textures, stages: document.querySelectorAll('.p2-stage').length, imgs: document.querySelectorAll('img').length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0 });
    const before = count(); for (let i = 0; i < 10; i++) { g.enterPalace(); await w(150); g.exitPalace(); await w(80); } await w(500); window.gc?.(); return { before, after: count() }; });
  check('P2 (2D化)戦略マップとの往復10回で、2Dの画面の部品・画像が残らず、3Dの形・テクスチャも増えない', leak.after.stages === 0 && leak.after.imgs <= leak.before.imgs && leak.after.geo <= leak.before.geo + 2 && leak.after.tex <= leak.before.tex + 1, leak);

  // P3. 人物の肖像を押すと話しかけ、相手が大きく出る。閉じると戻る
  const op = await p.evaluate(async () => { const g = window.__goko; const w = (ms) => new Promise(r => setTimeout(r, ms)); g.enterPalace(); const s = g.palace.screen;
    for (const a of ['garden', 'ladiesStation', 'consortQuarters', 'empressPalace']) { s.moveTo(a); if (s.here().length) break; }
    const id = s.here()[0].id; document.querySelector(`.p2-person[data-npc="${id}"]`).click(); await w(400); const panel = !document.querySelector('.ph-panel').hidden; const focus = !document.querySelector('.p2-focus').hidden;
    g.palace.hud.closeNpc(); await w(200); return { panel, focus, closed: document.querySelector('.p2-focus').hidden }; });
  check('P3 (2D化)人物の肖像を押すと交流の欄が開き、相手の肖像が大きく出る。閉じると元に戻る', op.panel && op.focus && op.closed, op);

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

  // ===== 第3工程:人物の演出・表情・居場所・環境音 =====
  // Version 54 の2D化で、3Dの骨組みの動き(歩く・座る)と3Dの居場所の試験を、2Dの演出(現れ方・表情の入れ替え)と区画の一致の試験に置き換えた
  p = await open('s317');
  // G1. 人物は、ふわっと現れる(順に少しずつ遅れて)。会話の相手の肖像は、2枚を重ねて入れ替える
  const an = await p.evaluate(async (enterSrc) => { eval(enterSrc)(); const g = window.__goko, s = g.palace.screen; const w = (ms) => new Promise(r => setTimeout(r, ms));
    for (const a of ['ladiesStation', 'garden', 'consortQuarters']) { s.moveTo(a); if (s.here().length >= 2) break; }
    const els = [...document.querySelectorAll('.p2-person')]; const anim = els.map(e => getComputedStyle(e).animationName); const delays = els.map(e => getComputedStyle(e).animationDelay);
    const n = s.here()[0]; g.palace.hud.openNpc(n.id); s.setTalking(n.id); await w(300); const on1 = [...document.querySelectorAll('.p2-focus img')].map(i => i.classList.contains('on'));
    n.expr = n.expr === 'joy' ? 'sad' : 'joy'; await w(500); const on2 = [...document.querySelectorAll('.p2-focus img')].map(i => i.classList.contains('on'));
    g.palace.hud.closeNpc(); return { anim: [...new Set(anim)], delays: delays.slice(0, 3), on1, on2, changes: s.counts.exprChanges }; }, enter.toString());
  check('G1 (2D化)人物は順に少しずつ遅れてふわっと現れる。会話の相手の肖像は、表情が変わると2枚を重ねてなめらかに入れ替える', an.anim.includes('p2-in') && new Set(an.delays).size > 1 && JSON.stringify(an.on1) !== JSON.stringify(an.on2) && an.changes >= 2, an);

  // G2. 表情が会話と結びつく:贈り物・話の結果で表情が変わり、大きな肖像に同じ表情が出る
  const ex = await p.evaluate(async () => { const g = window.__goko, P = g.campaign.palace, s = g.palace.screen; const w = (ms) => new Promise(r => setTimeout(r, ms)); g.campaign.factionStates.jin.gold = 50000;
    for (const a of ['ladiesStation', 'garden', 'consortQuarters']) { s.moveTo(a); if (s.here().length) break; }
    const n = s.here()[0]; g.palace.hud.openNpc(n.id); s.setTalking(n.id); const r1 = P.gift(n, 'silk'); await w(400); const after = [n.expr, s.stats().focusExpr];
    n.expr = undefined; n.mood = 10; await w(400); const low = s.stats().focusExpr; n.mood = 90; await w(400); const high = s.stats().focusExpr; g.palace.hud.closeNpc();
    return { after, low, high, gift: !!r1 }; });
  check('G2 会話・贈り物の結果で表情が変わり、大きな肖像に同じ表情が出る。気分が沈むと悲しい顔、晴れると笑顔になる', ex.after[0] && ex.after[0] === ex.after[1] && ex.low !== ex.high && ['sad', 'angry', 'puzzled'].includes(ex.low) && ['smile', 'joy'].includes(ex.high), ex);

  // G3. 居場所の一貫性:時刻の予定(どの区画にいるか)と、画面に出る人が合う。いない人は出ない。時刻が変わると入れ替わる
  const loc = await p.evaluate(async () => { const g = window.__goko, P = g.campaign.palace, s = g.palace.screen; const w = (ms) => new Promise(r => setTimeout(r, ms)); const res = [];
    for (let k = 0; k < 4; k++) { g.palaceAdvance(1); await w(300); let wrong = 0, shown = 0, total = 0;
      for (const a of ['emperorHall', 'empressPalace', 'consortQuarters', 'ladiesStation', 'garden', 'bath', 'banquet', 'corridor']) { s.moveTo(a); await w(30); const ids = [...document.querySelectorAll('.p2-person')].map(e => e.dataset.npc); shown += ids.length; wrong += ids.filter(id => P.whereAt(P.npc(id)).area !== a).length; }
      total = P.present().length; res.push({ slot: P.slot, shown, total, wrong }); }
    return res; });
  check('G3 (2D化)時刻ごとの予定の区画と、画面に出る人が合う。8区画を合わせると全員がちょうど1回ずつ出て、いない人は出ない', loc.every(r => r.wrong === 0 && r.shown === r.total), loc);

  // G4. 環境音(合成音):場所で、鳴る音が変わる
  await p.keyboard.press('Shift');
  const am = await p.evaluate(async () => { const g = window.__goko, s = g.palace.screen; const w = (ms) => new Promise(r => setTimeout(r, ms)); await g.bgm?.unlock?.(); for (let i = 0; i < 10 && !g.palace.ambience; i++) await w(200);
    const a = g.palace.ambience; if (!a) return { none: true }; const c0 = a.state().counts; s.moveTo('garden'); await w(1500); const garden = a.state();
    s.moveTo('emperorHall'); await w(1200); const inside = a.state(); return { c0, garden, inside }; });
  if (am.none) console.log('INFO G4 この試験環境では音の出力(AudioContext)が作られなかったため、環境音の確かめを省いた');
  else check('G4 環境音(録音ではなく合成音):庭園では水の音・風の音が強く、室内では弱まる', am.garden.water > am.inside.water && am.garden.wind >= am.inside.wind, am);
  await p.close();

  await b.close();
  if (problems.length) { console.log('問題:', problems); process.exit(1); }
  console.log('errors:', errs.slice(0, 3));
})();
