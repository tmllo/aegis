import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text().slice(0, 160)));
await p.goto('http://127.0.0.1:5630/?demo=1'); await p.waitForTimeout(12000);
for (let i = 0; i < 6; i++) { console.log(await p.evaluate(() => document.querySelector('.demo-n')?.textContent + ' ' + location.pathname + location.search)); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(3500); }
console.log('end', await p.evaluate(() => ({ demo: !!document.querySelector('.demo'), url: location.pathname + location.search })));
console.log('errors', errs);
await b.close();
