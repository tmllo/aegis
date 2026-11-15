// node shoot.mjs <url> <out> <w> <h> [actions...]  actions: click:<selector> | wait:<ms> | clickxy:x,y
import { chromium } from '@playwright/test';
const [url, out, w, h, ...acts] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(3500);
for (const a of acts) {
  const [k, v] = [a.slice(0, a.indexOf(':')), a.slice(a.indexOf(':') + 1)];
  if (k === 'click') await page.locator(v).first().click();
  if (k === 'clickxy') await page.mouse.click(...v.split(',').map(Number));
  if (k === 'wait') await page.waitForTimeout(+v);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
