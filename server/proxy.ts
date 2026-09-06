import { isIP } from 'node:net';

export function proxyClientIP(
  headers: Headers,
  peer: string,
  trustProxy: boolean,
) {
  // Dokploy's Traefik appends the connecting client to X-Forwarded-For.
  // Ignore any client-supplied prefix; this listener must only be exposed via Traefik.
  const last = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return trustProxy && last && isIP(last) ? last : peer;
}

export function apiClientIP(
  request: Request,
  peer: string,
  trustLocalProxy: boolean,
) {
  const forwarded = request.headers.get('x-tld-client-ip');
  return trustLocalProxy &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) &&
    forwarded &&
    isIP(forwarded)
    ? forwarded
    : peer;
}

export function upstreamRequest(
  request: Request,
  target: string,
  origin: string,
  clientIP: string,
) {
  const incoming = new URL(request.url);
  const upstream = new URL(target);
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;
  const headers = new Headers(request.headers);
  for (const name of [
    'forwarded',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-real-ip',
    'cf-connecting-ip',
    'x-tld-client-ip',
    'connection',
    'transfer-encoding',
    'accept-encoding',
  ])
    headers.delete(name);
  const publicURL = new URL(origin);
  headers.set('host', publicURL.host);
  headers.set('x-forwarded-host', publicURL.host);
  headers.set('x-forwarded-proto', publicURL.protocol.slice(0, -1));
  headers.set('x-tld-client-ip', clientIP);
  headers.set('accept-encoding', 'identity');
  return new Request(upstream, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
    signal: request.signal,
  });
}
