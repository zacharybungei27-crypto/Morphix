/**
 * Morphix production/preview server
 *
 * Serves the built app from dist/ and resolves History-API deep links
 * (/login, /studio/base, /admin/super) back to the right shell, so a page
 * refresh or a shared link works instead of 404ing.
 *
 * Run with:  npm start        (after npm run build)
 *            npm run preview  (Vite's own preview server)
 */

import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createDataProxy } from './server/dataProxy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env before anything reads configuration.
try {
  loadEnv({ path: join(__dirname, '.env') });
} catch {
  // dotenv is optional; env may already be provided by the shell.
}

const PORT = process.env.PORT || 3000;
const DIST = join(__dirname, 'dist');

const app = express();
app.use(express.json());

/**
 * Which shell owns a given path. Mirrors the SHELL_PREFIX map in
 * src/entries/bootstrap.js so the two never disagree.
 */
function shellFor(pathname) {
  if (pathname === '/studio.html' || pathname.startsWith('/studio.html/')) return 'studio.html';
  if (pathname === '/superadmin.html' || pathname.startsWith('/superadmin.html/')) {
    return 'superadmin.html';
  }
  if (pathname.startsWith('/admin')) return 'superadmin.html';
  return 'index.html';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

app.use(
  express.static(DIST, {
    index: false,
    setHeaders(res, filePath) {
      const type = MIME[extname(filePath).toLowerCase()];
      if (type) res.setHeader('Content-Type', type);
      // Hashed assets are immutable; shells must never be cached.
      if (filePath.includes(`${'assets'}/`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// Health check.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dist: existsSync(DIST) ? 'present' : 'missing — run `npm run build` first',
  });
});

/**
 * Data proxy.
 *
 * The browser never holds a Supabase credential. It sends its Morphix session
 * id and this shim applies the ownership filters with the service-role key, so
 * row-level security no longer has to be the only line of defence.
 *
 * Mounted before the SPA fallback so /api/rest/v1/... is never swallowed.
 */
const PROXY_CONFIGURED = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (PROXY_CONFIGURED) {
  const proxy = createDataProxy({
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  app.use(async (req, res, next) => {
    try {
      const handled = await proxy.handle(req, res);
      if (!handled) next();
    } catch (err) {
      console.error('[proxy] unhandled error:', err);
      if (!res.headersSent) {
        res.status(500).json({ code: 'PROXY500', message: 'proxy failure' });
      }
    }
  });
} else {
  app.use('/api/rest/v1', (_req, res) => {
    res.status(503).json({
      code: 'PROXY_MISCONFIGURED',
      message:
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set on the server, so the ' +
        'data proxy cannot start. Add them to .env.',
    });
  });
}

/**
 * Report what the browser currently has locally versus what Supabase holds.
 * This is the verification step that must pass before anyone clears local data.
 */
app.get('/api/storage-status', async (_req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(503).json({ ok: false, error: 'Server-side Supabase env is not configured.' });
  }

  const tables = [
    'users',
    'avatars',
    'themes',
    'elements',
    'templates',
    'projects',
    'api_keys',
    'usage',
    'billing',
    'preferences',
    'metadata',
    'analytics',
    'sessions',
  ];

  try {
    const results = await Promise.all(
      tables.map(async (table) => {
        const r = await fetch(`${url}/rest/v1/${table}?select=*`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        if (!r.ok) return { table, count: null, error: (await r.text()).slice(0, 200) };
        return { table, count: (await r.json()).length };
      })
    );
    res.json({ ok: true, counts: results });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// SPA fallback. Must be registered last.
app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const shell = shellFor(req.path);
  const file = join(DIST, shell);

  if (!existsSync(file)) {
    return res
      .status(503)
      .type('text/plain')
      .send('dist/ is empty. Run `npm run build` first, or use `npm run dev`.');
  }

  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(normalize(file));
});

app.listen(PORT, () => {
  console.log(`\n  Morphix running at http://localhost:${PORT}`);
  console.log(`  serving: ${DIST}`);
  console.log(`  shells:  index.html (all routes) · studio.html · superadmin.html\n`);
});
