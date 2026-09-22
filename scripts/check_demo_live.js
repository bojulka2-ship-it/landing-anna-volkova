const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 375, height: 812 });
  await p.goto('https://bojulka2-ship-it.github.io/landing-anna-volkova/', {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  const markers = await p.evaluate(() => {
    const badge = document.getElementById('demo-badge');
    const footer = document.getElementById('footer-demo-link');
    return {
      hostname: location.hostname,
      isGithub: /\.github\.io$/i.test(location.hostname),
      badgeHidden: badge ? badge.hidden : null,
      footerHidden: footer ? footer.hidden : null,
      footerText: footer ? footer.textContent.trim() : null
    };
  });
  console.log('markers', JSON.stringify(markers));

  await p.evaluate(() => document.getElementById('lead-form').scrollIntoView());
  await p.type('#name', 'Тест Демо');
  await p.click('#phone', { clickCount: 3 });
  await p.type('#phone', '9991234567');
  const methods = await p.$('#method');
  if (methods) await methods.select('call');
  const consent = await p.$('#consent');
  if (consent) await consent.click();
  const submit = await p.$('#submit-btn') || await p.$('button[type="submit"]');
  if (submit) await submit.click();
  await new Promise(r => setTimeout(r, 1200));

  const form = await p.evaluate(() => {
    const m = document.getElementById('form-message');
    if (!m) return { missing: true };
    return {
      hidden: m.hidden,
      text: (m.textContent || '').trim(),
      hasDemoTag: !!m.querySelector('.demo-tag'),
      hasZayavka: !!m.querySelector('a[href*="zayavka"]')
    };
  });
  console.log('form', JSON.stringify(form));

  const gaps = await p.evaluate(() => {
    const bar = document.querySelector('.sticky-cta');
    if (!bar) return { bar: false };
    const kids = Array.from(bar.querySelectorAll('a, button')).map(el => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim().slice(0, 40), left: r.left, right: r.right, top: r.top, w: Math.round(r.width), h: Math.round(r.height) };
    });
    const stickyGaps = [];
    for (let i = 1; i < kids.length; i++) {
      if (Math.abs(kids[i].top - kids[i - 1].top) < 6) {
        stickyGaps.push(Math.round(kids[i].left - kids[i - 1].right));
      }
    }
    const formBtns = Array.from(document.querySelectorAll('.lead-form button, .lead-form .btn, form#lead-form button')).map(el => {
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.height) };
    });
    return {
      bar: true,
      display: getComputedStyle(bar).display,
      kids,
      stickyGaps,
      minFormBtnH: formBtns.length ? Math.min(...formBtns.map(x => x.h)) : null,
      formBtnCount: formBtns.length
    };
  });
  console.log('gaps', JSON.stringify(gaps));

  await b.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
