import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createDataProxy } from './server/dataProxy.js'

// The app uses History API routing with real paths (/login, /studio/base,
// /admin/super). Those are client-side routes, so any request that is not a
// real file must fall back to a shell. index.html is the general shell;
// studio.html and superadmin.html are the pinned deep-link entries.
const SHELLS = {
  main: 'index.html',
  studio: 'studio.html',
  superadmin: 'superadmin.html',
}

/**
 * Mount the data proxy on the dev server.
 *
 * The browser never holds a Supabase credential — it calls /api/rest/v1 and
 * this forwards to Supabase with the service-role key after checking the
 * caller's Morphix session. Running it here as well as in server.js means
 * `npm run dev` is fully functional on its own, instead of needing a second
 * terminal running the production server.
 */
function dataProxyPlugin(env) {
  return {
    name: 'morphix-data-proxy',
    configureServer(server) {
      const url = env.SUPABASE_URL
      const key = env.SUPABASE_SERVICE_ROLE_KEY

      if (!url || !key) {
        server.config.logger.warn(
          '[morphix] data proxy disabled: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. ' +
            'The app will run in local-only mode.'
        )
        return
      }

      const proxy = createDataProxy({ supabaseUrl: url, serviceKey: key })

      // `handle()` owns two unauthenticated session-bootstrap endpoints outside
      // the REST prefix — /api/auth/login and /api/auth/register. Gating on
      // /api/rest/v1 alone let those fall through to the SPA fallback, so the
      // client received HTML, failed to parse it, and reported a bogus
      // "Invalid credentials" on every sign-in.
      const PROXY_PATHS = ['/api/rest/v1', '/api/auth/']

      server.middlewares.use(async (req, res, next) => {
        if (!PROXY_PATHS.some((p) => req.url?.startsWith(p))) return next()
        try {
          const handled = await proxy.handle(req, res)
          if (!handled) next()
        } catch (err) {
          server.config.logger.error('[morphix] proxy error: ' + (err?.message || err))
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ code: 'PROXY500', message: 'proxy failure' }))
          }
        }
      })
      server.config.logger.info('[morphix] data proxy mounted at /api/rest/v1 and /api/auth')
    },
  }
}

export default defineConfig(({ mode }) => {
  // Server-only secrets: load them for the dev middleware, never for the bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), dataProxyPlugin(env)],

    server: {
      port: 5173,
      // Vite's `appType: 'spa'` (below) already serves this fallback, so dev and
      // prod resolve deep links the same way.
    },

    appType: 'spa',

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: SHELLS.main,
          superadmin: SHELLS.superadmin,
          studio: SHELLS.studio,
        },
      },
    },
  }
})
