import type { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  ADMIN_CHAT_COLOR,
  CHAT_COLORS,
  chatMessageSchema,
  chatColorSchema,
  chatModerationSchema,
  reactionSchema,
  closestChatColor,
  CHAT_MESSAGE_INTERVAL,
  type ChatMessage,
  type ChatMe,
} from '../lib/chat';
import { chatPolicyError, duplicateKey } from './chat-policy';
import { pruneChatMessages } from './chat-retention';
type Session = {
  user: { id: string; username?: string | null; name: string };
} | null;
type Person = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  color: string;
  username: string | null;
  admin: number;
  last_sent: number;
};
const personSelect =
  'SELECT p.*,u.username,CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END admin FROM chat_people p LEFT JOIN user u ON u.id=p.user_id LEFT JOIN site_admin a ON a.user_id=p.user_id';
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
export function chatServices(db: Database, origin: string, secret: string) {
  for (const migration of ['002-chat', '003-chat-retention']) {
    if (!db.query('SELECT id FROM site_migrations WHERE id=?').get(migration))
      db.transaction(() => {
        db.run(
          readFileSync(
            new URL(`./migrations/${migration}.sql`, import.meta.url),
            'utf8',
          ),
        );
        db.run('INSERT INTO site_migrations VALUES (?,?)', [
          migration,
          Date.now(),
        ]);
      })();
  }
  pruneChatMessages(db);
  const hash = (value: string) =>
    createHmac('sha256', secret).update(value).digest('hex');
  const bump = () =>
    db.run('UPDATE chat_meta SET revision=revision+1 WHERE id=1');
  const person = (id: string) =>
    db.query(`${personSelect} WHERE p.id=?`).get(id) as Person | null;
  const publicPerson = (p: Person) => ({
    id: p.id,
    name:
      p.username && !chatPolicyError(p.username)
        ? p.username
        : (p.guest_name ?? `Survivor${p.id.slice(0, 5)}`),
    color: p.admin ? ADMIN_CHAT_COLOR : closestChatColor(p.color),
    admin: !!p.admin,
    anonymous: !p.user_id,
  });
  function restriction(p: Person, guestId: string | null) {
    if (p.admin) return null;
    return db
      .query(
        `SELECT kind,until_at until,reason FROM chat_restrictions WHERE (person_id=? OR person_id=? OR person_id IN (SELECT account_id FROM chat_links WHERE guest_id=?)) AND (kind='ban' OR until_at>?) ORDER BY CASE kind WHEN 'ban' THEN 0 ELSE 1 END,until_at DESC LIMIT 1`,
      )
      .get(p.id, guestId, guestId, Date.now()) as ChatMe['restriction'];
  }
  function limit(key: string, max: number, window: number) {
    const now = Date.now();
    db.run('DELETE FROM chat_limits WHERE expires<?', [now]);
    const item = db
      .query('SELECT count,expires FROM chat_limits WHERE key=?')
      .get(key) as { count: number; expires: number } | null;
    if (item && item.count >= max) return item.expires - now;
    db.run(
      'INSERT INTO chat_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
      [key, now + window],
    );
    return 0;
  }
  function readMessages(
    actor: Person,
    where: string,
    args: (number | string)[],
    limitCount: number,
  ): ChatMessage[] {
    const rows = db
      .query(
        `SELECT id,person_id,body,created_at,deleted FROM chat_messages ${where} ORDER BY id DESC LIMIT ?`,
      )
      .all(...args, limitCount) as {
      id: number;
      person_id: string;
      body: string;
      created_at: number;
      deleted: number;
    }[];
    if (!rows.length) return [];
    const authorIds = [...new Set(rows.map((row) => row.person_id))];
    const people = new Map(
      (
        db
          .query(
            `${personSelect} WHERE p.id IN (${authorIds.map(() => '?').join(',')})`,
          )
          .all(...authorIds) as Person[]
      ).map((p) => [p.id, p]),
    );
    const grouped = new Map<number, ChatMessage['reactions']>();
    const reactions = db
      .query(
        `SELECT message_id,emoji,COUNT(*) count,MAX(person_id=?) mine FROM chat_reactions WHERE message_id IN (${rows.map(() => '?').join(',')}) GROUP BY message_id,emoji ORDER BY emoji`,
      )
      .all(actor.id, ...rows.map((row) => row.id)) as {
      message_id: number;
      emoji: ChatMessage['reactions'][number]['emoji'];
      count: number;
      mine: number;
    }[];
    for (const reaction of reactions) {
      const list = grouped.get(reaction.message_id) ?? [];
      list.push({
        emoji: reaction.emoji,
        count: reaction.count,
        mine: !!reaction.mine,
      });
      grouped.set(reaction.message_id, list);
    }
    return rows.reverse().map((row) => ({
      id: row.id,
      text: row.deleted ? '' : row.body,
      createdAt: row.created_at,
      deleted: !!row.deleted,
      author: publicPerson(people.get(row.person_id)!),
      reactions: row.deleted ? [] : (grouped.get(row.id) ?? []),
    }));
  }

  return async (
    request: Request,
    getSession: () => Promise<Session>,
    address: string,
  ) => {
    const url = new URL(request.url),
      path = url.pathname;
    if (!path.startsWith('/api/chat/')) return null;
    const session = await getSession(),
      now = Date.now();
    pruneChatMessages(db, now);
    if (Number(request.headers.get('content-length') ?? 0) > 8192)
      return json({ error: 'Chat requests are too large.' }, 413);
    const network = hash(`network:${address}`);
    const token = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)tld_chat=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
    let guest = token
      ? (db
          .query(`${personSelect} WHERE p.guest_hash=?`)
          .get(hash(token)) as Person | null)
      : null;
    let p = session
      ? (db
          .query(`${personSelect} WHERE p.user_id=?`)
          .get(session.user.id) as Person | null)
      : guest;
    const readRetry = limit(`read:${network}`, 6000, 60000);
    if (readRetry)
      return json(
        {
          error: 'Chat is busy. Please try again shortly.',
          retryAfterMs: readRetry,
        },
        429,
      );
    if (path === '/api/chat/session' && request.method === 'POST') {
      let cookie = '';
      if (!guest) {
        const retry = limit(`identity:${network}`, 60, 60000);
        if (retry)
          return json(
            {
              error: 'Please wait before opening another chat identity.',
              retryAfterMs: retry,
            },
            429,
          );
        const raw = randomBytes(32).toString('base64url'),
          id = crypto.randomUUID();
        let name = '';
        do {
          name = `Anonymous${randomInt(10000, 99999999)}`;
        } while (
          db.query('SELECT 1 FROM chat_people WHERE guest_name=?').get(name)
        );
        db.run(
          'INSERT INTO chat_people(id,guest_hash,guest_name,color,created_at) VALUES (?,?,?,?,?)',
          [
            id,
            hash(raw),
            name,
            CHAT_COLORS[randomInt(CHAT_COLORS.length)],
            now,
          ],
        );
        guest = person(id)!;
        cookie = `tld_chat=${raw}; Path=/api/chat; HttpOnly; SameSite=Strict; Max-Age=31536000${origin.startsWith('https:') ? '; Secure' : ''}`;
      }
      if (session) {
        if (!p) {
          const id = crypto.randomUUID();
          db.run(
            'INSERT INTO chat_people(id,user_id,color,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO NOTHING',
            [
              id,
              session.user.id,
              CHAT_COLORS[randomInt(CHAT_COLORS.length)],
              now,
            ],
          );
          p = db
            .query(`${personSelect} WHERE p.user_id=?`)
            .get(session.user.id) as Person;
        }
        db.run('INSERT OR IGNORE INTO chat_links VALUES (?,?)', [
          guest.id,
          p.id,
        ]);
      } else p = guest;
      return json(
        { me: { ...publicPerson(p!), restriction: restriction(p!, guest.id) } },
        200,
        cookie ? { 'Set-Cookie': cookie } : {},
      );
    }
    if (!p || !guest)
      return json(
        { error: 'Open chat again to establish your identity.' },
        401,
      );
    // Linking on every request prevents sign-in/out from clearing a restriction.
    if (session)
      db.run('INSERT OR IGNORE INTO chat_links VALUES (?,?)', [guest.id, p.id]);
    const actor = p,
      blocked = restriction(actor, guest.id),
      me = { ...publicPerson(actor), restriction: blocked };
    const checkRestriction = () => {
      const current = restriction(person(actor.id)!, guest!.id);
      return current
        ? json(
            {
              error:
                current.kind === 'ban'
                  ? 'You are banned from chat.'
                  : `You are timed out until ${new Date(current.until!).toISOString()}.`,
              restriction: current,
            },
            403,
          )
        : null;
    };
    const parseBody = async () => {
      const body = await request.text();
      if (Buffer.byteLength(body) > 8192) throw new Error('body-size');
      return JSON.parse(body);
    };
    if (path === '/api/chat/messages' && request.method === 'GET') {
      const parsed = z
        .object({
          oldest: z.coerce.number().int().min(0),
          before: z.coerce.number().int().min(0),
          since: z.coerce.number().int().min(-1),
        })
        .safeParse({
          oldest: url.searchParams.get('oldest') ?? 0,
          before: url.searchParams.get('before') ?? 0,
          since: url.searchParams.get('since') ?? -1,
        });
      if (!parsed.success) return json({ error: 'Invalid chat cursor' }, 400);
      const { oldest, before, since } = parsed.data,
        revision = (
          db.query('SELECT revision FROM chat_meta WHERE id=1').get() as {
            revision: number;
          }
        ).revision;
      if (since === revision && !before) return json({ revision, me });
      const messages = readMessages(
        actor,
        before ? 'WHERE id<?' : oldest ? 'WHERE id>=?' : '',
        before ? [before] : oldest ? [oldest] : [],
        oldest ? 200 : 50,
      );
      const hasOlder =
        !!messages.length &&
        !!db
          .query('SELECT 1 FROM chat_messages WHERE id<? LIMIT 1')
          .get(messages[0].id);
      return json({ revision, me, messages, hasOlder });
    }
    if (path.startsWith('/api/chat/moderation')) {
      if (!actor.admin) return json({ error: 'Admin access required' }, 403);
      if (path === '/api/chat/moderation' && request.method === 'GET')
        return json({
          stats: {
            messages: (
              db.query('SELECT COUNT(*) n FROM chat_messages').get() as {
                n: number;
              }
            ).n,
            today: (
              db
                .query(
                  'SELECT COUNT(*) n FROM chat_messages WHERE created_at>=?',
                )
                .get(now - 86400000) as { n: number }
            ).n,
            restrictions: (
              db
                .query(
                  "SELECT COUNT(*) n FROM chat_restrictions WHERE kind='ban' OR until_at>?",
                )
                .get(now) as { n: number }
            ).n,
            flags: (
              db
                .query(
                  'SELECT COUNT(DISTINCT message_id) n FROM chat_flags WHERE resolved=0',
                )
                .get() as { n: number }
            ).n,
          },
          restrictions: (
            db
              .query(
                "SELECT person_id,kind,until_at until,reason FROM chat_restrictions WHERE kind='ban' OR until_at>? ORDER BY kind,until_at DESC LIMIT 200",
              )
              .all(now) as {
              person_id: string;
              kind: string;
              until: number | null;
              reason: string;
            }[]
          ).map((r) => ({
            personId: r.person_id,
            name: publicPerson(person(r.person_id)!).name,
            kind: r.kind,
            until: r.until,
            reason: r.reason,
          })),
          flags: (
            db
              .query(
                'SELECT f.message_id,COUNT(*) count,group_concat(DISTINCT f.reason) reason,m.person_id,m.body,m.deleted FROM chat_flags f JOIN chat_messages m ON m.id=f.message_id WHERE f.resolved=0 GROUP BY f.message_id ORDER BY count DESC LIMIT 100',
              )
              .all() as {
              message_id: number;
              count: number;
              reason: string;
              person_id: string;
              body: string;
              deleted: number;
            }[]
          ).map((r) => ({
            messageId: r.message_id,
            count: r.count,
            reason: r.reason,
            personId: r.person_id,
            name: publicPerson(person(r.person_id)!).name,
            text: r.deleted ? '[Removed]' : r.body,
          })),
          log: (
            db
              .query('SELECT * FROM chat_mod_log ORDER BY id DESC LIMIT 100')
              .all() as {
              id: number;
              person_id: string;
              action: string;
              reason: string;
              created_at: number;
            }[]
          ).map((r) => ({
            id: r.id,
            name: publicPerson(person(r.person_id)!).name,
            action: r.action,
            reason: r.reason,
            createdAt: r.created_at,
          })),
        });
      if (path === '/api/chat/moderation' && request.method === 'POST') {
        const parsed = chatModerationSchema.safeParse(await parseBody());
        if (!parsed.success)
          return json(
            { error: 'Choose a person, action, duration and reason.' },
            400,
          );
        if (!person(actor.id)?.admin)
          return json({ error: 'Admin access required' }, 403);
        const value = parsed.data,
          target = person(value.personId);
        if (!target) return json({ error: 'Chat participant not found' }, 404);
        if (target.admin)
          return json(
            { error: 'The administrator cannot be restricted.' },
            400,
          );
        db.transaction(() => {
          if (value.action === 'lift')
            db.run('DELETE FROM chat_restrictions WHERE person_id=?', [
              target.id,
            ]);
          else
            db.run(
              'INSERT INTO chat_restrictions VALUES (?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET kind=excluded.kind,until_at=excluded.until_at,reason=excluded.reason',
              [
                target.id,
                value.action,
                value.action === 'timeout'
                  ? now + value.minutes! * 60000
                  : null,
                value.reason,
              ],
            );
          db.run(
            'INSERT INTO chat_mod_log(person_id,admin_id,action,reason,created_at) VALUES (?,?,?,?,?)',
            [target.id, session!.user.id, value.action, value.reason, now],
          );
          bump();
        })();
        return json({ ok: true });
      }
      const flagId = path.match(/^\/api\/chat\/moderation\/flags\/(\d+)$/)?.[1];
      if (flagId && request.method === 'DELETE') {
        db.transaction(() => {
          const message = db
            .query('SELECT person_id FROM chat_messages WHERE id=?')
            .get(Number(flagId)) as { person_id: string } | null;
          const changed = db
            .query(
              'UPDATE chat_flags SET resolved=1 WHERE message_id=? AND resolved=0 RETURNING message_id',
            )
            .all(Number(flagId));
          if (message && changed.length)
            db.run(
              'INSERT INTO chat_mod_log(person_id,admin_id,action,reason,created_at) VALUES (?,?,?,?,?)',
              [
                message.person_id,
                session!.user.id,
                'dismiss flags',
                `Dismissed flags for message #${flagId}`,
                now,
              ],
            );
        })();
        return json({ ok: true });
      }
    }
    if (blocked && request.method !== 'GET')
      return json(
        {
          error:
            blocked.kind === 'ban'
              ? 'You are banned from chat.'
              : `You are timed out until ${new Date(blocked.until!).toISOString()}.`,
          restriction: blocked,
        },
        403,
      );
    if (path === '/api/chat/profile' && request.method === 'PUT') {
      const parsed = chatColorSchema.safeParse(await parseBody());
      if (!parsed.success) return json({ error: 'Choose a valid color.' }, 400);
      const denied = checkRestriction();
      if (denied) return denied;
      if (limit(`color:${actor.id}`, 10, 60000))
        return json({ error: 'Please wait before changing color again.' }, 429);
      db.run('UPDATE chat_people SET color=? WHERE id=?', [
        parsed.data.color,
        actor.id,
      ]);
      bump();
      return json({
        me: { ...publicPerson(person(actor.id)!), restriction: blocked },
      });
    }
    if (path === '/api/chat/messages' && request.method === 'POST') {
      const parsed = chatMessageSchema.safeParse(await parseBody());
      if (!parsed.success)
        return json({ error: 'Messages must be 1–800 characters.' }, 400);
      const { nonce, text } = parsed.data;
      return db.transaction(() => {
        const denied = checkRestriction();
        if (denied) return denied;
        const previous = db
          .query('SELECT id FROM chat_messages WHERE person_id=? AND nonce=?')
          .get(actor.id, nonce) as { id: number } | null;
        if (previous)
          return json({
            message: readMessages(actor, 'WHERE id=?', [previous.id], 1)[0],
          });
        const attemptRetry = limit(`attempt:${actor.id}`, 60, 60000);
        if (attemptRetry)
          return json(
            {
              error: 'Please slow down before trying again.',
              retryAfterMs: attemptRetry,
            },
            429,
          );
        const policy = chatPolicyError(text);
        if (policy) return json({ error: policy }, 400);
        const latest = person(actor.id)!,
          cooldown =
            CHAT_MESSAGE_INTERVAL -
            (now - Math.max(latest.last_sent, person(guest!.id)!.last_sent));
        if (cooldown > 0)
          return json(
            {
              error: 'Wait at least one second between messages.',
              retryAfterMs: cooldown,
            },
            429,
            { 'Retry-After': '1' },
          );
        const duplicate = duplicateKey(text);
        if (
          db
            .query(
              'SELECT 1 FROM chat_messages WHERE person_id=? AND normalized=? AND created_at>?',
            )
            .get(actor.id, duplicate, now - 60000)
        )
          return json(
            {
              error: 'Please avoid repeating the same message within a minute.',
            },
            429,
          );
        const minute = (
            db
              .query(
                'SELECT COUNT(*) n FROM chat_messages WHERE person_id=? AND created_at>?',
              )
              .get(actor.id, now - 60000) as { n: number }
          ).n,
          hour = (
            db
              .query(
                'SELECT COUNT(*) n FROM chat_messages WHERE person_id=? AND created_at>?',
              )
              .get(actor.id, now - 3600000) as { n: number }
          ).n;
        if (minute >= 20 || hour >= 120)
          return json(
            {
              error:
                'You are sending messages too quickly. Please take a short break.',
              retryAfterMs: minute >= 20 ? 60000 : 3600000,
            },
            429,
          );
        const retry = limit(`send:${network}`, 240, 60000);
        if (retry)
          return json(
            {
              error:
                'Too many messages from this network. Please try again shortly.',
              retryAfterMs: retry,
            },
            429,
          );
        const result = db
          .query(
            'INSERT INTO chat_messages(person_id,nonce,body,normalized,created_at) VALUES (?,?,?,?,?) RETURNING id',
          )
          .get(actor.id, nonce, text, duplicate, now) as { id: number };
        db.run('UPDATE chat_people SET last_sent=? WHERE id IN (?,?)', [
          now,
          actor.id,
          guest!.id,
        ]);
        bump();
        return json(
          { message: readMessages(actor, 'WHERE id=?', [result.id], 1)[0] },
          201,
        );
      })();
    }
    const messageId = path.match(
      /^\/api\/chat\/messages\/(\d+)(?:\/(reactions|report))?$/,
    );
    if (messageId) {
      const id = Number(messageId[1]),
        action = messageId[2],
        message = db
          .query('SELECT person_id,deleted FROM chat_messages WHERE id=?')
          .get(id) as { person_id: string; deleted: number } | null;
      if (!message) return json({ error: 'Message not found' }, 404);
      if (!action && request.method === 'DELETE') {
        if (!actor.admin) return json({ error: 'Admin access required' }, 403);
        db.transaction(() => {
          db.run('UPDATE chat_messages SET deleted=1 WHERE id=?', [id]);
          db.run('DELETE FROM chat_reactions WHERE message_id=?', [id]);
          db.run('UPDATE chat_flags SET resolved=1 WHERE message_id=?', [id]);
          db.run(
            'INSERT INTO chat_mod_log(person_id,admin_id,action,reason,created_at) VALUES (?,?,?,?,?)',
            [
              message.person_id,
              session!.user.id,
              'remove',
              `Removed message #${id}`,
              now,
            ],
          );
          bump();
        })();
        return json({ ok: true });
      }
      if (message.deleted)
        return json({ error: 'That message was removed' }, 410);
      if (action === 'reactions' && request.method === 'PUT') {
        const parsed = reactionSchema.safeParse(await parseBody());
        if (!parsed.success)
          return json({ error: 'Choose a supported reaction' }, 400);
        const denied = checkRestriction();
        if (denied) return denied;
        const retry = limit(`react:${actor.id}`, 20, 10000);
        if (retry)
          return json(
            { error: 'Please slow down with reactions.', retryAfterMs: retry },
            429,
          );
        if (parsed.data.active)
          db.run('INSERT OR IGNORE INTO chat_reactions VALUES (?,?,?)', [
            id,
            actor.id,
            parsed.data.emoji,
          ]);
        else
          db.run(
            'DELETE FROM chat_reactions WHERE message_id=? AND person_id=? AND emoji=?',
            [id, actor.id, parsed.data.emoji],
          );
        bump();
        return json({ message: readMessages(actor, 'WHERE id=?', [id], 1)[0] });
      }
      if (action === 'report' && request.method === 'POST') {
        const parsed = z
          .object({
            reason: z.enum(['spam', 'hate speech', 'harassment', 'other']),
          })
          .strict()
          .safeParse(await parseBody());
        if (!parsed.success)
          return json({ error: 'Choose a report reason' }, 400);
        const denied = checkRestriction();
        if (denied) return denied;
        if (limit(`flag:${actor.id}`, 10, 3600000))
          return json(
            { error: 'Please wait before sending more chat reports.' },
            429,
          );
        db.run(
          'INSERT INTO chat_flags(message_id,person_id,reason) VALUES (?,?,?) ON CONFLICT(message_id,person_id) DO NOTHING',
          [id, actor.id, parsed.data.reason],
        );
        return json({ ok: true });
      }
    }
    return json({ error: 'Not found' }, 404);
  };
}
