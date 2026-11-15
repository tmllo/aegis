#!/usr/bin/env node
// Screenshot a page with WebGL working in headless Chromium (so the R3F body renders).
//   node scripts/shot.mjs <url> <outPng> [width=1920] [height=1080] [waitMs=2500]
// Exit code 0 = saved. Prints console errors from the page so a broken concept is visible.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [url, out, w = '1920', h = '1080', wait = '2500'] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <outPng> [width=1920] [height=1080] [waitMs=2500]');
  process.exit(2);
}

const browser = await chromium.launch({
  args: [
    // Software GL through ANGLE + SwiftShader: works with no GPU and no display.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: Number(w), height: Number(h) },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(Number(wait));
  const file = resolve(out);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  console.log(`saved ${file} (${w}x${h})`);
  for (const e of errors) console.error(e);
} finally {
  await browser.close();
}
