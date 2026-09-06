import type { Annotation, Point } from './model';

/** A text edit is a transaction: blank saves delete; Escape never commits. */
export function saveMapText(
  annotations: Annotation[],
  draft: Annotation,
): Annotation[] {
  if (!draft.text?.trim())
    return annotations.filter((item) => item.id !== draft.id);
  return annotations.some((item) => item.id === draft.id)
    ? annotations.map((item) => (item.id === draft.id ? draft : item))
    : [...annotations, draft];
}
export function draggedLabel(
  annotation: Annotation,
  delta: Point,
  scale: number,
  bounds: Point,
): Annotation {
  return {
    ...annotation,
    x: Math.max(0, Math.min(bounds.x, annotation.x + delta.x / scale)),
    y: Math.max(0, Math.min(bounds.y, annotation.y + delta.y / scale)),
  };
}

export function brushFromSlider(position: number) {
  return Math.max(
    1,
    Math.min(60, Math.round(1 + 59 * Math.pow(position / 100, 1.6))),
  );
}
export function sliderFromBrush(width: number) {
  return 100 * Math.pow((Math.max(1, Math.min(60, width)) - 1) / 59, 1 / 1.6);
}
export function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (
    cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0
  )
    return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}
export function strokeHit(
  stroke: Annotation,
  from: Point,
  to: Point,
  radius: number,
) {
  return (
    stroke.type === 'draw' &&
    !!stroke.points?.some(
      (point, index, points) =>
        segmentDistance(from, to, points[Math.max(0, index - 1)], point) <=
        radius + (stroke.width ?? 3) / 2,
    )
  );
}
export function rectangleHit(
  from: Point,
  to: Point,
  rect: { left: number; top: number; right: number; bottom: number },
  radius: number,
) {
  const a = { x: rect.left - radius, y: rect.top - radius },
    b = { x: rect.right + radius, y: rect.top - radius },
    c = { x: rect.right + radius, y: rect.bottom + radius },
    d = { x: rect.left - radius, y: rect.bottom + radius };
  const inside = (p: Point) =>
    p.x >= a.x && p.x <= c.x && p.y >= a.y && p.y <= c.y;
  return (
    inside(from) ||
    inside(to) ||
    [
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ].some(([x, y]) => segmentDistance(from, to, x, y) === 0)
  );
}

/** Match the paint order: opaque strokes sit above translucent strokes. */
export function eraserStrokeAt(
  annotations: Annotation[],
  point: Point,
  radius: number,
) {
  const reversed = [...annotations].reverse();
  return (
    reversed.find(
      (a) => (a.opacity ?? 1) === 1 && strokeHit(a, point, point, radius),
    ) ??
    reversed.find(
      (a) => (a.opacity ?? 1) < 1 && strokeHit(a, point, point, radius),
    )
  );
}
export function isEraserClick(start: Point, end: Point, moved = false) {
  return !moved && Math.hypot(end.x - start.x, end.y - start.y) <= 4;
}
