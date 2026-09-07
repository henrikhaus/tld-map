import type { Metadata } from 'next';
import { routeForPath, routeTitle } from './routes';
import { mapName } from './model';
import { mapLandmarks } from './map-guides';
// Set SITE_URL to the final origin when deploying; local previews remain local.
export const siteUrl =
  process.env.SITE_URL ?? process.env.APP_ORIGIN ?? 'http://localhost:3000';
export function metadataForPath(path: string): Metadata {
  const route = routeForPath(path);
  if (!route)
    return {
      title: 'Page not found — The Long Dark',
      robots: { index: false, follow: false },
    };
  const title = routeTitle(route);
  const description =
    route.view === 'map'
      ? route.mapId === 'game-world'
        ? 'Interactive The Long Dark maps (TLD) for Great Bear Island and the Far Territory. Explore every region, add private run notes and compare Interloper loot tables.'
        : `Explore the ${mapName(route.mapId!)} map for The Long Dark (TLD). ${mapLandmarks[route.mapId!]?.length ? `Find ${mapLandmarks[route.mapId!].slice(0, 2).join(' and ')}. ` : ''}Plan routes with private notes and markers.`
      : route.view === 'loot'
        ? 'The Long Dark Interloper loot tables for all 4 sets. Compare item spawns by region, track finds and narrow down your loot set. Also supports Misery runs.'
        : route.view === 'privacy'
          ? 'How this unofficial The Long Dark map companion handles accounts, private runs, chat and site activity.'
          : 'Your private survival journal and community chat for The Long Dark.';
  const index = ['map', 'loot', 'privacy'].includes(route.view);
  return {
    title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: { canonical: path },
    robots: { index, follow: index },
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
      siteName: 'The Long Dark Map',
    },
    twitter: { card: 'summary', title, description },
  };
}
