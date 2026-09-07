import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialAtlas } from '../lib/model';
import { Database } from 'bun:sqlite';
import type { AdminOverview, SiteReport } from '../lib/site';
const directory = mkdtempSync(join(tmpdir(), 'tld-api-test-'));
const origin = 'http://localhost:3000';
let processHandle: ReturnType<typeof Bun.spawn>;
let base: string;
let cookieA = '',
  cookieB = '',
  cookieC = '';
const journal = initialAtlas();
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  requestOrigin = origin,
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      origin: requestOrigin,
      'content-type': 'application/json',
      cookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function register(username: string) {
  const response = await request('/api/register', 'POST', {
    username,
    password: 'field-atlas-test-pass',
  });
  expect(response.status).toBe(200);
  const cookies = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect(cookies).toContain('session_token');
  return cookies;
}
beforeAll(async () => {
  writeFileSync(
    join(directory, 'recovery-secrets.json'),
    JSON.stringify(['previous-recovery-key-for-integration-tests']),
    { mode: 0o600 },
  );
  processHandle = Bun.spawn(['bun', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TLD_DATA_DIR: directory,
      API_PORT: '0',
      APP_ORIGIN: origin,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stream = processHandle.stdout as ReadableStream<Uint8Array>,
    reader = stream.getReader();
  let text = '';
  const timeout = setTimeout(() => processHandle.kill(), 15000);
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) throw new Error('API stopped before startup');
      text += new TextDecoder().decode(result.value);
      const match = text.match(
        /Atlas API ready at (http:\/\/127\.0\.0\.1:\d+)/,
      );
      if (match) {
        base = match[1];
        break;
      }
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  cookieA = await register('atlas_tester_a');
  cookieB = await register('atlas_tester_b');
  cookieC = await register('atlas_reporter');
  const db = new Database(join(directory, 'atlas.sqlite'));
  const owner = db
    .query('SELECT id FROM user WHERE username=?')
    .get('atlas_tester_a') as { id: string };
  db.run('INSERT INTO site_admin VALUES (1,?)', [owner.id]);
  db.close();
}, 20000);
afterAll(() => {
  processHandle?.kill();
  rmSync(directory, { recursive: true, force: true });
});
describe('Private SQLite journals', () => {
  test('requires authentication to read and write', async () => {
    expect((await request('/api/atlas')).status).toBe(401);
    expect(
      (await request('/api/atlas', 'PUT', { state: journal, revision: 0 }))
        .status,
    ).toBe(401);
  });
  test('saves and restores region notes, annotations and set selection', async () => {
    journal.runs[0].mapViews['mystery-lake:interloper'] = {
      centerX: 1500,
      centerY: 1700,
      scale: 0.6,
    };
    journal.runs[0].lootSet = 2;
    journal.runs[0].lootSets = [2, 4];
    journal.runs[0].dismissedLoot = ['loot-1'];
    journal.runs[0].collapsedLootRegions = ['Bleak Inlet'];
    journal.runs[0].generalNotes = 'Keep a spare bedroll in every region.';
    journal.runs[0].regionNotes['mystery-lake'] =
      'Leave firewood at Camp Office';
    journal.runs[0].regionNotes['ash-canyon'] = 'Bring a rope';
    journal.runs[0].annotations['mystery-lake:interloper'] = [
      {
        id: 'private-note',
        type: 'note',
        color: '#d26750',
        x: 1500,
        y: 2000,
        title: 'Hidden supplies',
        text: 'Two cans here',
        createdAt: new Date().toISOString(),
      },
    ];
    journal.runs[0].annotations['mystery-lake:interloper'].push(
      {
        id: 'comment',
        type: 'comment',
        color: '#abcdef',
        x: 100,
        y: 100,
        text: 'Spare matches here',
        createdAt: '2026-09-06',
      },
      {
        id: 'wide-stroke',
        type: 'draw',
        color: '#123456',
        x: 100,
        y: 100,
        width: 6000,
        opacity: 0.35,
        points: [
          { x: 100, y: 100 },
          { x: 150, y: 150 },
        ],
        createdAt: '2026-09-06',
      },
      {
        id: 'styled-text',
        type: 'text',
        color: '#ffffff',
        x: 100,
        y: 100,
        text: 'Home',
        shadow: true,
        createdAt: '2026-09-06',
      },
      {
        id: 'circle-icon',
        type: 'marker',
        color: '#ffffff',
        x: 100,
        y: 100,
        icon: 'shelter',
        circle: true,
        createdAt: '2026-09-06',
      },
    );
    const saved = await request(
      '/api/atlas',
      'PUT',
      { state: journal, revision: 0 },
      cookieA,
    );
    expect(saved.status).toBe(200);
    const restored = (await (
      await request('/api/atlas', 'GET', undefined, cookieA)
    ).json()) as { state: unknown; revision: number };
    expect(restored.state).toEqual(journal);
    expect(restored.revision).toBe(1);
  });
  test('a second user cannot read the first user’s runs', async () => {
    const response = await request('/api/atlas', 'GET', undefined, cookieB);
    const result = (await response.json()) as {
      state: unknown;
      revision: number;
    };
    expect(result.state).toBeNull();
    expect(result.revision).toBe(0);
  });
  test('stale saves are rejected without overwriting data', async () => {
    const response = await request(
      '/api/atlas',
      'PUT',
      { state: initialAtlas(), revision: 0 },
      cookieA,
    );
    expect(response.status).toBe(409);
    const restored = (await (
      await request('/api/atlas', 'GET', undefined, cookieA)
    ).json()) as { state: unknown };
    expect(restored.state).toEqual(journal);
  });
  test('validates data and blocks cross-origin writes', async () => {
    expect(
      (
        await request(
          '/api/atlas',
          'PUT',
          { state: { runs: [] }, revision: 1 },
          cookieA,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/atlas',
          'PUT',
          { state: journal, revision: 1 },
          cookieA,
          'https://untrusted.example',
        )
      ).status,
    ).toBe(403);
  });
  test('username/password authentication works and wrong passwords fail', async () => {
    const valid = await request('/api/auth/sign-in/username', 'POST', {
      username: 'atlas_tester_a',
      password: 'field-atlas-test-pass',
    });
    expect(valid.status).toBe(200);
    expect(
      valid.headers
        .getSetCookie()
        .some((cookie) => cookie.includes('Max-Age=34560000')),
    ).toBe(true);
    const invalid = await request('/api/auth/sign-in/username', 'POST', {
      username: 'atlas_tester_a',
      password: 'wrong-password',
    });
    expect(invalid.status).toBe(401);
  });
  test('400-day sessions upgrade existing seven-day sessions and refresh their browser cookie', async () => {
    const original = await request(
      '/api/auth/get-session',
      'GET',
      undefined,
      cookieA,
    );
    const data = (await original.json()) as { session: { id: string } };
    const db = new Database(join(directory, 'atlas.sqlite'));
    try {
      const row = db
        .query('SELECT expiresAt FROM session WHERE id=?')
        .get(data.session.id) as { expiresAt: string | number };
      const expiry = Date.now() + 7 * 86400_000;
      db.run('UPDATE session SET expiresAt=? WHERE id=?', [
        typeof row.expiresAt === 'number'
          ? expiry
          : new Date(expiry).toISOString(),
        data.session.id,
      ]);
    } finally {
      db.close();
    }
    const refreshed = await request(
      '/api/auth/get-session',
      'GET',
      undefined,
      cookieA,
    );
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as { session: { expiresAt: string } };
    expect(
      new Date(next.session.expiresAt).getTime() - Date.now(),
    ).toBeGreaterThan(399 * 86400_000);
    expect(
      refreshed.headers
        .getSetCookie()
        .some((cookie) => cookie.includes('Max-Age=34560000')),
    ).toBe(true);
  });
  test('signing out invalidates the session', async () => {
    expect(
      (await request('/api/auth/sign-out', 'POST', {}, cookieB)).status,
    ).toBe(200);
    expect(
      (await request('/api/atlas', 'GET', undefined, cookieB)).status,
    ).toBe(401);
  });
});

describe('Owner-only admin and public feedback', () => {
  const report = {
    id: crypto.randomUUID(),
    kind: 'issue',
    title: 'Map text test',
    body: 'Text should stay where I placed it.',
    page: 'map',
    mapId: 'mystery-lake',
    contact: 'reporter@example.com',
  };
  test('admin checks identity on every endpoint and cannot be self-assigned', async () => {
    for (const path of [
      '/api/admin/overview',
      '/api/admin/users',
      '/api/admin/reports',
    ]) {
      expect((await request(path)).status).toBe(401);
      expect((await request(path, 'GET', undefined, cookieC)).status).toBe(403);
    }
    expect(
      (await (
        await request('/api/site/me', 'GET', undefined, cookieC)
      ).json()) as { admin: boolean },
    ).toEqual({ admin: false });
    expect(
      (await (
        await request('/api/site/me', 'GET', undefined, cookieA)
      ).json()) as { admin: boolean },
    ).toEqual({ admin: true });
    expect(
      (
        await request(
          '/api/site/me',
          'POST',
          { admin: true, role: 'admin' },
          cookieC,
        )
      ).status,
    ).toBe(404);
  });
  test('guests submit reports, duplicate retries are safe, and only the admin can read them', async () => {
    expect(
      (
        await request('/api/site/reports', 'POST', {
          ...report,
          status: 'resolved',
          adminNotes: 'Injected',
        })
      ).status,
    ).toBe(201);
    expect((await request('/api/site/reports', 'POST', report)).status).toBe(
      200,
    );
    expect((await request('/api/site/reports')).status).toBe(404);
    const data = (await (
      await request('/api/admin/reports', 'GET', undefined, cookieA)
    ).json()) as { total: number; reports: SiteReport[] };
    expect(data.total).toBe(1);
    expect(data.reports[0]).toMatchObject({
      id: report.id,
      status: 'new',
      adminNotes: '',
      body: report.body,
      username: null,
    });
  });
  test('feedback validates inputs and rejects cross-origin writes', async () => {
    expect(
      (
        await request('/api/site/reports', 'POST', {
          ...report,
          id: crypto.randomUUID(),
          body: '',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/site/reports', 'POST', {
          ...report,
          id: crypto.randomUUID(),
          mapId: 'not-a-map',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/site/reports',
          'POST',
          report,
          '',
          'https://untrusted.example',
        )
      ).status,
    ).toBe(403);
  });
  test('report status and private notes persist, with server-side permissions', async () => {
    const path = `/api/admin/reports/${report.id}`,
      update = { status: 'planned', adminNotes: 'Reproduce and investigate.' };
    expect((await request(path, 'PATCH', update, cookieC)).status).toBe(403);
    expect(
      (
        await request(
          path,
          'PATCH',
          update,
          cookieA,
          'https://untrusted.example',
        )
      ).status,
    ).toBe(403);
    expect((await request(path, 'PATCH', update, cookieA)).status).toBe(200);
    const data = (await (
      await request(
        '/api/admin/reports?status=planned&kind=issue',
        'GET',
        undefined,
        cookieA,
      )
    ).json()) as { total: number; reports: SiteReport[] };
    expect(data.total).toBe(1);
    expect(data.reports[0]).toMatchObject(update);
  });
  test('real traffic events are deduplicated and visits stay together; stats contain no private journal text', async () => {
    const event = {
      id: crypto.randomUUID(),
      page: 'map',
      mapId: 'mystery-lake',
      device: 'desktop',
      referrer: 'example.com',
    };
    const response = await request('/api/site/traffic', 'POST', event, cookieA);
    expect(response.status).toBe(200);
    const visit = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    expect(visit).toContain('tld_visit=');
    expect(
      (await request('/api/site/traffic', 'POST', event, visit)).status,
    ).toBe(200);
    expect(
      (
        await request(
          '/api/site/traffic',
          'POST',
          { ...event, id: crypto.randomUUID(), page: 'loot', mapId: null },
          visit,
        )
      ).status,
    ).toBe(200);
    const stats = (await (
      await request('/api/admin/overview?days=7', 'GET', undefined, cookieA)
    ).json()) as AdminOverview;
    expect(stats.totals).toMatchObject({
      users: 3,
      runs: 1,
      pageViews: 2,
      visits: 1,
      activeUsers: 1,
      openReports: 1,
    });
    expect(stats.referrers).toEqual([{ referrer: 'example.com', visits: 1 }]);
    expect(stats.pages).toHaveLength(2);
    expect(JSON.stringify(stats)).not.toContain('Two cans here');
    const users = (await (
      await request(
        '/api/admin/users?search=reporter',
        'GET',
        undefined,
        cookieA,
      )
    ).json()) as { total: number; users: { username: string }[] };
    expect(users.total).toBe(1);
    expect(users.users[0].username).toBe('atlas_reporter');
    expect(JSON.stringify(users)).not.toContain('password');
    expect(
      (await request('/api/admin/overview?days=-1', 'GET', undefined, cookieA))
        .status,
    ).toBe(400);
  });
});

describe('Public chat identities, reactions and moderation', () => {
  let adminChat = '',
    memberChat = '',
    guestChat = '',
    guestOther = '';
  let adminPerson = '',
    memberPerson = '',
    guestPerson = '';
  let messageId = 0;
  async function init(cookie = '') {
    const response = await request('/api/chat/session', 'POST', {}, cookie);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      me: {
        id: string;
        name: string;
        admin: boolean;
        anonymous: boolean;
        color: string;
      };
    };
    return {
      me: data.me,
      cookie: [
        cookie,
        ...response.headers.getSetCookie().map((c) => c.split(';')[0]),
      ]
        .filter(Boolean)
        .join('; '),
    };
  }
  function resetCooldown() {
    const db = new Database(join(directory, 'atlas.sqlite'));
    db.run('UPDATE chat_people SET last_sent=0');
    db.close();
  }
  test('guest identity is stable and unforgeable; the owner alone gets the admin badge', async () => {
    const a = await init(cookieA),
      m = await init(cookieC),
      g = await init(),
      other = await init();
    adminChat = a.cookie;
    memberChat = m.cookie;
    guestChat = g.cookie;
    guestOther = other.cookie;
    adminPerson = a.me.id;
    memberPerson = m.me.id;
    guestPerson = g.me.id;
    expect(a.me.admin).toBe(true);
    expect(m.me.admin).toBe(false);
    expect(g.me.name).toMatch(/^Anonymous\d+$/);
    expect(g.me.anonymous).toBe(true);
    expect((await init(guestChat)).me.id).toBe(g.me.id);
    expect(other.me.id).not.toBe(g.me.id);
    expect(
      (
        await request(
          '/api/chat/messages',
          'GET',
          undefined,
          `tld_chat=${g.me.id}`,
        )
      ).status,
    ).toBe(401);
    expect(
      (await request('/api/chat/moderation', 'GET', undefined, guestChat))
        .status,
    ).toBe(403);
  });
  test('messages reject author spoofing, allow swearing and enforce the 1000ms floor atomically', async () => {
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          {
            nonce: crypto.randomUUID(),
            text: 'Hello',
            admin: true,
            personId: adminPerson,
          },
          guestChat,
        )
      ).status,
    ).toBe(400);
    const nonce = crypto.randomUUID();
    const first = await request(
      '/api/chat/messages',
      'POST',
      { nonce, text: 'That fucking wolf stole my dinner.' },
      guestChat,
    );
    expect(first.status).toBe(201);
    const message = (
      (await first.json()) as {
        message: { id: number; author: { id: string; admin: boolean } };
      }
    ).message;
    messageId = message.id;
    expect(message.author.id).toBe(guestPerson);
    expect(message.author.admin).toBe(false);
    const duplicate = await request(
      '/api/chat/messages',
      'POST',
      { nonce, text: 'That fucking wolf stole my dinner.' },
      guestChat,
    );
    expect(duplicate.status).toBe(200);
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          { nonce: crypto.randomUUID(), text: 'Too soon' },
          guestChat,
        )
      ).status,
    ).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          {
            nonce: crypto.randomUUID(),
            text: 'Half a second is still too soon.',
          },
          guestChat,
        )
      ).status,
    ).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          { nonce: crypto.randomUUID(), text: 'One second has passed.' },
          guestChat,
        )
      ).status,
    ).toBe(201);
    resetCooldown();
    const responses = await Promise.all(
      ['One new message', 'A concurrent new message'].map((text) =>
        request(
          '/api/chat/messages',
          'POST',
          { nonce: crypto.randomUUID(), text },
          guestOther,
        ),
      ),
    );
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 429,
    ]);
  });
  test('duplicates and severe slurs are blocked while username colors remain server controlled', async () => {
    resetCooldown();
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          {
            nonce: crypto.randomUUID(),
            text: 'That fucking wolf stole my dinner!!!',
          },
          guestChat,
        )
      ).status,
    ).toBe(429);
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          { nonce: crypto.randomUUID(), text: 'n.i.g.g.e.r' },
          guestChat,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/chat/profile',
          'PUT',
          { color: '#ffbf38' },
          guestChat,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/chat/profile',
          'PUT',
          { color: '#ffffff' },
          guestChat,
        )
      ).status,
    ).toBe(400);
    const color = await request(
      '/api/chat/profile',
      'PUT',
      { color: '#83a9cc' },
      guestChat,
    );
    expect(color.status).toBe(200);
    const data = (await color.json()) as {
      me: { color: string; admin: boolean };
    };
    expect(data.me.color).toBe('#83a9cc');
    expect(data.me.admin).toBe(false);
    expect(
      (
        await request(
          '/api/chat/profile',
          'PUT',
          { color: '#ffffff', admin: true },
          guestChat,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          { nonce: crypto.randomUUID(), text: 'Valid message' },
          guestChat,
          'https://evil.example',
        )
      ).status,
    ).toBe(403);
  });
  test('reaction updates are idempotent, bounded, and counted separately for each person', async () => {
    const path = `/api/chat/messages/${messageId}/reactions`;
    for (let i = 0; i < 2; i++)
      expect(
        (await request(path, 'PUT', { emoji: '👍', active: true }, guestChat))
          .status,
      ).toBe(200);
    const second = await request(
      path,
      'PUT',
      { emoji: '👍', active: true },
      guestOther,
    );
    expect(
      (
        (await second.json()) as {
          message: {
            reactions: { emoji: string; count: number; mine: boolean }[];
          };
        }
      ).message.reactions,
    ).toEqual([{ emoji: '👍', count: 2, mine: true }]);
    const removed = await request(
      path,
      'PUT',
      { emoji: '👍', active: false },
      guestChat,
    );
    expect(
      (
        (await removed.json()) as {
          message: {
            reactions: { emoji: string; count: number; mine: boolean }[];
          };
        }
      ).message.reactions,
    ).toEqual([{ emoji: '👍', count: 1, mine: false }]);
    expect(
      (
        await request(
          path,
          'PUT',
          { emoji: 'not-an-emoji', active: true },
          guestChat,
        )
      ).status,
    ).toBe(400);
  });
  test('only the admin can time out, ban or remove; restrictions also stop reactions', async () => {
    const moderation = {
      personId: guestPerson,
      action: 'timeout',
      minutes: 5,
      reason: 'Repeated spam',
    };
    expect(
      (await request('/api/chat/moderation', 'POST', moderation, memberChat))
        .status,
    ).toBe(403);
    expect(
      (await request('/api/chat/moderation', 'POST', moderation, adminChat))
        .status,
    ).toBe(200);
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          { nonce: crypto.randomUUID(), text: 'Blocked by timeout' },
          guestChat,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/chat/messages/${messageId}/reactions`,
          'PUT',
          { emoji: '🔥', active: true },
          guestChat,
        )
      ).status,
    ).toBe(403);
    const db = new Database(join(directory, 'atlas.sqlite'));
    db.run('UPDATE chat_restrictions SET until_at=? WHERE person_id=?', [
      Date.now() - 1,
      guestPerson,
    ]);
    db.close();
    expect(
      (
        (await (
          await request('/api/chat/messages', 'GET', undefined, guestChat)
        ).json()) as { me: { restriction: unknown } }
      ).me.restriction,
    ).toBeNull();
    expect(
      (
        await request(
          '/api/chat/moderation',
          'POST',
          { ...moderation, personId: memberPerson, action: 'ban' },
          adminChat,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          { nonce: crypto.randomUUID(), text: 'Blocked by permanent ban' },
          memberChat,
        )
      ).status,
    ).toBe(403);
    expect(
      (await request('/api/atlas', 'GET', undefined, cookieC)).status,
    ).toBe(200);
    const signedOutDevice = memberChat
      .split('; ')
      .filter((c) => c.startsWith('tld_chat='))
      .join('; ');
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          {
            nonce: crypto.randomUUID(),
            text: 'Sign out should not evade the ban',
          },
          signedOutDevice,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          '/api/chat/moderation',
          'POST',
          { ...moderation, personId: adminPerson, action: 'ban' },
          adminChat,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/chat/moderation',
          'POST',
          { ...moderation, personId: memberPerson, action: 'lift' },
          adminChat,
        )
      ).status,
    ).toBe(200);
    resetCooldown();
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          {
            nonce: crypto.randomUUID(),
            text: 'I can chat after the restriction was lifted.',
          },
          memberChat,
        )
      ).status,
    ).toBe(201);
  });
  test('reports reach moderation, deleted bodies disappear, and moderation is audited', async () => {
    const path = `/api/chat/messages/${messageId}`;
    expect(
      (await request(`${path}/report`, 'POST', { reason: 'spam' }, guestOther))
        .status,
    ).toBe(200);
    const mod = (await (
      await request('/api/chat/moderation', 'GET', undefined, adminChat)
    ).json()) as { flags: { messageId: number }[]; log: unknown[] };
    expect(mod.flags[0].messageId).toBe(messageId);
    expect(mod.log.length).toBeGreaterThan(0);
    expect((await request(path, 'DELETE', undefined, guestOther)).status).toBe(
      403,
    );
    expect((await request(path, 'DELETE', undefined, adminChat)).status).toBe(
      200,
    );
    const feed = (await (
      await request('/api/chat/messages', 'GET', undefined, guestOther)
    ).json()) as {
      messages: {
        id: number;
        text: string;
        deleted: boolean;
        reactions: unknown[];
      }[];
    };
    expect(feed.messages.find((m) => m.id === messageId)).toMatchObject({
      text: '',
      deleted: true,
      reactions: [],
    });
  });
  test('expired chat content vanishes from feeds and cannot receive reactions', async () => {
    const expiredGuest = await init();
    const response = await request(
      '/api/chat/messages',
      'POST',
      { nonce: crypto.randomUUID(), text: 'A message that will expire' },
      expiredGuest.cookie,
    );
    expect(response.status).toBe(201);
    const { message } = (await response.json()) as { message: { id: number } };
    const before = (await (
      await request('/api/chat/messages', 'GET', undefined, expiredGuest.cookie)
    ).json()) as { revision: number };
    const db = new Database(join(directory, 'atlas.sqlite'));
    try {
      db.run('UPDATE chat_messages SET created_at=? WHERE id=?', [
        Date.now() - 48 * 60 * 60 * 1000,
        message.id,
      ]);
      const feed = (await (
        await request(
          `/api/chat/messages?since=${before.revision}&oldest=${message.id}`,
          'GET',
          undefined,
          expiredGuest.cookie,
        )
      ).json()) as { revision: number; messages: { id: number }[] };
      expect(feed.revision).toBeGreaterThan(before.revision);
      expect(feed.messages).toEqual([]);
      expect(
        db.query('SELECT id FROM chat_messages WHERE id=?').get(message.id),
      ).toBeNull();
      expect(
        (
          await request(
            `/api/chat/messages/${message.id}/reactions`,
            'PUT',
            { emoji: '👍', active: true },
            expiredGuest.cookie,
          )
        ).status,
      ).toBe(404);
    } finally {
      db.close();
    }
  });
  test('longer burst limits remain enforced even when every message satisfies the short cooldown', async () => {
    const spam = await init();
    for (let i = 0; i < 20; i++) {
      resetCooldown();
      expect(
        (
          await request(
            '/api/chat/messages',
            'POST',
            {
              nonce: crypto.randomUUID(),
              text: `Preparing supply stop number ${i}`,
            },
            spam.cookie,
          )
        ).status,
      ).toBe(201);
    }
    resetCooldown();
    expect(
      (
        await request(
          '/api/chat/messages',
          'POST',
          {
            nonce: crypto.randomUUID(),
            text: 'Message beyond the minute limit',
          },
          spam.cookie,
        )
      ).status,
    ).toBe(429);
  });
});

describe('Account recovery and deletion', () => {
  // Each scenario exercises several sign-ins; respect the real auth burst window.
  beforeEach(
    () => new Promise<void>((resolve) => setTimeout(resolve, 11_000)),
    15_000,
  );
  const password = 'secure-account-test-password';
  const cookies = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  async function create(username: string) {
    const response = await request('/api/register', 'POST', {
      username,
      password,
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      user: { id: string };
      recoveryCode: string;
    };
    return { ...data, cookie: cookies(response) };
  }
  test('restored recovery codes accept an older key once, then rotate to the current key', async () => {
    const account = await create('restored_survivor');
    const db = new Database(join(directory, 'atlas.sqlite'));
    const previousHash = createHmac(
      'sha256',
      'previous-recovery-key-for-integration-tests',
    )
      .update(account.recoveryCode.replaceAll('-', ''))
      .digest('hex');
    db.run('UPDATE account_recovery SET code_hash=? WHERE user_id=?', [
      previousHash,
      account.user.id,
    ]);
    db.close();
    const recovered = await request('/api/account/recover', 'POST', {
      username: 'restored_survivor',
      code: account.recoveryCode,
      newPassword: 'restored-account-password',
    });
    expect(recovered.status).toBe(200);
    const replacement = (await recovered.json()) as { recoveryCode: string };
    expect(replacement.recoveryCode).not.toBe(account.recoveryCode);
    expect(
      (
        await request('/api/account/recover', 'POST', {
          username: 'restored_survivor',
          code: account.recoveryCode,
          newPassword: 'should-not-be-accepted',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/auth/sign-in/username', 'POST', {
          username: 'restored_survivor',
          password: 'restored-account-password',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request('/api/account/recover', 'POST', {
          username: 'restored_survivor',
          code: replacement.recoveryCode,
          newPassword: 'rotated-account-password',
        })
      ).status,
    ).toBe(200);
  });

  test('registration issues a private code; recovery rotates it and revokes every existing session', async () => {
    const account = await create('recovery_survivor');
    expect(account.recoveryCode).toMatch(/^(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/);
    const recoveryStatus = (await (
      await request('/api/account/recovery', 'GET', undefined, account.cookie)
    ).json()) as { hasRecoveryCode: boolean };
    expect(recoveryStatus).toEqual({ hasRecoveryCode: true });
    const db = new Database(join(directory, 'atlas.sqlite'));
    try {
      const stored = db
        .query('SELECT code_hash FROM account_recovery WHERE user_id=?')
        .get(account.user.id) as { code_hash: string };
      expect(stored.code_hash).not.toContain(account.recoveryCode);
      expect(
        (
          await request('/api/account/recover', 'POST', {
            username: 'recovery_survivor',
            code: 'bad-code',
            newPassword: 'replacement-password',
          })
        ).status,
      ).toBe(400);
      const second = await request('/api/auth/sign-in/username', 'POST', {
        username: 'recovery_survivor',
        password,
      });
      const reset = await request('/api/account/recover', 'POST', {
        username: 'RECOVERY_SURVIVOR',
        code: account.recoveryCode.toLowerCase(),
        newPassword: 'replacement-password',
      });
      expect(reset.status).toBe(200);
      const replacement = (await reset.json()) as { recoveryCode: string };
      expect(replacement.recoveryCode).not.toBe(account.recoveryCode);
      expect(
        (await request('/api/atlas', 'GET', undefined, account.cookie)).status,
      ).toBe(401);
      expect(
        (await request('/api/atlas', 'GET', undefined, cookies(second))).status,
      ).toBe(401);
      expect(
        (
          await request('/api/account/recover', 'POST', {
            username: 'recovery_survivor',
            code: account.recoveryCode,
            newPassword: 'another-password',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request('/api/auth/sign-in/username', 'POST', {
            username: 'recovery_survivor',
            password,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await request('/api/auth/sign-in/username', 'POST', {
            username: 'recovery_survivor',
            password: 'replacement-password',
          })
        ).status,
      ).toBe(200);
      const results = await Promise.all(
        ['first-racing-password', 'second-racing-password'].map((newPassword) =>
          request('/api/account/recover', 'POST', {
            username: 'recovery_survivor',
            code: replacement.recoveryCode,
            newPassword,
          }),
        ),
      );
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 400]);
    } finally {
      db.close();
    }
  });
  test('replacement codes require the current password and recovery is bounded and same-origin', async () => {
    const account = await create('recovery_guarded');
    expect(
      (await request('/api/account/recovery', 'POST', { password })).status,
    ).toBe(401);
    expect(
      (
        await request(
          '/api/account/recovery',
          'POST',
          { password: 'incorrect-password' },
          account.cookie,
        )
      ).status,
    ).toBe(400);
    const replaced = await request(
      '/api/account/recovery',
      'POST',
      { password },
      account.cookie,
    );
    expect(replaced.status).toBe(200);
    const code = ((await replaced.json()) as { recoveryCode: string })
      .recoveryCode;
    expect(
      (
        await request(
          '/api/account/recover',
          'POST',
          {
            username: 'recovery_guarded',
            code,
            newPassword: 'replacement-password',
          },
          '',
          'https://wrong.example',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request('/api/account/recover', 'POST', {
          username: 'recovery_guarded',
          code,
          newPassword: 'tiny',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/account/recover', 'POST', {
          username: 'recovery_guarded',
          code: account.recoveryCode,
          newPassword: 'replacement-password',
        })
      ).status,
    ).toBe(400);
    for (let attempt = 0; attempt < 4; attempt++)
      expect(
        (
          await request('/api/account/recover', 'POST', {
            username: 'recovery_guarded',
            code: 'invalid',
            newPassword: 'replacement-password',
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request('/api/account/recover', 'POST', {
          username: 'recovery_guarded',
          code: 'invalid',
          newPassword: 'replacement-password',
        })
      ).status,
    ).toBe(429);
  });
  test('account deletion requires reauthentication and removes only the owner’s data, preserving bans', async () => {
    const account = await create('delete_survivor');
    expect(
      (
        await request(
          '/api/atlas',
          'PUT',
          { state: initialAtlas(), revision: 0 },
          account.cookie,
        )
      ).status,
    ).toBe(200);
    const guest = await request(
      '/api/chat/session',
      'POST',
      {},
      account.cookie,
    );
    const chatCookie = `${account.cookie}; ${cookies(guest)}`;
    const person = ((await guest.json()) as { me: { id: string } }).me.id;
    const messageResponse = await request(
      '/api/chat/messages',
      'POST',
      {
        nonce: crypto.randomUUID(),
        text: 'This message belongs to the deleted account',
      },
      chatCookie,
    );
    expect(messageResponse.status).toBe(201);
    const message = (
      (await messageResponse.json()) as { message: { id: number } }
    ).message.id;
    const db = new Database(join(directory, 'atlas.sqlite'));
    try {
      db.run(
        "INSERT INTO chat_restrictions(person_id,kind,reason) VALUES (?,'ban','Spam')",
        [person],
      );
      db.run(
        "INSERT INTO chat_flags(message_id,person_id,reason) VALUES (?,?,'spam')",
        [message, person],
      );
      db.run("INSERT INTO chat_reactions VALUES (?,?,'👍')", [message, person]);
      db.run(
        "INSERT INTO site_reports VALUES (?,'issue','Private report','Private report body','private@example.com',?,'map',NULL,'new','',?,?)",
        [crypto.randomUUID(), account.user.id, Date.now(), Date.now()],
      );
      expect(
        (
          await request('/api/account', 'DELETE', {
            password,
            confirmation: 'delete_survivor',
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await request(
            '/api/account',
            'DELETE',
            { password: 'wrong-password', confirmation: 'delete_survivor' },
            account.cookie,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(
            '/api/account',
            'DELETE',
            { password, confirmation: 'someone_else' },
            account.cookie,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(
            '/api/account',
            'DELETE',
            {
              password,
              confirmation: 'delete_survivor',
              userId: 'someone_else',
            },
            account.cookie,
          )
        ).status,
      ).toBe(400);
      const deleted = await request(
        '/api/account',
        'DELETE',
        { password, confirmation: 'delete_survivor' },
        account.cookie,
      );
      expect(deleted.status).toBe(200);
      for (const [table, column] of [
        ['user', 'id'],
        ['account', 'userId'],
        ['session', 'userId'],
        ['atlas', 'user_id'],
        ['account_recovery', 'user_id'],
        ['site_reports', 'user_id'],
      ])
        expect(
          db
            .query(`SELECT 1 FROM ${table} WHERE ${column}=?`)
            .get(account.user.id),
        ).toBeNull();
      expect(
        db.query('SELECT id FROM chat_messages WHERE id=?').get(message),
      ).toBeNull();
      expect(
        db
          .query('SELECT message_id FROM chat_flags WHERE message_id=?')
          .get(message),
      ).toBeNull();
      expect(
        db
          .query('SELECT message_id FROM chat_reactions WHERE message_id=?')
          .get(message),
      ).toBeNull();
      expect(
        db.query('SELECT user_id FROM chat_people WHERE id=?').get(person),
      ).toEqual({ user_id: null });
      expect(
        db
          .query('SELECT kind FROM chat_restrictions WHERE person_id=?')
          .get(person),
      ).toEqual({ kind: 'ban' });
      expect(
        (await request('/api/atlas', 'GET', undefined, account.cookie)).status,
      ).toBe(401);
      expect(
        (await request('/api/atlas', 'GET', undefined, cookieC)).status,
      ).toBe(200);
      expect(
        (
          await request('/api/account/recover', 'POST', {
            username: 'delete_survivor',
            code: account.recoveryCode,
            newPassword: 'replacement-password',
          })
        ).status,
      ).toBe(400);
    } finally {
      db.close();
    }
  });
});
