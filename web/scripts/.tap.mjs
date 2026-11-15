import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [w, h] of [[1920, 1080], [1280, 800], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ex-intro', '1'); } catch {} });
  for (const route of ['/', '/environment', '/systems']) {
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:5630' + route, { waitUntil: 'load' }); await p.waitForTimeout(4500);
    const r = await p.evaluate(() => {
      const small = [];
      for (const el of document.querySelectorAll('button, a[href], select, input')) {
        const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('.hot-keys')) continue;
        if (b.height < 56 || b.width < 56) small.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      const top = document.querySelector('.cx-top'); const tb = top?.getBoundingClientRect();
      const kids = top ? [...top.querySelectorAll('button, a, select, .cx-day')].map((e) => e.getBoundingClientRect()) : [];
      let overlap = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], c = kids[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) overlap++; }
      return { small, hscroll: document.documentElement.scrollWidth > innerWidth, topH: Math.round(tb?.height ?? 0), topOverflow: top ? top.scrollWidth > top.clientWidth : false, overlap };
    });
    console.log(w, route, JSON.stringify(r));
    if (route === '/environment' || w === 1280) await p.screenshot({ path: `docs/shots/console/tap-${w}${route.replace(/\//g, '-')}.png` });
    await p.close();
  }
  await ctx.close();
}
await b.close();
