const express = require('express');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = 'https://bunkerthereval.framer.website';

let browser;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  const exec = await chromium.executablePath();
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: exec,
    headless: chromium.headless,
    defaultViewport: null,
  });
  return browser;
}

const BADGE_SELS = [
  'a[href*="framer.com"]',
  'a[href*="framer.website"]',
  'iframe[src*="framer.com"]',
  'iframe[src*="framer.website"]',
  'iframe[src*="framerusercontent.com"]',
  '[class*="Badge" i]',
  '[class*="badge" i]',
  '[data-framer-name*="Badge" i]',
  '[id*="badge" i]',
  'img[alt*="Made" i]',
  'img[alt*="Framer" i]',
];

function killJS() {
  const SEL = BADGE_SELS.join(',');
  function kill(root) {
    try {
      root.querySelectorAll(SEL).forEach(n => {
        if (n && n.parentNode) n.parentNode.removeChild(n);
      });
      root.querySelectorAll('iframe').forEach(f => {
        try {
          if (/(framer\.com|framer\.website|framerusercontent)/i.test(f.src || '')) {
            f.setAttribute('src', 'about:blank');
            if (f.parentNode) f.parentNode.removeChild(f);
          }
        } catch (e) {}
      });
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) kill(el.shadowRoot);
      }
    } catch (e) {}
  }
  kill(document);
  try {
    new MutationObserver(() => kill(document)).observe(
      document.documentElement,
      { childList: true, subtree: true, attributes: true, attributeFilter: ['src','class','id','href'] }
    );
  } catch (e) {}
  setInterval(() => kill(document), 200);
}

app.get('/', async (req, res) => {
  const sub = req.originalUrl === '/' ? '/' : req.originalUrl;
  const targetUrl = TARGET + sub;
  console.log('proxy ->', targetUrl);
  try {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    page.on('pageerror', () => {});
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(killJS);
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(killJS);
    const html = await page.content();
    await page.close();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.send(html);
  } catch (e) {
    console.error('proxy error:', e.message);
    res.status(502).send('Proxy error: ' + e.message);
  }
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => console.log('Framer proxy on :' + PORT));
