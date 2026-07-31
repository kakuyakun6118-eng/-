import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-user--/6ada54eb-51e1-51ad-8705-2b7158848712/scratchpad';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:4173/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/中級/}).click(); await p.waitForTimeout(900);
await p.locator('svg[role=img]').screenshot({path:`${S}/t1.png`});
// ターン送りの描画にかかる時間を測る（フィルタの負荷確認）
const t=[];
for(let i=0;i<10;i++){
  const s=Date.now();
  await p.getByRole('button',{name:/次の年へ/}).click();
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  t.push(Date.now()-s);
}
t.sort((a,b)=>a-b);
console.log('ターン送りの描画: 中央値', t[5],'ms / 最大', t[9],'ms');
console.log('JSエラー:', errs.length?errs:'なし');
await b.close();
