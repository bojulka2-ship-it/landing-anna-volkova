const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screenshots');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.SHOT_URL || 'http://127.0.0.1:8099/index.html';
const WIDTHS = [768, 1024, 1440];

async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
}

async function shootWidth(browser, width) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => {
      i.loading = 'eager';
    });
    if (document.fonts) await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => {})));
  });
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  const name = `landing-${width}.png`;
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  await page.close();
  return { width, name, metrics };
}

async function checkA11y(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812 });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });

  const reduced = await page.evaluate(() => {
    const matches = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const samples = [];
    const els = document.querySelectorAll('.btn, .card, .section, .hero, a, button');
    els.forEach((el) => {
      const s = getComputedStyle(el);
      if (s.transitionDuration && s.transitionDuration !== '0s') {
        samples.push({ cls: el.className, d: s.transitionDuration });
      }
      if (s.animationName && s.animationName !== 'none') {
        samples.push({ cls: el.className, anim: s.animationName });
      }
    });
    return { matches, stillAnimating: samples.slice(0, 10), count: samples.length };
  });

  // aria-live на сообщении формы
  const aria = await page.evaluate(() => {
    const m = document.getElementById('form-message');
    if (!m) return { found: false };
    return {
      found: true,
      ariaLive: m.getAttribute('aria-live') || m.getAttribute('aria-live'),
      role: m.getAttribute('role'),
      tag: m.tagName,
      hidden: m.hidden,
    };
  });

  // Клавиатура: Tab до формы, видимый фокус
  const focus = await page.evaluate(() => {
    const name = document.getElementById('name');
    if (!name) return { ok: false, reason: 'no #name' };
    name.focus();
    const active = document.activeElement;
    return {
      ok: active === name,
      id: active && active.id,
      tag: active && active.tagName,
    };
  });

  // Прогон Tab: собираем порядок фокуса первых 15 элементов
  await page.evaluate(() => document.body.focus());
  const tabOrder = [];
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      const s = getComputedStyle(a);
      return {
        tag: a.tagName,
        id: a.id || null,
        text: (a.textContent || a.value || '').trim().slice(0, 40),
        outline: s.outlineStyle + ' ' + s.outlineWidth,
        boxShadow: s.boxShadow !== 'none',
      };
    });
    if (info) tabOrder.push(info);
  }

  // Видимый индикатор фокуса хотя бы у одного элемента
  const focusVisible = tabOrder.some(
    (t) => (t.outline && !t.outline.startsWith('none')) || t.boxShadow
  );

  await page.close();
  return { reduced, aria, focus, tabOrder, focusVisible };
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  try {
    const shots = [];
    for (const w of WIDTHS) shots.push(await shootWidth(browser, w));
    const a11y = await checkA11y(browser);
    const report = { shots, a11y };
    console.log(JSON.stringify(report, null, 2));
    const anyOverflow = shots.some((s) => s.metrics.overflow);
    if (anyOverflow) {
      console.error('OVERFLOW at some width');
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
})();
