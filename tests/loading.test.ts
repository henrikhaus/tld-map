import { expect, test } from 'bun:test';
import { appOrigin } from '../server/origin';
import { responseJson } from '../lib/api-response';
import { maps } from '../lib/model';
import sharp from 'sharp/lib/index.js';

test('runtime origin uses the deployed domain and normalizes trailing slashes', () => {
  expect(
    appOrigin({
      SITE_URL: 'https://tld.henhau.online/',
      NODE_ENV: 'production',
    }),
  ).toBe('https://tld.henhau.online');
  expect(
    appOrigin({
      APP_ORIGIN: 'https://atlas.example',
      SITE_URL: 'https://old.example',
    }),
  ).toBe('https://atlas.example');
  expect(appOrigin({})).toBe('http://localhost:3000');
  expect(() => appOrigin({ NODE_ENV: 'production' })).toThrow('Set APP_ORIGIN');
  for (const value of [
    'https://example.com/path',
    'https://user:password@example.com',
    'https://example.com?x=1',
  ])
    expect(() => appOrigin({ SITE_URL: value })).toThrow(
      'plain http(s) origin',
    );
});

test('empty and non-JSON upstream responses produce a useful error', async () => {
  for (const body of ['', '<html>Bad gateway</html>']) {
    // Bun's assertion is asynchronous despite its non-thenable type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(
      responseJson(
        new Response(body, { status: 502 }),
        'Chat is temporarily unavailable.',
      ),
    ).rejects.toThrow('Chat is temporarily unavailable. (HTTP 502)');
  }
  expect(
    await responseJson<{ error: string }>(
      Response.json({ error: 'Origin not allowed' }, { status: 403 }),
      'Unavailable',
    ),
  ).toEqual({ error: 'Origin not allowed' });
  expect(await responseJson(Response.json(null), 'Unavailable')).toBeNull();
});

test('optimized maps preserve annotation coordinates and have small first-load previews', async () => {
  const checked = new Set<string>();
  for (const modes of Object.values(maps))
    for (const asset of Object.values(modes)) {
      if (checked.has(asset.src)) continue;
      checked.add(asset.src);
      expect(asset.src).toMatch(/^\/maps\/optimized\/[a-f0-9]{20}\.webp$/);
      const full = await sharp(`public${asset.src}`).metadata();
      expect([full.width, full.height]).toEqual([asset.width, asset.height]);
      const preview = await sharp(`public${asset.previewSrc}`).metadata();
      expect(Math.max(preview.width!, preview.height!)).toBeLessThanOrEqual(
        1200,
      );
      expect(Bun.file(`public${asset.previewSrc}`).size).toBeLessThan(400_000);
    }
  const world = maps['game-world'].interloper;
  expect(Bun.file(`public${world.src}`).size).toBeLessThan(
    Bun.file(`public${world.originalSrc}`).size / 4,
  );
});
