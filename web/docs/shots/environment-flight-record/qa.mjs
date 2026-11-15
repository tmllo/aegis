// QA for the environment concept: every place at 1920, 1280 and 390, overlap/clipping check, tab order.
import { chromium } from '@playwright/test';
const PAGE = 'http://127.0.0.1:5620/concepts/environment-flight-record';
const OUT = decodeURIComponent(new globalThis.URL('.', import.meta.url).pathname);
const CHECK = `(() => {
  const all = [...document.querySelectorAll("main *, nav *")];
  const vis = (k) => { const s = getComputedStyle(k); return s.display !== "none" && s.position !== "absolute" && s.position !== "fixed" && k.getClientRects().length; };
  const name = (e) => (typeof e.className === "string" && e.className) || e.tagName;
  const overlaps = [];
  all.forEach((p) => { const kids = [...p.children].filter(vis);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlaps.push(name(kids[i]) + " x " + name(kids[j])); } });
  const clipped = [];
  all.forEach((c) => { const s = getComputedStyle(c); if (s.overflowX === "visible" && s.overflowY === "visible") return;
    if (c.classList.contains("ev-plate")) return; // plate crops its image on purpose
    const cr = c.getBoundingClientRect(); const freeHeight = s.maxHeight === "none" && !c.style.height;
    for (const d of c.querySelectorAll("*")) { const r = d.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cut = r.top < cr.top - 0.5 || (freeHeight && r.bottom > cr.bottom + 0.5) || (s.overflowX === "hidden" && (r.left < cr.left - 0.5 || r.right > cr.right + 0.5));
      if (cut) { clipped.push(name(c) + " cuts " + name(d)); break; } } });
  const squeezed = all.filter((e) => e.children.length === 0 && e.textContent.trim().length > 12 && e.getBoundingClientRect().width < 40 && vis(e)).map(name);
  // the right column must not collide with the plate's Earth
  const earth = document.querySelector(".ev-overlay image"); const hero = document.querySelector(".ev-hero");
  let earthHero = false; if (earth && hero) { const a = earth.getBoundingClientRect(), b = hero.getBoundingClientRect();
    earthHero = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0; }
  return { overlaps: overlaps.slice(0, 10), clipped: clipped.slice(0, 10), squeezed, earthHero, hscroll: document.documentElement.scrollWidth > innerWidth };
})()`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h] of [[1920, 1080], [1280, 800], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(PAGE); await page.waitForSelector('.ev-tab');
  for (const name of ['ISS', 'Lunar surface', 'Mars transit', 'Mars surface']) {
    await page.getByRole('tab', { name: new RegExp('^' + name) }).click();
    await page.waitForTimeout(900);
    const r = await page.evaluate(CHECK);
    const slug = name.toLowerCase().replace(/ /g, '-');
    await page.screenshot({ path: `${OUT}${slug}-${w}.png`, fullPage: w < 1000 });
    console.log(w, name, JSON.stringify(r));
  }
  if (w === 1920) {
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400);
    const sel = await page.evaluate(() => document.activeElement?.textContent);
    console.log('arrow-left focus ->', sel);
    await page.keyboard.press('Tab'); console.log('tab ->', await page.evaluate(() => document.activeElement?.className));
  }
  await page.close();
}
await browser.close();
