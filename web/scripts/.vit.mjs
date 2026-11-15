import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => { try { sessionStorage.setItem('ex-intro', '1'); } catch {} });
const errs = [];
for (const [name, url] of [['vitals-crew-details', '/?p=details'], ['vitals-organ-bp', '/?t=vessels&k=bp_sys'], ['vitals-organ-brain', '/?t=brain&k=sleep_h']]) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(name + ' ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(name + ' ' + m.text().slice(0, 160)));
  await p.goto('http://127.0.0.1:5630' + url, { waitUntil: 'load' }); await p.waitForTimeout(6000);
  await p.screenshot({ path: `docs/shots/console/${name}.png` }); await p.close();
}
console.log(errs.length ? errs : 'no errors'); await b.close();
