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
    'Mystery Lake map',
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
