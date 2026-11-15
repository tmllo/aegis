// temp: many shots, GPU, intro skipped. node scripts/.s.mjs outDir name=url ...
import { chromium } from '@playwright/test';
const [out, ...pairs] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => { try { sessionStorage.setItem('ex-intro', '1'); } catch {} });
for (const pair of pairs) {
  const i = pair.indexOf('='); const name = pair.slice(0, i), url = pair.slice(i + 1);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text().slice(0, 200)));
  await p.goto('http://127.0.0.1:5630' + url, { waitUntil: 'load' });
  await p.waitForTimeout(+(process.env.W ?? 5000));
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(name, errs.length ? errs.join(' | ') : 'ok');
  await p.close();
}
await b.close();
