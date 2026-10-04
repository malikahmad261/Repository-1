import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Runs the Vercel functions in api/ inside the Vite dev server, so `npm run dev`
 * behaves like the deployed app.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Function routes only (e.g. /api/parse), not source files such as /api/_lib/*.ts.
        const match = req.url?.match(/^\/api\/([a-z][\w-]*)(?:\?|$)/);
        if (!match) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`);
          const handler = mod[req.method ?? 'GET'];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          });
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make .env values (including ANTHROPIC_API_KEY) visible to the dev API.
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env, { PARSE_ALLOW_UNAUTHENTICATED: '1' });

  return {
    plugins: [
      react(),
      devApi(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'Household Expenses',
          short_name: 'Expenses',
          description: 'Log household expenses in seconds and stay on budget.',
          theme_color: '#0ca678',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Android: lets you share an SMS or text straight into the app.
          share_target: {
            action: '/',
            method: 'GET',
            params: { title: 'title', text: 'text', url: 'url' },
          },
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
  };
});
