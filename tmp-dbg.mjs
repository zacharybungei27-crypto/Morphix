import puppeteer from 'puppeteer';
const BASE = 'http://localhost:5173';
const USER = { id: 'usr_dev_base', email: 'demo@morphix.dev', username: 'Demo Base', tier: 'base', isAdmin: false, emailVerified: true, createdAt: Date.now(), updatedAt: Date.now(), preferences: { theme: 'default', notifications: true, language: 'en' } };

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--window-size=1600,1000'] });
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 1000 });
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,400)));
p.on('console', m => { if (m.type()==='error'||m.type()==='warning') console.log('['+m.type()+']', m.text().slice(0,300)); });
p.on('requestfailed', r => console.log('[reqfail]', r.url().slice(0,140), r.failure()?.errorText));
await p.setRequestInterception(true);
p.on('request', r => {
  const u = new URL(r.url());
  if (u.pathname === '/api/auth/login' || u.pathname === '/api/auth/register') {
    return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 's', user: USER, expiresAt: new Date(Date.now() + 864e5).toISOString() }) });
  }
  if (u.pathname.startsWith('/api/')) {
    // The sessions point-read is what revalidateInBackground() consults: an
    // empty result there is read as a real sign-out, so hand back a live row.
    if (u.pathname.includes('sessions') && u.searchParams.has('id')) {
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'ses_verify_base', user_id: USER.id, active: true,
        created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString(),
      }) });
    }
    if (u.pathname.includes('users') && u.searchParams.has('id')) {
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: USER.id, email: USER.email, username: USER.username, tier: 'base', is_admin: false,
        email_verified: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }) });
    }
    return r.respond({ status: 200, contentType: 'application/json', body: '[]' });
  }
  r.continue();
});
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await p.waitForSelector('[data-demo="base"]');
await p.click('[data-demo="base"]');
await new Promise(r => setTimeout(r, 3000));
await p.goto(`${BASE}/studio/base`, { waitUntil: 'networkidle2' });
await p.waitForSelector('.mx-el', { timeout: 15000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 1500));

const geo = await p.evaluate(() => {
  const el = document.querySelector('.mx-el.mx-icon');
  if (!el) return { err: 'no icon', url: location.href, body: document.body.innerText.slice(0,300), hasCanvas: !!document.querySelector('#studio-canvas'), canvasHtml: (document.querySelector('#studio-canvas')?.innerHTML || '(none)').slice(0,400) };
  const inner = el.querySelector('.mx-el-inner');
  const span = el.querySelector('.material-symbols-outlined');
  const frame = document.querySelector('.mx-frame');
  const box = n => { const r = n.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.left.toFixed(1), y: +r.top.toFixed(1) }; };
  return {
    stateSize: JSON.parse(sessionStorage.getItem('morphix_state') || 'null')?.icons?.[0]?.size ?? '(unpersisted)',
    canvasW: getComputedStyle(frame).width,
    frameBox: box(frame),
    elBox: box(el),
    elOffsetW: el.offsetWidth, elOffsetH: el.offsetHeight,
    innerBox: box(inner),
    innerFontSize: getComputedStyle(inner).fontSize,
    innerCS_width: getComputedStyle(inner).width,
    innerCS_height: getComputedStyle(inner).height,
    spanBox: box(span),
    spanDisplay: getComputedStyle(span).display,
    elCS: { position: getComputedStyle(el).position, width: getComputedStyle(el).width, height: getComputedStyle(el).height },
    fontsReady: document.fonts.check('24px "Material Symbols Outlined"'),
  };
});
console.log('--- icon geometry ---');
console.log(JSON.stringify(geo, null, 2));

// select it, then measure the grip
const c = await p.evaluate(() => { const r = document.querySelector('.mx-el.mx-icon').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.click(c.x, c.y);
await new Promise(r => setTimeout(r, 600));
const grip = await p.evaluate(() => {
  const el = document.querySelector('.mx-el.mx-icon');
  const g = el.querySelector('.mx-resize-grip');
  const eb = el.getBoundingClientRect(), gb = g.getBoundingClientRect();
  const span = el.querySelector('.material-symbols-outlined').getBoundingClientRect();
  return {
    elCenter: { x: +(eb.left + eb.width / 2).toFixed(1), y: +(eb.top + eb.height / 2).toFixed(1) },
    gripCenter: { x: +(gb.left + gb.width / 2).toFixed(1), y: +(gb.top + gb.height / 2).toFixed(1) },
    spanCenter: { x: +(span.left + span.width / 2).toFixed(1), y: +(span.top + span.height / 2).toFixed(1) },
    spanW: +span.width.toFixed(1), elW: +eb.width.toFixed(1),
  };
});
console.log('--- grip vs centers ---');
console.log(JSON.stringify(grip, null, 2));

// track styling
const track = await p.evaluate(() => {
  const r = document.querySelector('#edit-panel input[type=range]');
  if (!r) return { err: 'no range in panel' };
  const cs = getComputedStyle(r);
  const sheet = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(x => x.cssText); } catch { return []; } });
  return {
    fill: r.style.getPropertyValue('--fill'),
    appearance: cs.appearance || cs.webkitAppearance,
    h: cs.height,
    trackPseudoImage: getComputedStyle(r, '::-webkit-slider-runnable-track').backgroundImage,
    trackPseudoBg: getComputedStyle(r, '::-webkit-slider-runnable-track').backgroundColor,
    rulePresent: sheet.some(t => t.includes('slider-runnable-track') && t.includes('--fill')),
    matchingRule: (sheet.find(t => t.includes('slider-runnable-track') && t.includes('--fill')) || '').slice(0, 220),
  };
});
console.log('--- range track ---');
console.log(JSON.stringify(track, null, 2));

await b.close();
