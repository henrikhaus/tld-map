import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { siteServices } from '../server/site';
import type { ReportNotification } from '../lib/site';

let db: Database;
let handle: ReturnType<typeof siteServices>;
const origin = 'https://tld.example';
beforeEach(() => {
  db = new Database(':memory:');
  db.run('PRAGMA foreign_keys=ON');
  db.run('CREATE TABLE user (id TEXT PRIMARY KEY, username TEXT)');
  db.run(
    "INSERT INTO user VALUES ('admin','henhau'),('author','author'),('other','other')",
  );
  handle = siteServices(db, origin);
  db.run("INSERT INTO site_admin VALUES (1,'admin')");
});
afterEach(() => db.close());

async function request(
  path: string,
  user: string | null,
  method = 'GET',
  body?: unknown,
  cookie = '',
) {
  return (await handle(
    new Request(origin + path, {
      method,
      headers: { cookie, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    async () => (user ? { user: { id: user, name: user } } : null),
    'test-ip',
  ))!;
}
async function submit(user: string | null, cookie = '') {
  const id = crypto.randomUUID();
  const response = await request(
    '/api/site/reports',
    user,
    'POST',
    {
      id,
      kind: 'feature',
      title: 'Add a compass',
      body: 'A compass on the map would be useful.',
      page: 'map',
      mapId: 'mystery-lake',
    },
    cookie,
  );
  expect(response.status).toBe(201);
  return {
    id,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie,
  };
}
const update = (id: string, status: string, user = 'admin') =>
  request(`/api/admin/reports/${id}`, user, 'PATCH', {
    status,
    adminNotes: 'PRIVATE admin details',
  });
async function unread(
  user: string | null,
  cookie = '',
): Promise<ReportNotification[]> {
  return (
    (await (
      await request(
        '/api/site/report-notifications',
        user,
        'GET',
        undefined,
        cookie,
      )
    ).json()) as { notifications: ReportNotification[] }
  ).notifications;
}
const ack = (id: string, user: string | null, cookie = '') =>
  request('/api/site/report-notifications', user, 'POST', { id }, cookie);

test('only the author can read or acknowledge updates; no private fields leak', async () => {
  const report = await submit('author');
  expect(await unread('author')).toEqual([]);
  expect((await update(report.id, 'planned', 'other')).status).toBe(403);
  expect((await update(report.id, 'planned')).status).toBe(200);
  const [notice] = await unread('author');
  expect(notice).toEqual({
    id: expect.any(String),
    kind: 'feature',
    title: 'Add a compass',
    status: 'planned',
  });
  expect(await unread('other')).toEqual([]);
  expect(await unread('admin')).toEqual([]);
  expect(await unread(null)).toEqual([]);
  await ack(notice.id, 'other');
  await ack(notice.id, null);
  expect(await unread('author')).toEqual([notice]);
  await ack(notice.id, 'author');
  expect(await unread('author')).toEqual([]);
});

test('notes-only saves are silent and an old acknowledgement cannot erase a newer status', async () => {
  const report = await submit('author');
  await update(report.id, 'new');
  expect(await unread('author')).toEqual([]);
  await update(report.id, 'planned');
  const [old] = await unread('author');
  await update(report.id, 'planned');
  expect(await unread('author')).toEqual([old]);
  await update(report.id, 'in-progress');
  await update(report.id, 'resolved');
  await ack(old.id, 'author');
  const notices = await unread('author');
  expect(notices).toHaveLength(1);
  expect(notices[0].status).toBe('resolved');
  expect(notices[0].id).not.toBe(old.id);
  await ack(notices[0].id, 'author');
  await update(report.id, 'resolved');
  expect(await unread('author')).toEqual([]);
});

test('guest updates require the private receipt cookie, never an email, visit or report ID', async () => {
  const report = await submit(null);
  expect(report.cookie).toMatch(/^tld_report_owner=[a-f0-9]{64}$/);
  const second = await submit(null, report.cookie);
  expect(second.cookie).toBe(report.cookie);
  await update(report.id, 'planned');
  const [notice] = await unread(null, report.cookie);
  expect(notice.status).toBe('planned');
  expect(await unread(null, `tld_report_owner=${'f'.repeat(64)}`)).toEqual([]);
  expect(await unread(null, `tld_report_owner=${report.id}`)).toEqual([]);
  expect(await unread('other')).toEqual([]);
  await ack(notice.id, null);
  expect(await unread(null, report.cookie)).toHaveLength(1);
  await ack(notice.id, null, report.cookie);
  expect(await unread(null, report.cookie)).toEqual([]);
  const stored = db
    .query('SELECT guest_owner_hash FROM site_reports WHERE id=?')
    .get(report.id) as { guest_owner_hash: string };
  expect(report.cookie).not.toContain(stored.guest_owner_hash);
});

test('deleting a report removes its notification', async () => {
  const report = await submit('author');
  await update(report.id, 'closed');
  db.run('DELETE FROM site_reports WHERE id=?', [report.id]);
  expect(db.query('SELECT * FROM site_report_notifications').all()).toEqual([]);
});

test('migration preserves existing reports and runs only once', () => {
  const legacy = new Database(':memory:');
  try {
    legacy.run('CREATE TABLE user (id TEXT PRIMARY KEY)');
    legacy.run(
      'CREATE TABLE site_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
    );
    legacy.run(
      readFileSync(
        new URL('../server/migrations/001-site-admin.sql', import.meta.url),
        'utf8',
      ),
    );
    legacy.run("INSERT INTO site_migrations VALUES ('001-site-admin',1)");
    legacy.run(
      "INSERT INTO site_reports VALUES ('existing','feature','Keep me','Original body','',NULL,'map',NULL,'planned','Private',1,2)",
    );
    siteServices(legacy, origin);
    siteServices(legacy, origin);
    expect(legacy.query('SELECT * FROM site_reports').get()).toMatchObject({
      id: 'existing',
      body: 'Original body',
      status: 'planned',
      admin_notes: 'Private',
      guest_owner_hash: null,
    });
    expect(
      legacy.query('SELECT * FROM site_report_notifications').all(),
    ).toEqual([]);
  } finally {
    legacy.close();
  }
});
