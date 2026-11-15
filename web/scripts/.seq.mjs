import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [url, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const t0 = Date.now();
await p.goto(url, { waitUntil: 'commit' });
const log = [];
for (let ms = 0; ms <= 5000; ms += 250) {
  const w = t0 + ms - Date.now();
  if (w > 0) await p.waitForTimeout(w);
  const name = `${String(ms).padStart(4, '0')}ms.png`;
  await p.screenshot({ path: `${out}/${name}` });
  const st = await p.evaluate(() => { const b = document.getElementById('boot'); return b ? `${b.className} op=${getComputedStyle(b).opacity}` : 'gone'; }).catch(() => 'nav');
  log.push(`${name} at ${Date.now() - t0}ms ${st}`);
}
console.log(log.join('\n'));
await b.close();
