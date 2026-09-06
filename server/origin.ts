export function appOrigin(
  env: Record<string, string | undefined> = process.env,
) {
  const configured = env.APP_ORIGIN?.trim() || env.SITE_URL?.trim();
  if (!configured && env.NODE_ENV === 'production')
    throw new Error('Set APP_ORIGIN or SITE_URL to the public site origin.');
  const url = new URL(configured || 'http://localhost:3000');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error('APP_ORIGIN/SITE_URL must be a plain http(s) origin.');
  return url.origin;
}
