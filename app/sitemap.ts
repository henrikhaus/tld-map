import type { MetadataRoute } from 'next';
import { publicPaths } from '@/lib/routes';
import { siteUrl } from '@/lib/seo';
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({ url: new URL(path, siteUrl).href }));
}
