import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiClientIP, proxyClientIP, upstreamRequest } from '../server/proxy';

test('proxy identity trusts only the final forwarded address and only when enabled', () => {
  const headers = new Headers({
    'x-forwarded-for': '198.51.100.99, 203.0.113.8',
  });
  expect(proxyClientIP(headers, '172.20.0.1', true)).toBe('203.0.113.8');
  expect(proxyClientIP(headers, '172.20.0.1', false)).toBe('172.20.0.1');
  headers.set('x-forwarded-for', '203.0.113.8, forged');
  expect(proxyClientIP(headers, '172.20.0.1', true)).toBe('172.20.0.1');
  const request = new Request('http://localhost/api', {
    headers: { 'x-tld-client-ip': '203.0.113.8' },
  });
  expect(apiClientIP(request, '127.0.0.1', true)).toBe('203.0.113.8');
  expect(apiClientIP(request, '127.0.0.1', false)).toBe('127.0.0.1');
  expect(apiClientIP(request, '198.51.100.4', true)).toBe('198.51.100.4');
});

test('gateway forwards API bodies and cookies while replacing spoofable proxy headers', async () => {
  const incoming = new Request('http://container/api/atlas?revision=2', {
    method: 'PUT',
    headers: {
      origin: 'https://wrong-origin.example',
      cookie: 'session=example',
      'x-tld-client-ip': '198.51.100.99',
      'x-forwarded-for': '198.51.100.99',
      'x-real-ip': '198.51.100.99',
      forwarded: 'for=198.51.100.99',
      'content-type': 'application/json',
    },
    body: '{"revision":2}',
  });
  const forwarded = upstreamRequest(
    incoming,
    'http://127.0.0.1:3001',
    'https://tld.henhau.online',
    '203.0.113.8',
  );
  expect(forwarded.url).toBe('http://127.0.0.1:3001/api/atlas?revision=2');
  expect(forwarded.headers.get('origin')).toBe('https://wrong-origin.example');
  expect(forwarded.headers.get('cookie')).toBe('session=example');
  expect(forwarded.headers.get('host')).toBe('tld.henhau.online');
  expect(forwarded.headers.get('x-tld-client-ip')).toBe('203.0.113.8');
  expect(forwarded.headers.has('x-forwarded-for')).toBe(false);
  expect(forwarded.headers.has('x-real-ip')).toBe(false);
  expect(forwarded.headers.has('forwarded')).toBe(false);
  expect(forwarded.redirect).toBe('manual');
  expect((await forwarded.json()) as { revision: number }).toEqual({
    revision: 2,
  });
});

test('backup captures live WAL contents with the secret and refuses to overwrite a backup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tld-backup-test-'));
  const db = new Database(join(directory, 'atlas.sqlite'));
  try {
    db.run('PRAGMA journal_mode=WAL');
    db.run('CREATE TABLE journal (note TEXT)');
    db.run("INSERT INTO journal VALUES ('Keep the new WAL record')");
    writeFileSync(join(directory, 'auth-secret'), 'test-only-matching-secret');
    const destination = join(directory, 'snapshot');
    const env = {
      ...process.env,
      TLD_DATA_DIR: directory,
      BETTER_AUTH_SECRET: '',
    };
    delete (env as Record<string, string | undefined>).BETTER_AUTH_SECRET;
    const result = Bun.spawnSync(
      ['bun', 'scripts/backup-data.ts', destination],
      { env },
    );
    expect(result.exitCode).toBe(0);
    const backup = new Database(join(destination, 'atlas.sqlite'), {
      readonly: true,
    });
    expect(backup.query('SELECT note FROM journal').get()).toEqual({
      note: 'Keep the new WAL record',
    });
    backup.close();
    expect(readFileSync(join(destination, 'auth-secret'), 'utf8')).toBe(
      'test-only-matching-secret',
    );
    expect(
      Bun.spawnSync(['bun', 'scripts/backup-data.ts', destination], { env })
        .exitCode,
    ).not.toBe(0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
