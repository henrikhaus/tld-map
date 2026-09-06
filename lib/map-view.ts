import type { MapAsset } from './model';
export type MapView = { centerX: number; centerY: number; scale: number };
export type Viewport = { width: number; height: number };
export type Camera = { x: number; y: number; scale: number };
export function panView(view: Camera, delta: { x: number; y: number }): Camera {
  return { ...view, x: view.x + delta.x, y: view.y + delta.y };
}
export function constrainView(
  view: Camera,
  asset: Pick<MapAsset, 'width' | 'height'>,
  size: Viewport,
): Camera {
  const fit = Math.min(size.width / asset.width, size.height / asset.height);
  const scale = Math.max(fit * 0.3, Math.min(4, view.scale));
  const width = asset.width * scale,
    height = asset.height * scale;
  const visibleX = Math.min(80, size.width / 4, width);
  const visibleY = Math.min(80, size.height / 4, height);
  return {
    scale,
    x: Math.max(visibleX - width, Math.min(size.width - visibleX, view.x)),
    y: Math.max(visibleY - height, Math.min(size.height - visibleY, view.y)),
  };
}
export function rememberView(view: Camera, size: Viewport): MapView {
  return {
    centerX: (size.width / 2 - view.x) / view.scale,
    centerY: (size.height / 2 - view.y) / view.scale,
    scale: view.scale,
  };
}
export function restoreView(
  saved: MapView,
  asset: Pick<MapAsset, 'width' | 'height'>,
  size: Viewport,
): Camera {
  return constrainView(
    {
      x: size.width / 2 - saved.centerX * saved.scale,
      y: size.height / 2 - saved.centerY * saved.scale,
      scale: saved.scale,
    },
    asset,
    size,
  );
}
