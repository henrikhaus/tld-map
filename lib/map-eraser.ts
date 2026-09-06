import type { Annotation, Point } from './model';
import type { Camera } from './map-view';
import { eraserStrokeAt, rectangleHit } from './map-annotations';

export type EraserBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type EraserTarget = { annotation: Annotation; bounds?: EraserBounds };

/** Bounds and pointer use viewport pixels; strokes keep their map coordinates. */
export function findEraserTarget(
  annotations: Annotation[],
  pointer: Point,
  view: Camera,
  labels: { id: string; bounds: EraserBounds }[],
): EraserTarget | null {
  for (const label of [...labels].reverse()) {
    const annotation = annotations.find(
      (a) => a.id === label.id && a.type !== 'draw' && a.type !== 'note',
    );
    if (annotation && rectangleHit(pointer, pointer, label.bounds, 3))
      return { annotation, bounds: label.bounds };
  }
  const annotation = eraserStrokeAt(
    annotations,
    {
      x: (pointer.x - view.x) / view.scale,
      y: (pointer.y - view.y) / view.scale,
    },
    5 / view.scale,
  );
  return annotation ? { annotation } : null;
}
