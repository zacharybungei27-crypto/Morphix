// Temporary verification harness for the Studio icon-resize / limits / panel-polish work.
// Not part of the project — deleted after the run.
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:5173';
const out = (...a) => console.log(...a);
let failures = 0;
function check(name, pass, extra = '') {
  out(`${pass ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!pass) failures++;
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--window-size=1600,1000'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// --- sign in ---
// The dev backend in this environment rejects the seeded demo credentials, so
// the auth endpoint is stubbed to hand back a base-tier session. Everything
// downstream (the studio, the panels) is the real application code.
const EMAIL = 'demo@morphix.dev';
const PASS = 'demo123';
const USER = {
  id: 'usr_dev_base', email: EMAIL, username: 'Demo Base', tier: 'base',
  isAdmin: false, emailVerified: true, createdAt: Date.now(), updatedAt: Date.now(),
  preferences: { theme: 'default', notifications: true, language: 'en' },
};

await page.setRequestInterception(true);
page.on('request', req => {
  const u = new URL(req.url());
  if (u.pathname === '/api/auth/login' || u.pathname === '/api/auth/register') {
    return req.respond({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ sessionId: 'ses_verify_base', user: USER, expiresAt: new Date(Date.now() + 864e5).toISOString() }),
    });
  }
  if (u.pathname.startsWith('/api/')) {
    // Everything else in the API is unreachable here; let it fail so the app
    // takes its documented offline path rather than seeing fake data.
    return req.abort();
  }
  req.continue();
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await page.waitForSelector('[data-demo="base"]', { timeout: 10000 });
await page.click('[data-demo="base"]');
await new Promise(r => setTimeout(r, 3000));
out(`after login: ${page.url()}`);
if (page.url().includes('/login')) { out('FATAL: could not authenticate'); process.exit(1); }

// --- studio ---
await page.goto(`${BASE}/studio/base`, { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 1200));

out('\n[1] icon library count + left-panel limits');
const lib = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-add-icon]')];
  const more = document.querySelector('[data-icons-more]');
  return {
    rendered: btns.length,
    moreLabel: more?.textContent.replace(/\s+/g, ' ').trim() || null,
    shapes: document.querySelector('[data-count-shapes]')?.textContent,
    texts: document.querySelector('[data-count-texts]')?.textContent,
    icons: document.querySelector('[data-count-icons]')?.textContent,
    tierText: [...document.querySelectorAll('.tier-definitions div div')].map(d => d.textContent.replace(/\s+/g, ' ').trim())
  };
});
check('icon grid shows 12 collapsed', lib.rendered === 12, `rendered=${lib.rendered}`);
check('show-more advertises 27 more (39 total)', /Show 27 more/.test(lib.moreLabel || ''), lib.moreLabel);
check('shapes badge 8', lib.shapes?.endsWith('/8'), lib.shapes);
check('texts badge 4', lib.texts?.endsWith('/4'), lib.texts);
check('icons badge 4', lib.icons?.endsWith('/4'), lib.icons);
check('tier summary text matches new limits', lib.tierText.join(' | ').includes('8 shapes, 4 text, 4 icons')
  && lib.tierText.join(' | ').includes('8 shapes, 5 text, 5 icons'), lib.tierText.join(' || '));

// expand and count
await page.click('[data-icons-more]');
await new Promise(r => setTimeout(r, 400));
const expanded = await page.evaluate(() => ({
  n: document.querySelectorAll('[data-add-icon]').length,
  ids: [...document.querySelectorAll('[data-add-icon]')].map(b => b.dataset.addIcon)
}));
check('expanded grid shows all 39', expanded.n === 39, `n=${expanded.n}`);
const newOnes = ['verified_user', 'brush', 'local_cafe', 'watch', 'card_giftcard', 'local_florist', 'ac_unit', 'water_drop', 'graphic_eq', 'emoji_nature'];
check('all 10 new icons present', newOnes.every(i => expanded.ids.includes(i)),
  newOnes.filter(i => !expanded.ids.includes(i)).join(',') || 'all present');
await page.click('[data-icons-more]');
await new Promise(r => setTimeout(r, 300));

out('\n[2] on-canvas icon resize');
// select the existing default icon (the crown)
const selBefore = await page.evaluate(() => {
  const el = document.querySelector('.mx-el.mx-icon');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, grip: !!el.querySelector('.mx-resize-grip') };
});
check('grip hidden before selection', selBefore.grip === false);
await page.mouse.click(selBefore.x, selBefore.y);
await new Promise(r => setTimeout(r, 500));
const selAfter = await page.evaluate(() => {
  const el = document.querySelector('.mx-el.mx-icon');
  const g = el?.querySelector('.mx-resize-grip');
  const r = g?.getBoundingClientRect();
  return { grip: !!g, gx: r ? r.left + r.width / 2 : 0, gy: r ? r.top + r.height / 2 : 0, w: el.getBoundingClientRect().width };
});
check('grip appears on selected icon', selAfter.grip === true);

// Nothing has mutated yet, so morphix_state may not exist — read the size from
// the inspector, which is rendered straight off the item.
const sizeBefore = await page.evaluate(() => parseFloat(document.querySelector('[data-ctrl="icn-size"]').value));
await page.mouse.move(selAfter.gx, selAfter.gy);
await page.mouse.down();
await page.mouse.move(selAfter.gx + 60, selAfter.gy + 60, { steps: 12 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 600));
const resized = await page.evaluate(() => {
  const el = document.querySelector('.mx-el.mx-icon');
  return {
    size: JSON.parse(sessionStorage.getItem('morphix_state')).icons[0].size,
    w: el.getBoundingClientRect().width,
    sliderMax: document.querySelector('[data-ctrl="icn-size"]')?.max,
    readout: document.querySelector('.edit-section .el-slider-head span')?.textContent
  };
});
check('drag grew the icon', resized.size > sizeBefore, `${sizeBefore}% -> ${resized.size}%`);
check('canvas glyph actually re-rendered bigger', resized.w > selAfter.w, `${Math.round(selAfter.w)}px -> ${Math.round(resized.w)}px`);
check('inspector size slider max raised to 100', resized.sliderMax === '100', `max=${resized.sliderMax}`);

// shrink back
const sel2 = await page.evaluate(() => {
  const g = document.querySelector('.mx-resize-grip').getBoundingClientRect();
  return { gx: g.left + g.width / 2, gy: g.top + g.height / 2 };
});
await page.mouse.move(sel2.gx, sel2.gy);
await page.mouse.down();
await page.mouse.move(sel2.gx - 30, sel2.gy - 30, { steps: 10 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 500));
const shrunk = await page.evaluate(() => JSON.parse(sessionStorage.getItem('morphix_state')).icons[0].size);
check('drag shrank the icon again', shrunk < resized.size, `${resized.size}% -> ${shrunk}%`);

// clamp: drag far out
const sel3 = await page.evaluate(() => {
  const g = document.querySelector('.mx-resize-grip').getBoundingClientRect();
  return { gx: g.left + g.width / 2, gy: g.top + g.height / 2 };
});
await page.mouse.move(sel3.gx, sel3.gy);
await page.mouse.down();
await page.mouse.move(sel3.gx + 3000, sel3.gy + 3000, { steps: 10 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 500));
const clamped = await page.evaluate(() => JSON.parse(sessionStorage.getItem('morphix_state')).icons[0].size);
check('clamps at 100% max', clamped === 100, `size=${clamped}`);

out('\n[3] limit enforcement (base = 8/4/4)');
// fill shapes to the cap
const addAll = async (sel, cap) => {
  for (let i = 0; i < 14; i++) {
    const btn = await page.$(sel);
    if (!btn) break;
    await btn.click();
    await new Promise(r => setTimeout(r, 120));
  }
  return page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('morphix_state'));
    return { shapes: s.shapes.length, texts: s.texts.length, icons: s.icons.length };
  });
};
const counts = await addAll('[data-add-shape]');
check('shapes capped at 8', counts.shapes === 8, `shapes=${counts.shapes}`);
const tCounts = await addAll('[data-add-text]');
check('texts capped at 4', tCounts.texts === 4, `texts=${tCounts.texts}`);
const toastTxt = await page.evaluate(() => document.querySelector('.toast')?.textContent || document.body.innerText.match(/limit reached[^\n]*/i)?.[0] || null);
check('a limit toast fired', /limit reached/i.test(toastTxt || ''), toastTxt);

out('\n[4] right panel design');
const panel = await page.evaluate(() => {
  const r = document.querySelector('#edit-panel');
  const cs = getComputedStyle(r);
  const head = r.querySelector('.edit-panel-head');
  const headCs = head ? getComputedStyle(head) : null;
  const grid = r.querySelector('.edit-grid');
  const gridCs = grid ? getComputedStyle(grid) : null;
  const sec = r.querySelector('.edit-section');
  const secCs = sec ? getComputedStyle(sec) : null;
  const secH4 = sec?.querySelector('h4');
  const h4Cs = secH4 ? getComputedStyle(secH4) : null;
  return {
    overflowY: cs.overflowY,
    headSticky: headCs?.position,
    headZ: headCs?.zIndex,
    gridCols: gridCs?.gridTemplateColumns,
    secBg: secCs?.backgroundColor,
    secBorder: secCs?.borderTopWidth,
    h4Display: h4Cs?.display,
    h4BeforeW: secH4 ? getComputedStyle(secH4, '::before').width : null,
    sectionCount: r.querySelectorAll('.edit-section').length
  };
});
check('panel scrolls', panel.overflowY === 'auto', panel.overflowY);
check('header is sticky', panel.headSticky === 'sticky', panel.headSticky);
check('sections are single-column', (panel.gridCols || '').split(' ').length === 1, panel.gridCols);
check('sections are cards (bg + border)', panel.secBg !== 'rgba(0, 0, 0, 0)' && parseFloat(panel.secBorder) > 0,
  `${panel.secBg} / ${panel.secBorder}`);
check('section heading has an accent bar', panel.h4Display === 'flex' && panel.h4BeforeW === '3px',
  `${panel.h4Display} / ${panel.h4BeforeW}`);

out('\n[5] controls');
const ctrls = await page.evaluate(() => {
  const range = document.querySelector('#edit-panel .el-slider input[type=range]');
  const track = range ? getComputedStyle(range, '::-webkit-slider-runnable-track') : null;
  const head = range?.closest('.el-slider')?.querySelector('.el-slider-head');
  return {
    fillVar: range?.style.getPropertyValue('--fill'),
    trackBg: track?.backgroundImage?.slice(0, 60),
    headIsFlex: head ? getComputedStyle(head).display : null,
    valueRight: head ? getComputedStyle(head).justifyContent : null,
    valueTabular: head?.querySelector('span') ? getComputedStyle(head.querySelector('span')).fontVariantNumeric : null
  };
});
check('range track has a --fill custom property', ctrls.fillVar !== '', `--fill=${ctrls.fillVar}`);
check('track paints a gradient fill', /gradient/.test(ctrls.trackBg || ''), ctrls.trackBg);
check('label + value share one flex row', ctrls.headIsFlex === 'flex' && /space-between/.test(ctrls.valueRight || ''),
  `${ctrls.headIsFlex} / ${ctrls.valueRight}`);
check('value readout is tabular-nums', /tabular-nums/.test(ctrls.valueTabular || ''), ctrls.valueTabular);

// drag a slider and confirm the fill + readout track it
const sl = await page.evaluate(() => {
  const r = document.querySelector('[data-ctrl="shp-x"]');
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, before: r.style.getPropertyValue('--fill'), read: r.closest('.el-slider').querySelector('.el-slider-head span').textContent };
});
await page.mouse.move(sl.x, sl.y);
await page.mouse.down();
await page.mouse.move(sl.x + 50, sl.y, { steps: 10 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 400));
const slAfter = await page.evaluate(() => {
  const r = document.querySelector('[data-ctrl="shp-x"]');
  return { after: r.style.getPropertyValue('--fill'), read: r.closest('.el-slider').querySelector('.el-slider-head span').textContent, state: JSON.parse(sessionStorage.getItem('morphix_state')).shapes.map(s => s.x) };
});
check('dragging a slider updates its fill', slAfter.after !== sl.before, `${sl.before} -> ${slAfter.after}`);
check('dragging a slider updates its readout', slAfter.read !== sl.read, `${sl.read} -> ${slAfter.read}`);
check('slider wrote through to state', slAfter.state.some(x => Math.round(x) !== 50), slAfter.state.join(','));

// toggle: the old one never moved the knob
const tog = await page.evaluate(() => {
  const t = document.querySelector('#edit-panel .mx-toggle');
  const input = t.querySelector('input');
  return { hasClassOn: t.classList.contains('on'), checked: input.checked, knobTransform: getComputedStyle(t.querySelector('.mx-toggle-knob')).transform, nativeVisible: getComputedStyle(input).opacity };
});
const togTarget = await page.evaluate(() => {
  const i = document.querySelector('#edit-panel .mx-toggle input');
  const b = i.closest('.mx-toggle').getBoundingClientRect();
  return { x: b.left + 17, y: b.top + b.height / 2 };
});
await page.mouse.click(togTarget.x, togTarget.y);
await new Promise(r => setTimeout(r, 400));
const togAfter = await page.evaluate(() => {
  const t = document.querySelector('#edit-panel .mx-toggle');
  const i = t.querySelector('input');
  return { hasClassOn: t.classList.contains('on'), checked: i.checked, knobTransform: getComputedStyle(t.querySelector('.mx-toggle-knob')).transform, trackBg: getComputedStyle(t.querySelector('.mx-toggle-track')).backgroundColor };
});
check('native checkbox is visually hidden', tog.nativeVisible === '0', `opacity=${tog.nativeVisible}`);
check('toggle click flips .on class', tog.hasClassOn !== togAfter.hasClassOn, `${tog.hasClassOn} -> ${togAfter.hasClassOn}`);
check('toggle click moves the knob', tog.knobTransform !== togAfter.knobTransform, `${tog.knobTransform} -> ${togAfter.knobTransform}`);
check('toggle click flips the checkbox', tog.checked !== togAfter.checked, `${tog.checked} -> ${togAfter.checked}`);

const sel2style = await page.evaluate(() => {
  const s = document.querySelector('#edit-panel .el-slider select');
  if (!s) return null;
  const cs = getComputedStyle(s);
  return { appearance: cs.appearance, bgImage: cs.backgroundImage.slice(0, 30), border: cs.borderTopWidth, color: cs.color };
});
check('select is styled (custom chevron + border)', !!sel2style && /svg/.test(sel2style.bgImage) && parseFloat(sel2style.border) > 0, JSON.stringify(sel2style));

const col = await page.evaluate(() => {
  const c = document.querySelector('#edit-panel .el-slider input[type=color]');
  if (!c) return null;
  return { h: getComputedStyle(c).height, readout: c.closest('.el-slider').querySelector('.el-slider-head span').textContent };
});
check('colour input has a swatch height + hex readout', !!col && parseFloat(col.h) >= 28, JSON.stringify(col));

out('\n[6] regression sweep');
// layer strip still works
const layers = await page.evaluate(() => document.querySelectorAll('.mx-layer-chip').length);
check('layer strip still renders chips', layers > 0, `chips=${layers}`);
// restack buttons still in the sticky header
const acts = await page.evaluate(() => {
  const h = document.querySelector('.edit-panel-head');
  return h ? [...h.querySelectorAll('button')].map(b => b.textContent.trim()) : [];
});
check('restack/delete actions sit in the header', acts.length === 3, acts.join(','));
// deselect -> canvas panel
await page.evaluate(() => {
  const c = document.querySelector('.mx-canvas');
  c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 500));
const canvasPanel = await page.evaluate(() => document.querySelector('#edit-panel .edit-panel-head h3')?.textContent.trim());
check('clicking empty canvas returns to the Canvas panel', canvasPanel === 'Canvas', canvasPanel);
const cp = await page.evaluate(() => {
  const r = document.querySelector('[data-ctrl="canvas-scale"]');
  return { fill: r?.style.getPropertyValue('--fill'), hintOutside: !!document.querySelector('.mx-panel-hint') };
});
check('canvas scale slider got a fill on first render', cp.fill !== '', `fill=${cp.fill}`);
check('canvas hint moved out of the sticky header', cp.hintOutside === true);

out('\n[errors]');
const real = errors.filter(e => !/favicon|fonts\.googleapis|ERR_/.test(e));
out(real.length ? real.slice(0, 12).join('\n') : '  none');
check('no page/console errors', real.length === 0, real.slice(0, 3).join(' | '));

await page.screenshot({ path: '/tmp/morphix-studio-right-panel.png' });
out('\nscreenshot: /tmp/morphix-studio-right-panel.png');
out(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
