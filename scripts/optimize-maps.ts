import sharp from 'sharp/lib/index.js';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { MapAsset } from '../lib/model';

const manifestPath = 'data/maps.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
  string,
  Record<string, MapAsset>
>;
await mkdir('public/maps/optimized', { recursive: true });
const completed = new Map<string, { src: string; previewSrc: string }>();
let originalBytes = 0,
  fullBytes = 0,
  previewBytes = 0;
for (const modes of Object.values(manifest)) {
  for (const asset of Object.values(modes)) {
    const originalSrc = asset.originalSrc ?? asset.src;
    const original = await readFile(`public${originalSrc}`);
    const hash = createHash('sha256')
      .update('webp-q90-preview1200-q75-v1')
      .update(original)
      .digest('hex')
      .slice(0, 20);
    let files = completed.get(hash);
    if (!files) {
      files = {
        src: `/maps/optimized/${hash}.webp`,
        previewSrc: `/maps/optimized/${hash}-preview.webp`,
      };
      const full = await sharp(original)
        .webp({ quality: 90, effort: 5 })
        .toBuffer();
      const preview = await sharp(original)
        .resize({
          width: 1200,
          height: 1200,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 75, effort: 4 })
        .toBuffer();
      await writeFile(`public${files.src}`, full);
      await writeFile(`public${files.previewSrc}`, preview);
      originalBytes += original.length;
      fullBytes += full.length;
      previewBytes += preview.length;
      completed.set(hash, files);
    }
    Object.assign(asset, files, { originalSrc });
  }
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify({
    uniqueMaps: completed.size,
    originalBytes,
    fullBytes,
    previewBytes,
  }),
);
