const { chromium } = require('playwright');
const path = require('path');

const URL = 'http://127.0.0.1:8080';
const VW = 1280, VH = 720;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('fake-cursor')) return;
    const cur = document.createElement('div');
    cur.id = 'fake-cursor';
    cur.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
    cur.style.cssText = 'position:fixed;top:-50px;left:-50px;z-index:999999;pointer-events:none;transition:all 0.35s cubic-bezier(0.25,0.1,0.25,1);filter:drop-shadow(1px 2px 2px rgba(0,0,0,0.5));';
    document.body.appendChild(cur);
  });
}

async function hideCursor(page) {
  await page.evaluate(() => {
    const c = document.getElementById('fake-cursor');
    if (c) { c.style.left = '-50px'; c.style.top = '-50px'; }
  });
}

async function moveTo(page, selector) {
  const el = typeof selector === 'string' ? await page.$(selector) : selector;
  if (!el) return { x: 640, y: 360 };
  const box = await el.boundingBox();
  if (!box) return { x: 640, y: 360 };
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.evaluate(({ x, y }) => {
    const c = document.getElementById('fake-cursor');
    if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; }
  }, { x, y });
  await sleep(350);
  return { x, y };
}

async function click(page, selector) {
  const pos = await moveTo(page, selector);
  await page.evaluate(() => { const c = document.getElementById('fake-cursor'); if (c) c.style.transform = 'scale(0.8)'; });
  await sleep(60);
  await page.mouse.click(pos.x, pos.y);
  await page.evaluate(() => { const c = document.getElementById('fake-cursor'); if (c) c.style.transform = 'scale(1)'; });
  await sleep(150);
}

async function scrollTo(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, selector);
  await sleep(500);
}

async function zoomFit(page, selector, opts = {}) {
  const { maxScale = 2.5, fillPct = 0.75, duration = 400 } = opts;
  const el = typeof selector === 'string' ? await page.$(selector) : selector;
  if (!el) return;
  const box = await el.boundingBox();
  if (!box) return;
  const scale = Math.min((VW * fillPct) / box.width, (VH * fillPct) / box.height, maxScale);
  const tx = (VW / 2 - (box.x + box.width / 2) * scale) / scale;
  const ty = (VH / 2 - (box.y + box.height / 2) * scale) / scale;
  await page.evaluate(({ s, tx, ty, dur }) => {
    document.body.style.transition = `transform ${dur}ms ease`;
    document.body.style.transformOrigin = '0 0';
    document.body.style.transform = `scale(${s}) translate(${tx}px, ${ty}px)`;
  }, { s: scale, tx, ty, dur: duration });
  await sleep(duration + 150);
}

async function zoomOut(page, dur = 300) {
  await page.evaluate((d) => {
    document.body.style.transition = `transform ${d}ms ease`;
    document.body.style.transform = 'none';
  }, dur);
  await sleep(dur + 100);
}

async function resetInstant(page) {
  await page.evaluate(() => { document.body.style.transition = 'none'; document.body.style.transform = 'none'; });
  await sleep(50);
}

async function type(page, text, delay = 35) {
  await moveTo(page, '.term-field');
  const field = await page.$('.term-field');
  if (!field) return;
  await field.click();
  await field.fill('');
  for (const ch of text) { await field.type(ch, { delay: 0 }); await sleep(delay); }
  await sleep(200);
  await page.keyboard.press('Enter');
}

(async () => {
  console.log('Recording...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    recordVideo: { dir: __dirname, size: { width: VW, height: VH } },
  });
  const page = await context.newPage();

  // ── 1. Boot (2.5s) ──
  console.log('1. Boot');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await sleep(2500);
  await injectCursor(page);

  // ── 2. Pinned — go straight to Pokemon, click open (3s) ──
  console.log('2. Pinned → Pokemon → open');
  await scrollTo(page, '.spotlight');
  const pinBtns = await page.$$('.pin-list button');
  if (pinBtns.length >= 3) {
    await click(page, pinBtns[2]); // Pokemon
    await sleep(800);
  }
  await click(page, '.sp-cta');
  await resetInstant(page);
  await sleep(1000);
  await injectCursor(page);

  // ── 3. Project page — zoom into progress breakdown (2.5s) ──
  console.log('3. Progress bars');
  await scrollTo(page, '.progress-section');
  await sleep(200);
  await zoomFit(page, '.progress-breakdown', { maxScale: 2.5, fillPct: 0.7 });
  await sleep(1500);
  await zoomOut(page);
  await sleep(300);

  // ── 4. Back button to category listing ──
  console.log('4. Back to category');
  await scrollTo(page, '.crumbs');
  await click(page, '.back-btn');
  await sleep(800);

  // ── 5. Browse category — see hashtags on project rows ──
  console.log('5. Category listing + hashtags');
  await scrollTo(page, '.dir.panel');
  await sleep(1000);

  // ── 6. Use terminal to go home ──
  console.log('6. cd ~ to home');
  await scrollTo(page, '.term');
  await type(page, '~', 40);
  await sleep(800);

  // ── 7. Search ──
  console.log('7. search snipboard');
  await scrollTo(page, '.term');
  await type(page, 'search snipboard', 40);
  await sleep(300);
  await scrollTo(page, '.term-log .entry:last-child');
  await sleep(1500);

  // ── 8. Tag — no zoom, just show it (2s) ──
  console.log('8. tag TypeScript');
  await type(page, 'tag TypeScript', 35);
  await sleep(200);
  await scrollTo(page, '.term-log .entry:last-child');
  await sleep(1200);

  // ── 9. Claude boot (3s) ──
  console.log('9. claude');
  await type(page, 'claude', 40);
  await sleep(200);
  await scrollTo(page, '.term-log .entry:last-child');
  await sleep(2500);

  // ── 10. Claude message — fast (3s) ──
  console.log('10. Claude prompt');
  await type(page, 'refactor auth to use middleware pattern', 25);
  await sleep(200);
  await scrollTo(page, '.term-log .entry:last-child');
  await sleep(3500);

  // ── 11. /cost — fast (1.5s) ──
  console.log('11. /cost');
  await type(page, '/cost', 40);
  await sleep(200);
  await scrollTo(page, '.term-log .entry:last-child');
  await sleep(1500);

  // ── 12. /exit — fast (1.5s) ──
  console.log('12. /exit');
  await type(page, '/exit', 40);
  await sleep(200);
  await scrollTo(page, '.term-log .entry:last-child');
  await sleep(1500);

  // ── 13. whoami (2.5s) ──
  console.log('13. whoami');
  await type(page, 'whoami', 40);
  await sleep(200);
  await scrollTo(page, '.term-log .entry:last-child');
  await sleep(2500);

  // ── 14. Scroll to top, end (2s) ──
  console.log('14. End');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(800);
  await hideCursor(page);
  await sleep(1500);

  console.log('Closing...');
  await page.close();
  await context.close();
  await browser.close();
  console.log('Done! Check for .webm file.');
})();
