import type { Metadata } from 'next';
import { routeForPath, routeTitle } from './routes';
import { mapName } from './model';
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
      ? `Explore The Long Dark ${route.mapId === 'game-world' ? 'world' : mapName(route.mapId!)} map. Add private notes, drawings and markers for each survival run.`
      : route.view === 'loot'
        ? 'Compare all four Interloper loot sets in The Long Dark. Track finds by region and item, including Misery runs.'
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
