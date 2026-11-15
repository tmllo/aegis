#!/usr/bin/env node
// Clicks every control on every section and fails on console errors or any request that
// leaves the app's origin. GPU (Metal) Chromium, intro skipped.
//   node scripts/check-ui.mjs [baseUrl=http://127.0.0.1:5630]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:5630';
const routes = ['/', '/vitals', '/vitals?t=heart', '/vitals?t=heart&deep=1', '/cabin', '/storm', '/systems', '/mind', '/timeline', '/shelter', '/compare', '/handoff'];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => {
  try {
    sessionStorage.setItem('ex-intro', '1');
  } catch {}
});
const origin = new URL(base).origin;
const errors = [];
const external = new Set();
let clicks = 0;
for (const r of routes) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${r} pageerror ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${r} console ${m.text().slice(0, 160)}`));
  p.on('request', (q) => !q.url().startsWith(origin) && !q.url().startsWith('data:') && !q.url().startsWith('blob:') && external.add(q.url()));
  await p.goto(base + r, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  const n = await p.locator('.cx button:visible, .cx a:visible').count();
  for (let i = 0; i < n; i++) {
    const el = p.locator('.cx button:visible, .cx a:visible').nth(i);
    if (!(await el.count()) || (await el.isDisabled().catch(() => true))) continue;
    const href = await el.getAttribute('href').catch(() => null);
    await el.click({ timeout: 1500, force: true }).catch(() => {});
    clicks++;
    await p.waitForTimeout(120);
    await p.keyboard.press('Escape');
    if (href || new URL(p.url()).pathname + new URL(p.url()).search !== r) await p.goto(base + r, { waitUntil: 'load' }).then(() => p.waitForTimeout(800));
  }
  for (const k of ['1', '2', '3', '4', '5', '6', 'ArrowLeft', '+', '-', '0']) {
    await p.keyboard.press(k);
    await p.waitForTimeout(80);
  }
  await p.close();
}
await b.close();
console.log(`clicked ${clicks} controls on ${routes.length} routes`);
console.log(`console errors: ${errors.length}`);
errors.slice(0, 20).forEach((e) => console.log('  ' + e));
console.log(`external requests: ${external.size}`);
[...external].slice(0, 20).forEach((u) => console.log('  ' + u));
process.exit(errors.length || external.size ? 1 : 0);
