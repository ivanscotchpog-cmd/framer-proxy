const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const TARGET = 'https://bunkerthereval.framer.website';

const STRIP_REQ = [
  'cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','cf-worker',
  'cf-request-id','cf-cache-status','true-client-ip','x-forwarded-for',
  'x-forwarded-proto','x-forwarded-host','x-real-ip','x-client-ip',
  'forwarded','x-compress','request-id','x-request-id',
  'traceparent','x-correlation-id',
  'accept-encoding','cache-control',
];

const STRIP_RES = [
  'cf-ray','cf-cache-status','server','alt-svc',
  'content-security-policy','content-security-policy-report-only',
  'x-frame-options','report-to','reporting-endpoints','nel',
];

function shouldStrip(name, list) {
  for (const p of list) {
    if (p.endsWith('-') ? name.startsWith(p) : p === name) return true;
  }
  return false;
}

function stripReqHeaders(obj, list) {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    if (!shouldStrip(k.toLowerCase(), list)) out[k] = obj[k];
  }
  return out;
}

function stripResHeaders(headers, list) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === 'function') {
    headers.forEach((v, k) => {
      if (!shouldStrip(k.toLowerCase(), list)) out[k] = v;
    });
    return out;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (!shouldStrip(k.toLowerCase(), list)) out[k] = v;
  }
  return out;
}

const BADGE_PATTERNS = [
  /<!--\s*Start\s+Framer\s+Badge\s*-->[\s\S]*?<!--\s*End\s+Framer\s+Badge\s*-->/gi,
  /<div[^>]*id\s*=\s*["']__framer-badge["'][\s\S]*?<\/div>/gi,
  /<div[^>]*class\s*=\s*["'][^"']*\bBadge\b[^"']*["'][\s\S]*?<\/div>/gi,
  /<a[^>]*href\s*=\s*["']https?:\/\/(?:www\.)?framer\.com["'][\s\S]*?<\/a>/gi,
  /<script[^>]*>[\s\S]*?(?:__framer-badge|framer-badge|badge\.js|Made\s*in\s*Framer|Made\s*with\s*Framer)[\s\S]*?<\/script>/gi,
];

const KILL_CSS = `<style id="killify">#__framer-badge,.framer-badge,[class*="Badge" i],[class*="badge" i],[data-framer-name*="Badge" i],[data-framer-name*="badge" i],[id*="badge" i],a[href*="framer.com"],a[href*="framer.website"],iframe[src*="framer.com"],iframe[src*="framer.website"]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;position:fixed!important;left:-99999px!important;top:-99999px!important;width:0!important;height:0!important;z-index:-2147483648!important;clip-path:inset(100%)!important;}::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}html{scrollbar-width:none!important;-ms-overflow-style:none!important}
</style>`;

const KILL_JS = `<script>(function(){var S='a[href*="framer.com"],iframe[src*="framer.com"],[class*="Badge" i],[class*="badge" i],[data-framer-name*="Badge" i]';function k(r){try{r.querySelectorAll(S).forEach(function(n){if(n&&n.parentNode)n.parentNode.removeChild(n);});var a=r.querySelectorAll('*');for(var i=0;i<a.length;i++){if(a[i].shadowRoot)k(a[i].shadowRoot);}}catch(e){}}function b(){k(document);setInterval(function(){k(document);var ifs=document.getElementsByTagName('iframe');for(var i=0;i<ifs.length;i++){try{if(/(framer\\.com|framer\\.website)/i.test(ifs[i].src||'')){ifs[i].setAttribute('src','about:blank');ifs[i].parentNode&&ifs[i].parentNode.removeChild(ifs[i]);}}catch(e){}}},120);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',b);else b();})();</script>`;

async function proxy(req, res) {
  try {
    const sub = req.originalUrl === '/' ? '/' : req.originalUrl;
    const target = new URL(TARGET + sub);

    const upstream = await fetch(target, {
      headers: stripReqHeaders(req.headers, STRIP_REQ),
      redirect: 'follow',
    });

    const ct = upstream.headers.get('content-type') || '';
    const outHeaders = stripResHeaders(upstream.headers, STRIP_RES);
    if (!outHeaders['cache-control']) outHeaders['cache-control'] = 'public, max-age=30';

    if (ct.includes('text/html')) {
      let html = await upstream.text();
      for (const re of BADGE_PATTERNS) html = html.replace(re, '');
      html = html.replace(/<\/head>/i, `${KILL_CSS}</head>`);
      html = html.replace(/<\/body>/i, `${KILL_JS}</body>`);
      return res.status(upstream.status).set(outHeaders).send(html);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).set(outHeaders).send(buf);
  } catch (e) {
    return res.status(502).send('Proxy error: ' + e.message);
  }
}

app.get(/.*/, proxy);
app.post(/.*/, proxy);
app.get('/health', (req, res) => res.send('ok'));
app.listen(PORT, () => console.log('Framer proxy on :' + PORT));
