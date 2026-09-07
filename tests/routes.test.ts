import { expect, test } from 'bun:test';
import {
  mapPath,
  publicPaths,
  regionIds,
  routeForPath,
  routeTitle,
} from '../lib/routes';
import { metadataForPath } from '../lib/seo';
import sitemap from '../app/sitemap';
import robots from '../app/robots';
import { maps } from '../lib/model';
import { mapImageDescription } from '../lib/map-guides';

test('every visible region has one stable URL, with a world root and valid private routes', () => {
  expect(new Set(publicPaths).size).toBe(publicPaths.length);
  for (const id of regionIds)
    expect(routeForPath(mapPath(id))).toEqual({ view: 'map', mapId: id });
  expect(routeForPath('/')).toEqual({ view: 'map', mapId: 'game-world' });
  expect(mapPath('winding-river-&-carter-hydro-dam')).toBe(
    '/maps/winding-river-carter-hydro-dam',
  );
  expect(routeForPath('/maps/not-a-region')).toBeNull();
  expect(routeForPath('/loot-tables')).toEqual({ view: 'loot' });
  expect(routeTitle(routeForPath('/maps/mystery-lake')!)).toContain(
    'Mystery Lake Map',
  );
});
test('metadata and sitemap expose public maps and loot but exclude private notes, chat and admin', () => {
  const maps = metadataForPath('/maps/mystery-lake');
  expect(maps.alternates?.canonical).toBe('/maps/mystery-lake');
  expect(maps.description).toContain('Mystery Lake');
  const paths = sitemap().map((entry) => new URL(entry.url).pathname);
  expect(paths).toEqual(publicPaths);
  for (const path of ['/notes', '/chat', '/admin']) {
    expect(metadataForPath(path).robots).toEqual({
      index: false,
      follow: false,
    });
    expect(paths).not.toContain(path);
  }
  expect(robots().sitemap).toContain('/sitemap.xml');
});

test('every public map has discoverable full-resolution variants', () => {
  const entries = sitemap();
  for (const id of ['game-world', ...regionIds]) {
    const entry = entries.find(
      (entry) => new URL(entry.url).pathname === mapPath(id),
    )!;
    const images = entry.images!.map((image) => new URL(image).pathname);
    expect(images).toEqual([
      ...new Set(Object.values(maps[id]).map((asset) => asset.src)),
    ]);
    for (const image of images) {
      expect(Bun.file(`public${image}`).size).toBeGreaterThan(0);
      expect(image).not.toContain('-preview');
    }
  }
  for (const path of ['/loot-tables', '/privacy'])
    expect(
      entries.find((entry) => new URL(entry.url).pathname === path)?.images,
    ).toBeUndefined();
});

test('image descriptions distinguish difficulty variants without inventing a variant for shared maps', () => {
  expect(mapImageDescription(maps['mystery-lake'].interloper)).toContain(
    'Mystery Lake',
  );
  expect(mapImageDescription(maps['mystery-lake'].interloper)).toContain(
    'Interloper variant',
  );
  expect(mapImageDescription(maps['mystery-lake'].pilgrim)).toContain(
    'Pilgrim variant',
  );
  expect(mapImageDescription(maps['game-world'].interloper)).toContain(
    'world map',
  );
  expect(mapImageDescription(maps['game-world'].interloper)).not.toContain(
    'variant',
  );
  expect(mapImageDescription(maps['langston-mine'].interloper)).toContain(
    'Langston Mine',
  );
  expect(mapImageDescription(maps['langston-mine'].interloper)).not.toContain(
    'variant',
  );
});
