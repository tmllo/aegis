// usage: node shoot.mjs name:query:WxH ...   (run from web/ so playwright resolves)
import { chromium } from '@playwright/test';
const S='/private/tmp/claude-501/-Users-emileholemans/4d0b1ece-fc5c-4f94-9081-6c32668a5d17/scratchpad/cgb/';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'] });
for (const a of process.argv.slice(2)) {
  const [name, q, size='1920x1080', act=''] = a.split('|');
  const [w,h] = size.split('x').map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>m.type()==='error'&&errs.push(m.text()));
  await p.goto('http://localhost:5621/concepts/cockpit-glass-body'+(q?'?'+q:''), { waitUntil:'load' });
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(3500);
  for (const step of act.split(';').filter(Boolean)) {
    if (step.startsWith('click=')) await p.click(step.slice(6));
    else if (step.startsWith('key=')) await p.keyboard.press(step.slice(4));
    else if (step.startsWith('hold=')) { const el=await p.$(step.slice(5)); const bx=await el.boundingBox(); await p.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2); await p.mouse.down(); await p.waitForTimeout(1000); await p.mouse.up(); }
    await p.waitForTimeout(1600);
  }
  const clip = await p.evaluate(()=>{const out=[];document.querySelectorAll('.cg-screen *').forEach(e=>{const r=e.getBoundingClientRect();if(!r.width)return;if(e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflow!=='visible'&&e.children.length===0)out.push('clip:'+e.className+':'+e.textContent.slice(0,30));if(r.right>innerWidth+1||r.bottom>innerHeight+1)out.push('off:'+e.className);});return [...new Set(out)].slice(0,12)});
  await p.screenshot({ path: name.startsWith('/')?name:S+name+'.png' });
  console.log(name, p.url().split('?')[1]||'', JSON.stringify(clip), errs.slice(0,3));
  await p.close();
}
await b.close();
