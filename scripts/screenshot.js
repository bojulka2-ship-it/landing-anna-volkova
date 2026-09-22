const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.SHOT_URL || 'http://127.0.0.1:8099/index.html';

async function shoot(browser, { name, width, height, isMobile }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: !!isMobile });
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
        img.loading = 'eager';
      });
    });
  });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.loading = 'eager';
    });
    if (document.fonts) await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => {}))
    );
    const step = Math.max(window.innerHeight, 400);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 250));
  });

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();

  const stat = fs.statSync(file);
  console.log(JSON.stringify({ name, width, height, metrics, bytes: stat.size }, null, 2));
  return metrics;
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  try {
    const d = await shoot(browser, { name: 'landing-full-desktop.png', width: 1440, height: 900 });
    const m = await shoot(browser, { name: 'landing-full-mobile.png', width: 375, height: 812, isMobile: true });
    if (d.scrollWidth > d.clientWidth || m.scrollWidth > m.clientWidth) {
      console.error('HORIZONTAL OVERFLOW DETECTED');
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
})();
