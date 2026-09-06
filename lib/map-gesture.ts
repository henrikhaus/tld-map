import type { Point } from './model';

export type MapGesture = Point & {
  mode: 'place' | 'erase' | 'activate' | 'pan';
};

/** Once a click becomes a drag, returning to the starting point cannot restore it. */
export function advanceMapGesture(gesture: MapGesture, pointer: Point) {
  const delta = { x: pointer.x - gesture.x, y: pointer.y - gesture.y };
  if (gesture.mode !== 'pan' && Math.hypot(delta.x, delta.y) <= 4) return null;
  return { delta, gesture: { ...pointer, mode: 'pan' as const } };
}
