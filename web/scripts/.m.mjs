import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { sessionStorage.setItem('ex-intro', '1'); } catch {} });
for (const [n, u] of [['phone-crew', '/'], ['phone-cabin', '/environment']]) {
  const p = await ctx.newPage(); await p.goto('http://127.0.0.1:5630' + u); await p.waitForTimeout(6000);
  const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await p.screenshot({ path: `docs/shots/console/${n}.png` }); console.log(n, 'hscroll', over); await p.close();
}
await b.close();
