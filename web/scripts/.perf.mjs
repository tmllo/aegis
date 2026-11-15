import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://127.0.0.1:5630/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const run of ['cold', 'warm']) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  if (run === 'warm') { await p.goto(url); await p.waitForTimeout(7000); await p.evaluate(() => sessionStorage.clear()); }
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForTimeout(7000);
  const r = await p.evaluate(() => {
    const m = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null;
    const fp = performance.getEntriesByType('paint').find((e) => e.name === 'first-paint')?.startTime ?? null;
    const fcp = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime ?? null;
    const poster = performance.getEntriesByType('resource').find((e) => e.name.includes('poster'))?.responseEnd ?? null;
    return { firstPaint: fp, fcp, posterLoaded: poster, introPlaying: m('intro-playing'), handoff: m('handoff') };
  });
  console.log(run, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : Math.round(v)]))));
  await ctx.close();
}
await b.close();
