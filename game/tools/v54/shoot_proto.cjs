// 試作3人の比較画像(ソフトウェア描画)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
 const D = process.argv[3];
 const p = await (await b.newContext({ viewport: { width: 900, height: 900 } })).newPage(); const errs=[]; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.text().slice(0,200)); });
 await p.goto('file://' + process.argv[2] + '#s=s317'); await p.waitForFunction(() => window.__goko, null, { timeout: 120000 });
 const info = await p.evaluate(async () => { const g = window.__goko; g.campaign.speed = 0; g.changeSettings({ playerFactionId: 'jin' }); g.enterPalace(); const P = g.campaign.palace; const w = ms => new Promise(r => setTimeout(r, ms));
  g.campaign.factionStates.jin.gold = 50000;
  const E = P.present().find(n => n.rank === 'consort'); Object.assign(E, { romance: 85, trust: 75, regard: 80, jealousy: 0 }); E.coolUntil = 0; P.propose(E, 'empress');
  const C = P.present().find(n => n.rank === 'lady' && n.temper === 'shy'); Object.assign(C, { romance: 85, trust: 75, intimacy: 70, regard: 80, hope: 'favor' }); C.coolUntil = 0; P.propose(C, 'confess'); C.coolUntil = 0; C.last = {}; P.propose(C, 'consort');
  g.palaceAdvance(1); await w(300);
  g.setPalaceQuality(window.__Q || 'mid'); await w(500);
  const s = g.palace.screen; s.realHeads = 'proto'; s.applyLight(1);
  for (let i = 0; i < 60 && !s['kit']; i++) await w(250);
  const ids = [...s.protoIds()]; const vs = ids.map(id => s.views.get(id));
  vs.forEach((v, i) => { v.path = []; v.seat = undefined; v.wanderAt = 1e12; v.fig.position.set(9 + i * 1.2, 0, 20.5); v.fig.rotation.y = 0; v.npc.expr = 'normal'; v.body.setPose('stand'); });
  s.pos.set(10.2, 0, 26); s.avatarBody.root.visible = false;
  await w(1500);
  window.__ids = ids; return { ids, names: vs.map(v => [v.npc.name, v.npc.rank]), kit: !!s['kit'], heads: s.realHeadIds() }; });
 console.log(JSON.stringify(info));
 const shot = async (name, fn, arg) => { await p.evaluate(fn, arg); await p.waitForTimeout(1200); await p.screenshot({ path: `${D}/${name}.png` }); };
 const roles = ['empress', 'consort', 'lady'];
 for (let i = 0; i < 3; i++) {
  const cam = (az, dist, h, expr, pose) => ({ i, az, dist, h, expr, pose });
  const set = ({ i, az, dist, h, expr, pose }) => { const g = window.__goko, s = g.palace.screen, T = window.THREE_; const v = s.views.get(window.__ids[i]); v.npc.expr = expr; v.body.setPose(pose); v.fig.rotation.y = 0; s.setTalking(pose === 'talk' ? v.npc.id : null);
   const f = v.body.faceWorld(new v.fig.position.constructor()); const P = f.clone(); P.x += Math.sin(az) * dist; P.z += Math.cos(az) * dist; P.y += h; s.debugCam = { pos: P, look: f.clone().setY(f.y - (dist > 2 ? 0.6 : 0)) }; };
  await shot(`${roles[i]}-front`, set, cam(0, 0.55, 0.0, 'normal', 'stand'));
  await shot(`${roles[i]}-45`, set, cam(0.78, 0.55, 0.0, 'normal', 'stand'));
  await shot(`${roles[i]}-side`, set, cam(1.57, 0.55, 0.0, 'normal', 'stand'));
  await shot(`${roles[i]}-smile`, set, cam(0.25, 0.55, 0.0, 'smile', 'stand'));
  await shot(`${roles[i]}-talk`, set, cam(0.35, 0.6, 0.0, 'joy', 'talk'));
  await shot(`${roles[i]}-full`, set, cam(0.3, 3.0, -0.5, 'normal', 'stand'));
 }
 await p.evaluate(() => { const s = window.__goko.palace.screen; s.debugCam = null; s.setTalking(null); s.avatarBody.root.visible = true; s.pos.set(10.2, 0, 23.5); s.yaw = 0.2; s.dist = 4; s.pitch = 0.25; });
 await p.waitForTimeout(1500); await p.screenshot({ path: `${D}/palace-view.png` });
 // 会話中のカメラ(実際の会話の画面)
 await p.evaluate(() => { const g = window.__goko, s = g.palace.screen; const id = window.__ids[1]; g.palace.hud.openNpc(id); s.setTalking(id); });
 await p.waitForTimeout(2500); await p.screenshot({ path: `${D}/talk-camera.png` });
 console.log('errs', errs.slice(0, 5)); await b.close(); })();
