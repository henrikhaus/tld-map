import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { atlasSchema } from '../lib/model';
import { siteServices } from './site';
import { chatServices } from './chat';
import { pruneChatMessages } from './chat-retention';
import { accountSecurity } from './account-security';
import { apiClientIP } from './proxy';
import { appOrigin } from './origin';

const directory = process.env.TLD_DATA_DIR ?? '.data';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const secretFile = `${directory}/auth-secret`;
if (!existsSync(secretFile))
  writeFileSync(secretFile, randomBytes(48).toString('base64url'), {
    mode: 0o600,
  });
const sqlite = new Database(`${directory}/atlas.sqlite`, { create: true });
sqlite.run('PRAGMA journal_mode = WAL');
sqlite.run('PRAGMA foreign_keys = ON');
sqlite.run('PRAGMA busy_timeout = 5000');
const origin = appOrigin();
const auth = betterAuth({
  database: sqlite,
  secret: process.env.BETTER_AUTH_SECRET ?? readFileSync(secretFile, 'utf8'),
  baseURL: origin,
  trustedOrigins: [origin],
  // Chromium caps persistent cookies at 400 days; active sessions renew daily.
  session: {
    expiresIn: 60 * 60 * 24 * 400,
    updateAge: 60 * 60 * 24,
  },
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [username()],
  advanced: { ipAddress: { ipAddressHeaders: ['x-tld-client-ip'] } },
  rateLimit: { enabled: true, window: 60, max: 50 },
});
const migrations = await getMigrations(auth.options);
await migrations.runMigrations();
sqlite.run(
  'CREATE TABLE IF NOT EXISTS atlas (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, body TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)',
);
const snapshots = sqliteTable('atlas', {
  userId: text('user_id').primaryKey(),
  body: text('body').notNull(),
  revision: integer('revision').notNull(),
});
const db = drizzle(sqlite);
const handleSite = siteServices(sqlite, origin);
const handleChat = chatServices(
  sqlite,
  origin,
  process.env.BETTER_AUTH_SECRET ?? readFileSync(secretFile, 'utf8'),
);
const security = accountSecurity(
  sqlite,
  process.env.BETTER_AUTH_SECRET ?? readFileSync(secretFile, 'utf8'),
  origin,
  existsSync(`${directory}/recovery-secrets.json`)
    ? z
        .array(z.string().min(32).max(512))
        .max(10)
        .parse(
          JSON.parse(
            readFileSync(`${directory}/recovery-secrets.json`, 'utf8'),
          ),
        )
    : [],
);
// Sweep while idle as well as on startup and before chat requests.
setInterval(() => {
  try {
    pruneChatMessages(sqlite);
  } catch (error) {
    console.error('Chat expiry cleanup failed', error);
  }
}, 60_000).unref();
const updateSchema = z.object({
  state: atlasSchema,
  revision: z.number().int().min(0),
});
const registration = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_.]+$/),
  password: z.string().min(8).max(128),
});
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.API_PORT ?? 3001),
  maxRequestBodySize: 12 * 1024 * 1024,
  async fetch(request, http) {
    const url = new URL(request.url);
    const clientIP = apiClientIP(
      request,
      http.requestIP(request)?.address ?? 'unknown',
      process.env.TLD_LOCAL_PROXY === 'true',
    );
    const headers = new Headers(request.headers);
    headers.set('x-tld-client-ip', clientIP);
    request = new Request(request, { headers });
    try {
      if (url.pathname === '/api/health') return json({ ok: true });
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        request.headers.get('origin') !== origin
      )
        return json({ error: 'Origin not allowed' }, 403);
      if (url.pathname === '/api/register' && request.method === 'POST') {
        const parsed = registration.safeParse(await request.json());
        if (!parsed.success)
          return json(
            {
              message:
                'Use a username of 3–30 letters, numbers, dots or underscores and a password of at least 8 characters.',
            },
            400,
          );
        const { username: handle, password } = parsed.data;
        const response = await auth.handler(
          new Request(`${origin}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({
              username: handle,
              name: handle,
              email: `${handle.toLowerCase()}@users.tld.invalid`,
              password,
            }),
          }),
        );
        if (!response.ok) return response;
        const data = (await response.json()) as { user: { id: string } };
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'no-store');
        headers.delete('content-length');
        return Response.json(
          { ...data, recoveryCode: security.issue(data.user.id) },
          { status: response.status, headers },
        );
      }
      const securityResponse = await security.handle(
        request,
        () => auth.api.getSession({ headers: request.headers }),
        clientIP,
      );
      if (securityResponse) return securityResponse;
      const chatResponse = await handleChat(
        request,
        () => auth.api.getSession({ headers: request.headers }),
        clientIP,
      );
      if (chatResponse) return chatResponse;
      const siteResponse = await handleSite(
        request,
        () => auth.api.getSession({ headers: request.headers }),
        clientIP,
      );
      if (siteResponse) return siteResponse;
      if (url.pathname.startsWith('/api/auth/')) return auth.handler(request);
      if (url.pathname === '/api/atlas') {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session)
          return json({ error: 'Sign in to access your runs' }, 401);
        const userId = session.user.id;
        if (request.method === 'GET') {
          const record = db
            .select()
            .from(snapshots)
            .where(eq(snapshots.userId, userId))
            .get();
          return json(
            record
              ? { state: JSON.parse(record.body), revision: record.revision }
              : { state: null, revision: 0 },
          );
        }
        if (request.method === 'PUT') {
          const parsed = updateSchema.safeParse(await request.json());
          if (!parsed.success) return json({ error: 'Invalid run data' }, 400);
          const { state, revision } = parsed.data;
          const changed = sqlite.transaction(() => {
            const current = db
              .select()
              .from(snapshots)
              .where(eq(snapshots.userId, userId))
              .get();
            if (!current) {
              if (revision !== 0) return false;
              db.insert(snapshots)
                .values({ userId, body: JSON.stringify(state), revision: 1 })
                .run();
              return true;
            }
            if (current.revision !== revision) return false;
            return !!db
              .update(snapshots)
              .set({ body: JSON.stringify(state), revision: revision + 1 })
              .where(
                and(
                  eq(snapshots.userId, userId),
                  eq(snapshots.revision, revision),
                ),
              )
              .returning({ userId: snapshots.userId })
              .get();
          })();
          return changed
            ? json({ revision: revision + 1 })
            : json(
                {
                  error:
                    'Your account changed in another tab. Your local changes are kept. Reload the account to review the latest saved version.',
                },
                409,
              );
        }
        return json({ error: 'Method not allowed' }, 405);
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof SyntaxError)
        return json({ error: 'Invalid JSON request' }, 400);
      if (error instanceof Error && error.message === 'body-size')
        return json({ error: 'Request too large' }, 413);
      console.error(
        'API request failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return json(
        { error: 'Could not complete the request. Please try again.' },
        500,
      );
    }
  },
});
console.log(`Atlas API ready at http://127.0.0.1:${server.port}`);
