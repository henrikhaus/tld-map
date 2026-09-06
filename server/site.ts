import type { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { reportSchema, reportUpdateSchema, trafficSchema } from '../lib/site';

type Session = {
  user: { id: string; name: string; username?: string | null };
} | null;
const day = 86400000;
const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
export function siteServices(db: Database, origin: string) {
  db.run(
    'CREATE TABLE IF NOT EXISTS site_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  if (
    !db
      .query('SELECT id FROM site_migrations WHERE id = ?')
      .get('001-site-admin')
  ) {
    db.transaction(() => {
      db.run(
        readFileSync(
          new URL('./migrations/001-site-admin.sql', import.meta.url),
          'utf8',
        ),
      );
      db.run('INSERT INTO site_migrations VALUES (?, ?)', [
        '001-site-admin',
        Date.now(),
      ]);
    })();
  }
  const count = (sql: string, ...params: (number | string)[]) =>
    (db.query(sql).get(...params) as { n: number }).n;
  let lastPrune = 0;
  const limits = new Map<string, { count: number; until: number }>();
  function allow(key: string, max: number, window: number) {
    const now = Date.now();
    if (limits.size > 10000)
      for (const [key, value] of limits)
        if (value.until < now) limits.delete(key);
    const value = limits.get(key);
    if (!value || value.until < now) {
      limits.set(key, { count: 1, until: now + window });
      return true;
    }
    return ++value.count <= max;
  }
  const isAdmin = (session: Session) =>
    !!session &&
    !!db
      .query('SELECT 1 FROM site_admin WHERE singleton = 1 AND user_id = ?')
      .get(session.user.id);
  const existingVisit = (request: Request) => {
    const id = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)tld_visit=([a-f0-9-]{36})(?:;|$)/)?.[1];
    return id &&
      db
        .query('SELECT id FROM site_visits WHERE id = ? AND last_seen >= ?')
        .get(id, Date.now() - 1800000)
      ? id
      : null;
  };
  return async function handle(
    request: Request,
    getSession: () => Promise<Session>,
    address: string,
  ) {
    const url = new URL(request.url),
      path = url.pathname;
    if (!path.startsWith('/api/site/') && !path.startsWith('/api/admin/'))
      return null;
    const session = await getSession();
    if (path === '/api/site/me' && request.method === 'GET')
      return json({ admin: isAdmin(session) });
    if (path === '/api/site/reports' && request.method === 'POST') {
      const parsed = reportSchema.safeParse(await request.json());
      if (!parsed.success)
        return json(
          {
            error:
              'Add a title, a description of at least 10 characters, and a valid email if provided.',
          },
          400,
        );
      const report = parsed.data;
      if (db.query('SELECT id FROM site_reports WHERE id = ?').get(report.id))
        return json({ id: report.id });
      if (
        !allow(
          `report:${session?.user.id ?? existingVisit(request) ?? address}`,
          10,
          3600000,
        )
      )
        return json(
          {
            error:
              'You have sent several reports recently. Please try again in an hour.',
          },
          429,
        );
      const now = Date.now();
      db.run(
        'INSERT INTO site_reports (id,kind,title,body,contact,user_id,page,map_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [
          report.id,
          report.kind,
          report.title,
          report.body,
          report.contact,
          session?.user.id ?? null,
          report.page,
          report.mapId,
          now,
          now,
        ],
      );
      return json({ id: report.id }, 201);
    }
    if (path === '/api/site/traffic' && request.method === 'POST') {
      const parsed = trafficSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: 'Invalid page event' }, 400);
      if (
        db.query('SELECT id FROM site_events WHERE id = ?').get(parsed.data.id)
      )
        return json({ ok: true });
      if (!allow(`traffic:${address}`, 600, 60000))
        return json({ error: 'Too many requests' }, 429);
      if (
        /bot|crawler|spider|headless/i.test(
          request.headers.get('user-agent') ?? '',
        )
      )
        return json({ ok: true });
      const event = parsed.data,
        now = Date.now(),
        visit = existingVisit(request) ?? crypto.randomUUID();
      let referrer = '';
      try {
        const hostname = new URL(`https://${event.referrer}`).hostname;
        if (hostname !== new URL(origin).hostname) referrer = hostname;
      } catch {
        /* Direct visit. */
      }
      db.transaction(() => {
        // Keep aggregate reporting bounded to the last 90 days.
        if (now - lastPrune > day) {
          db.run('DELETE FROM site_events WHERE created_at < ?', [
            now - 90 * day,
          ]);
          db.run('DELETE FROM site_visits WHERE last_seen < ?', [
            now - 90 * day,
          ]);
          lastPrune = now;
        }
        db.run(
          'INSERT INTO site_visits VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen',
          [visit, now, now, event.device, referrer],
        );
        db.run('INSERT INTO site_events VALUES (?,?,?,?,?)', [
          event.id,
          visit,
          event.page,
          event.mapId,
          now,
        ]);
        if (session)
          db.run(
            'INSERT INTO site_user_activity VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen=excluded.last_seen',
            [session.user.id, now],
          );
      })();
      return json({ ok: true }, 200, {
        'Set-Cookie': `tld_visit=${visit}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=1800${origin.startsWith('https:') ? '; Secure' : ''}`,
      });
    }
    if (!path.startsWith('/api/admin/'))
      return json({ error: 'Not found' }, 404);
    if (!session) return json({ error: 'Sign in to continue' }, 401);
    if (!isAdmin(session)) return json({ error: 'Admin access required' }, 403);
    if (path === '/api/admin/overview' && request.method === 'GET') {
      const parsed = z.coerce
        .number()
        .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
        .safeParse(url.searchParams.get('days') ?? 30);
      if (!parsed.success)
        return json({ error: 'Invalid reporting range' }, 400);
      const days = parsed.data,
        since = new Date().setUTCHours(0, 0, 0, 0) - (days - 1) * day;
      const daily = db
        .query(
          "SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') day, COUNT(*) pageViews, COUNT(DISTINCT visit_id) visits FROM site_events WHERE created_at >= ? GROUP BY day ORDER BY day",
        )
        .all(since);
      return json({
        days,
        trackingSince: (
          db
            .query('SELECT applied_at FROM site_migrations WHERE id = ?')
            .get('001-site-admin') as { applied_at: number }
        ).applied_at,
        totals: {
          users: count('SELECT COUNT(*) n FROM user'),
          activeUsers: count(
            'SELECT COUNT(*) n FROM site_user_activity WHERE last_seen >= ?',
            since,
          ),
          runs: count(
            "SELECT COUNT(*) n FROM atlas,json_each(atlas.body,'$.runs')",
          ),
          annotations: count(
            "SELECT COALESCE(SUM(json_array_length(a.value)),0) n FROM atlas,json_each(atlas.body,'$.runs') r,json_each(r.value,'$.annotations') a",
          ),
          openReports: count(
            "SELECT COUNT(*) n FROM site_reports WHERE status IN ('new','planned','in-progress')",
          ),
          pageViews: count(
            'SELECT COUNT(*) n FROM site_events WHERE created_at >= ?',
            since,
          ),
          visits: count(
            'SELECT COUNT(DISTINCT visit_id) n FROM site_events WHERE created_at >= ?',
            since,
          ),
        },
        daily,
        pages: db
          .query(
            'SELECT page,map_id mapId,COUNT(*) views FROM site_events WHERE created_at >= ? GROUP BY page,map_id ORDER BY views DESC LIMIT 12',
          )
          .all(since),
        referrers: db
          .query(
            'SELECT v.referrer,COUNT(DISTINCT v.id) visits FROM site_visits v JOIN site_events e ON e.visit_id=v.id WHERE e.created_at >= ? GROUP BY v.referrer ORDER BY visits DESC LIMIT 10',
          )
          .all(since),
        devices: db
          .query(
            'SELECT v.device,COUNT(DISTINCT v.id) visits FROM site_visits v JOIN site_events e ON e.visit_id=v.id WHERE e.created_at >= ? GROUP BY v.device ORDER BY visits DESC',
          )
          .all(since),
      });
    }
    if (
      (path === '/api/admin/users' || path === '/api/admin/reports') &&
      request.method === 'GET'
    ) {
      const parsed = z
        .object({
          offset: z.coerce.number().int().min(0).max(100000),
          search: z.string().max(120),
        })
        .safeParse({
          offset: url.searchParams.get('offset') ?? 0,
          search: url.searchParams.get('search') ?? '',
        });
      if (!parsed.success) return json({ error: 'Invalid query' }, 400);
      const { offset, search } = parsed.data,
        query = `%${search.replace(/[\\%_]/g, '\\$&')}%`,
        limit = 30;
      if (path.endsWith('/users'))
        return json({
          total: count(
            "SELECT COUNT(*) n FROM user WHERE username LIKE ? ESCAPE '\\'",
            query,
          ),
          users: db
            .query(
              "SELECT u.id,u.username,u.createdAt,a.last_seen lastSeen,COALESCE(json_array_length(s.body,'$.runs'),0) runs FROM user u LEFT JOIN atlas s ON s.user_id=u.id LEFT JOIN site_user_activity a ON a.user_id=u.id WHERE u.username LIKE ? ESCAPE '\\' ORDER BY u.createdAt DESC,u.id LIMIT ? OFFSET ?",
            )
            .all(query, limit, offset),
        });
      const status = url.searchParams.get('status') ?? 'all',
        kind = url.searchParams.get('kind') ?? 'all';
      if (
        ![
          'all',
          'new',
          'planned',
          'in-progress',
          'resolved',
          'closed',
        ].includes(status) ||
        !['all', 'issue', 'feature'].includes(kind)
      )
        return json({ error: 'Invalid report filter' }, 400);
      const where =
        "(?='all' OR r.status=?) AND (?='all' OR r.kind=?) AND r.title LIKE ? ESCAPE '\\'";
      const args = [status, status, kind, kind, query];
      return json({
        total: count(
          `SELECT COUNT(*) n FROM site_reports r WHERE ${where}`,
          ...args,
        ),
        reports: db
          .query(
            `SELECT r.id,r.kind,r.title,r.body,r.contact,u.username,r.page,r.map_id mapId,r.status,r.admin_notes adminNotes,r.created_at createdAt,r.updated_at updatedAt FROM site_reports r LEFT JOIN user u ON u.id=r.user_id WHERE ${where} ORDER BY r.created_at DESC,r.id LIMIT ? OFFSET ?`,
          )
          .all(...args, limit, offset),
      });
    }
    const reportId = path.match(
      /^\/api\/admin\/reports\/([a-f0-9-]{36})$/,
    )?.[1];
    if (reportId && request.method === 'PATCH') {
      const parsed = reportUpdateSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: 'Invalid report update' }, 400);
      const result = db
        .query(
          'UPDATE site_reports SET status=?,admin_notes=?,updated_at=? WHERE id=? RETURNING id',
        )
        .get(parsed.data.status, parsed.data.adminNotes, Date.now(), reportId);
      return result
        ? json({ ok: true })
        : json({ error: 'Report not found' }, 404);
    }
    return json({ error: 'Not found' }, 404);
  };
}
