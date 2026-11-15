import { chromium } from '@playwright/test';
const S = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
await p.goto('http://127.0.0.1:5630/'); await p.waitForTimeout(10000);
const word0 = await p.evaluate(() => document.querySelector('.one-word')?.textContent);
await p.evaluate(() => { window.__log = []; addEventListener('ex-demo-beat', (e) => window.__log.push({ id: e.detail.id, t: performance.now() })); addEventListener('ex-demo-done', () => window.__log.push({ id: 'done', t: performance.now() })); });
await p.goto('http://127.0.0.1:5630/?demo=1&record=1');
await p.evaluate(() => { window.__log = []; addEventListener('ex-demo-beat', (e) => window.__log.push({ id: e.detail.id, t: performance.now(), url: location.pathname + location.search })); addEventListener('ex-demo-done', () => window.__log.push({ id: 'done', t: performance.now() })); });
const t0 = Date.now(); let last = '';
while (Date.now() - t0 < 140000) {
  const st = await p.evaluate(() => ({ flag: document.documentElement.dataset.demo, beat: document.documentElement.dataset.demoBeat, url: location.pathname + location.search, word: document.querySelector('.one-word, .wx-word, .pat-word')?.textContent, cur: document.querySelector('.demo-cursor')?.dataset.on }));
  if (st.flag === 'done') break;
  const key = st.beat + '|' + st.url + '|' + st.word;
  if (key !== last) { last = key; console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(5), key); await p.screenshot({ path: `${S}/${String(Math.round((Date.now() - t0) / 1000)).padStart(3, '0')}-${st.beat}.png` }); }
  await p.waitForTimeout(700);
}
console.log('total s', ((Date.now() - t0) / 1000).toFixed(0));
await p.waitForTimeout(1500);
console.log('after:', await p.evaluate(() => ({ url: location.pathname + location.search, word: document.querySelector('.one-word')?.textContent })), 'before word:', word0);
console.log('errors', errs.slice(0, 5)); await b.close();
