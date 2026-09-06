import { proxyClientIP, upstreamRequest } from '../server/proxy';
import { appOrigin } from '../server/origin';

const origin = appOrigin({ ...process.env, NODE_ENV: 'production' });
const publicURL = new URL(origin);
const apiPort = process.env.API_PORT ?? '3001';
const webPort = process.env.WEB_PORT ?? '3002';
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ORIGIN: origin,
  SITE_URL: process.env.SITE_URL ?? origin,
  API_PORT: apiPort,
  TLD_LOCAL_PROXY: 'true',
  VINEXT_TRUSTED_HOSTS: publicURL.host,
};
const children = [
  Bun.spawn([process.execPath, 'server/index.ts'], {
    env,
    stdout: 'inherit',
    stderr: 'inherit',
  }),
  Bun.spawn(
    [
      'node',
      'node_modules/vinext/dist/cli.js',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      webPort,
    ],
    { env, stdout: 'inherit', stderr: 'inherit' },
  ),
];
const gateway = Bun.serve({
  hostname: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  maxRequestBodySize: 12 * 1024 * 1024,
  idleTimeout: 60,
  async fetch(request, server) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/healthz') {
        const checks = await Promise.all([
          fetch(`${apiOrigin}/api/health`, {
            signal: AbortSignal.timeout(4000),
          }),
          fetch(`${webOrigin}/robots.txt`, {
            signal: AbortSignal.timeout(4000),
          }),
        ]);
        const ok = checks.every((response) => response.ok);
        for (const response of checks) {
          if (response.body) await response.body.cancel();
        }
        return Response.json(
          { ok },
          { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const clientIP = proxyClientIP(
        request.headers,
        server.requestIP(request)?.address ?? 'unknown',
        process.env.TRUST_PROXY === 'true',
      );
      const response = await fetch(
        upstreamRequest(
          request,
          path === '/api' || path.startsWith('/api/') ? apiOrigin : webOrigin,
          origin,
          clientIP,
        ),
      );
      // Content-hashed map variants can be reused across visits and releases.
      if (
        /^\/maps\/optimized\/[a-f0-9]{20}(?:-preview)?\.webp$/.test(path) &&
        response.ok
      ) {
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }
      return response;
    } catch {
      return new Response('Service temporarily unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  },
});
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  await gateway.stop(true);
  children.forEach((child) => child.kill('SIGTERM'));
  await Promise.race([
    Promise.all(children.map((child) => child.exited)),
    Bun.sleep(5000),
  ]);
  children.forEach((child) => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  process.exit(code);
}
process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));
console.log(`Atlas gateway listening on port ${gateway.port}`);
console.log(`Public site origin: ${origin}`);
// Fail the container if either child exits so Docker can restart the whole service.
await Promise.race(children.map((child) => child.exited));
await stop(1);
