import type { MetadataRoute } from 'next';
import { publicPaths, routeForPath } from '@/lib/routes';
import { siteUrl } from '@/lib/seo';
import { maps } from '@/lib/model';
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => {
    const route = routeForPath(path);
    const modes = route?.mapId ? maps[route.mapId] : undefined;
    return {
      url: new URL(path, siteUrl).href,
      ...(modes
        ? {
            images: [
              ...new Set(
                Object.values(modes).map(
                  (asset) => new URL(asset.src, siteUrl).href,
                ),
              ),
            ],
          }
        : {}),
    };
  });
}
