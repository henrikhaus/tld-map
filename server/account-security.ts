import type { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { z } from 'zod';

type Session = {
  user: { id: string; username?: string | null; name: string };
} | null;
const passwordSchema = z.string().min(8).max(128);
const recoverySchema = z
  .object({
    username: z.string().trim().min(3).max(30),
    code: z.string().trim().max(100),
    newPassword: passwordSchema,
  })
  .strict();
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function accountSecurity(db: Database, secret: string, origin: string) {
  if (
    !db
      .query('SELECT id FROM site_migrations WHERE id=?')
      .get('004-account-recovery')
  )
    db.transaction(() => {
      db.run(
        readFileSync(
          new URL('./migrations/004-account-recovery.sql', import.meta.url),
          'utf8',
        ),
      );
      db.run('INSERT INTO site_migrations VALUES (?,?)', [
        '004-account-recovery',
        Date.now(),
      ]);
    })();
  const digest = (value: string) =>
    createHmac('sha256', secret).update(value).digest('hex');
  const normalize = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();
  const makeCode = () =>
    randomBytes(24).toString('hex').toUpperCase().match(/.{8}/g)!.join('-');
  function issue(userId: string) {
    const code = makeCode();
    db.run(
      'INSERT INTO account_recovery VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,updated_at=excluded.updated_at',
      [userId, digest(normalize(code)), Date.now()],
    );
    return code;
  }
  function limited(key: string, max: number) {
    const now = Date.now();
    db.run('DELETE FROM account_security_limits WHERE expires<=?', [now]);
    const row = db
      .query(
        'INSERT INTO account_security_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
      )
      .get(digest(key), now + 15 * 60 * 1000) as { count: number };
    return row.count > max;
  }
  const credential = (id: string) =>
    db
      .query(
        "SELECT id,password FROM account WHERE userId=? AND providerId='credential'",
      )
      .get(id) as { id: string; password: string } | null;
  const same = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  async function handle(
    request: Request,
    getSession: () => Promise<Session>,
    network: string,
  ) {
    const path = new URL(request.url).pathname;
    if (path !== '/api/account' && !path.startsWith('/api/account/'))
      return null;
    if (!['GET', 'POST', 'DELETE'].includes(request.method))
      return json({ error: 'Method not allowed' }, 405);
    if (request.method !== 'GET' && request.headers.get('origin') !== origin)
      return json({ error: 'Origin not allowed' }, 403);
    if (Number(request.headers.get('content-length') ?? 0) > 4096)
      return json({ error: 'Request too large' }, 413);
    async function body() {
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 4096) throw new Error('body-size');
      return JSON.parse(raw);
    }
    if (path === '/api/account/recover' && request.method === 'POST') {
      if (limited(`recover-network:${network}`, 30))
        return json(
          { error: 'Too many recovery attempts. Try again in 15 minutes.' },
          429,
        );
      const parsed = recoverySchema.safeParse(await body());
      if (!parsed.success)
        return json(
          {
            error:
              'Enter your username, recovery code, and a new password of 8–128 characters.',
          },
          400,
        );
      const { username, code, newPassword } = parsed.data;
      if (limited(`recover-user:${username.toLowerCase()}`, 5))
        return json(
          { error: 'Too many recovery attempts. Try again in 15 minutes.' },
          429,
        );
      const record = db
        .query(
          'SELECT r.user_id,r.code_hash FROM account_recovery r JOIN user u ON u.id=r.user_id WHERE lower(u.username)=?',
        )
        .get(username.toLowerCase()) as {
        user_id: string;
        code_hash: string;
      } | null;
      const supplied = digest(normalize(code));
      if (!same(record?.code_hash ?? '0'.repeat(64), supplied) || !record)
        return json({ error: 'Username or recovery code is incorrect.' }, 400);
      const password = await hashPassword(newPassword);
      const replacement = db.transaction(() => {
        const latest = db
          .query('SELECT code_hash FROM account_recovery WHERE user_id=?')
          .get(record.user_id) as { code_hash: string } | null;
        if (
          !latest ||
          !same(latest.code_hash, supplied) ||
          !credential(record.user_id)
        )
          return null;
        db.run(
          "UPDATE account SET password=?,updatedAt=? WHERE userId=? AND providerId='credential'",
          [password, Date.now(), record.user_id],
        );
        db.run('DELETE FROM session WHERE userId=?', [record.user_id]);
        return issue(record.user_id);
      })();
      return replacement
        ? json({ recoveryCode: replacement })
        : json({ error: 'Username or recovery code is incorrect.' }, 400);
    }
    const session = await getSession();
    if (!session)
      return json({ error: 'Sign in to manage your account.' }, 401);
    const userId = session.user.id;
    if (path === '/api/account/recovery' && request.method === 'GET')
      return json({
        hasRecoveryCode: !!db
          .query('SELECT user_id FROM account_recovery WHERE user_id=?')
          .get(userId),
      });
    if (
      !(
        (path === '/api/account/recovery' && request.method === 'POST') ||
        (path === '/api/account' && request.method === 'DELETE')
      )
    )
      return json({ error: 'Not found' }, 404);
    if (
      limited(`security-user:${userId}`, 8) ||
      limited(`security-network:${network}`, 40)
    )
      return json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        429,
      );
    const parsed = z
      .object({
        password: passwordSchema,
        confirmation: z.string().max(30).optional(),
      })
      .strict()
      .safeParse(await body());
    if (!parsed.success)
      return json({ error: 'Enter your current password.' }, 400);
    const account = credential(userId);
    if (
      !account ||
      !(await verifyPassword({
        hash: account.password,
        password: parsed.data.password,
      }))
    )
      return json({ error: 'Current password is incorrect.' }, 400);
    if ((await getSession())?.user.id !== userId)
      return json({ error: 'Sign in again to continue.' }, 401);
    if (path === '/api/account/recovery') {
      const code = db.transaction(() => {
        if (
          credential(userId)?.password !== account.password ||
          !db.query('SELECT id FROM session WHERE userId=?').get(userId)
        )
          return null;
        return issue(userId);
      })();
      return code
        ? json({ recoveryCode: code })
        : json({ error: 'Sign in again to continue.' }, 401);
    }
    if (
      parsed.data.confirmation !== (session.user.username ?? session.user.name)
    )
      return json(
        { error: 'Type your username to confirm account deletion.' },
        400,
      );
    const deleted = db.transaction(() => {
      if (credential(userId)?.password !== account.password) return false;
      const people = db
        .query('SELECT id FROM chat_people WHERE user_id=?')
        .all(userId) as { id: string }[];
      for (const { id } of people) {
        db.run(
          'DELETE FROM chat_flags WHERE person_id=? OR message_id IN (SELECT id FROM chat_messages WHERE person_id=?)',
          [id, id],
        );
        db.run('DELETE FROM chat_messages WHERE person_id=?', [id]);
        db.run('DELETE FROM chat_reactions WHERE person_id=?', [id]);
        // Keep only the pseudonymous moderation identity so deletion cannot clear a ban.
        db.run(
          'UPDATE chat_people SET user_id=NULL,guest_name=?,guest_hash=NULL WHERE id=?',
          [`Deleted-${id}`, id],
        );
      }
      db.run('UPDATE chat_meta SET revision=revision+1 WHERE id=1');
      db.run('DELETE FROM chat_mod_log WHERE admin_id=?', [userId]);
      db.run('DELETE FROM site_reports WHERE user_id=?', [userId]);
      db.run('DELETE FROM user WHERE id=?', [userId]);
      return true;
    })();
    return deleted
      ? json({ deleted: true })
      : json({ error: 'Sign in again to continue.' }, 401);
  }
  return { issue, handle };
}
