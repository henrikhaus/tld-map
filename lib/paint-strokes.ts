import type { Annotation } from './model';
import type { Camera, Viewport } from './map-view';
type PaintContext = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'arc'
  | 'fill'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'strokeStyle'
  | 'fillStyle'
>;
export function renderMapPaint(
  canvas: { width: number; height: number },
  context: PaintContext &
    Pick<CanvasRenderingContext2D, 'setTransform' | 'clearRect'>,
  strokes: Annotation[],
  view: Camera,
  size: Viewport,
  ratio: number,
) {
  const width = Math.max(1, Math.round(size.width * ratio));
  const height = Math.max(1, Math.round(size.height * ratio));
  // Resizing reallocates and clears the backing buffer. Camera changes only repaint it.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.setTransform(
    ratio * view.scale,
    0,
    0,
    ratio * view.scale,
    ratio * view.x,
    ratio * view.y,
  );
  paintStrokes(context, strokes);
}
export function paintStrokes(context: PaintContext, strokes: Annotation[]) {
  function paint(stroke: Annotation) {
    const points = stroke.points;
    if (!points?.length) return;
    context.lineWidth = stroke.width ?? 3;
    context.lineCap = context.lineJoin = 'round';
    context.beginPath();
    if (points.length === 1) {
      context.arc(
        points[0].x,
        points[0].y,
        context.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      context.fill();
    } else {
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
  }
  for (const stroke of strokes.filter((stroke) => (stroke.opacity ?? 1) < 1)) {
    context.globalCompositeOperation = 'destination-out';
    context.globalAlpha = 1;
    context.strokeStyle = context.fillStyle = '#000';
    paint(stroke);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = stroke.opacity ?? 1;
    context.strokeStyle = context.fillStyle = stroke.color;
    paint(stroke);
  }
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
  for (const stroke of strokes.filter(
    (stroke) => (stroke.opacity ?? 1) === 1,
  )) {
    context.strokeStyle = context.fillStyle = stroke.color;
    paint(stroke);
  }
}
