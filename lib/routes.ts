import { mapName, regionGroups } from './model';
export type AtlasView = 'map' | 'loot' | 'notes' | 'chat' | 'admin' | 'privacy';
export type AtlasRoute = { view: AtlasView; mapId?: string };
export const regionIds = regionGroups.flatMap((group) => group.ids);
const slug = (id: string) => id.replace(/&-/g, '');
export const mapPath = (id: string) =>
  id === 'game-world' ? '/' : `/maps/${slug(id)}`;
export const viewPath = (view: AtlasView) =>
  view === 'map' ? '/' : view === 'loot' ? '/loot-tables' : `/${view}`;
export function routeForPath(path: string): AtlasRoute | null {
  if (path === '/') return { view: 'map', mapId: 'game-world' };
  const mapId = regionIds.find((id) => mapPath(id) === path);
  if (mapId) return { view: 'map', mapId };
  for (const view of ['loot', 'notes', 'chat', 'admin', 'privacy'] as const)
    if (viewPath(view) === path) return { view };
  return null;
}
export function routeTitle(route: AtlasRoute) {
  if (route.view === 'map')
    return route.mapId === 'game-world'
      ? 'The Long Dark Maps (TLD) — Interactive World & Region Maps'
      : `${mapName(route.mapId!)} Map — The Long Dark (TLD)`;
  if (route.view === 'loot')
    return 'The Long Dark Interloper Loot Tables — All 4 Sets';
  const title = {
    notes: 'General notes',
    chat: 'Campfire chat',
    admin: 'Site admin',
    privacy: 'Privacy',
  }[route.view];
  return `${title} — The Long Dark`;
}
export const publicPaths = [
  '/',
  ...regionIds.map(mapPath),
  '/loot-tables',
  '/privacy',
];
