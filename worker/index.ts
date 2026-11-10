import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { App } from './env';
import { mailEnabled } from './lib/services';
import { loadSession, sameOrigin } from './lib/session';
import { admin } from './routes/admin';
import { auth } from './routes/auth';
import { member } from './routes/member';
import { pub } from './routes/public';

const app = new Hono<App>().basePath('/api');

app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin', referrerPolicy: 'no-referrer' }));
app.use('*', async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
  c.header('x-robots-tag', 'noindex, nofollow');
});
app.use('*', sameOrigin);
app.use('*', loadSession);

app.get('/config', (c) => c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null, mailEnabled: mailEnabled(c.env) }));
app.route('/auth', auth);
app.route('/admin', admin);
app.route('/', pub);
app.route('/', member);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: 'server_error' }, 500);
});

// On Pages (advanced mode) every request reaches the worker unless _routes.json filters it; static files go back to the asset server.
export default {
  fetch(request: Request, env: App['Bindings'], ctx: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith('/api') || !env.ASSETS) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
