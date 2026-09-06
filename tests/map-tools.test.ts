import { expect, test } from 'bun:test';
import {
  brushFromSlider,
  sliderFromBrush,
  strokeHit,
  eraserStrokeAt,
  isEraserClick,
  rectangleHit,
  pointSegmentDistance,
} from '../lib/map-annotations';
import { paintStrokes, renderMapPaint } from '../lib/paint-strokes';
import type { Annotation, Point } from '../lib/model';

const stroke = (
  id: string,
  points: Point[],
  color = '#ff0000',
  opacity = 1,
): Annotation => ({
  id,
  type: 'draw',
  x: points[0].x,
  y: points[0].y,
  points,
  color,
  opacity,
  width: 4,
  createdAt: '2026-09-06',
});

test('brush control spans 1–60 px with finer adjustment at the small end and roundtrips manual values', () => {
  expect(brushFromSlider(0)).toBe(1);
  expect(brushFromSlider(100)).toBe(60);
  expect(brushFromSlider(50)).toBeLessThan(30);
  expect(brushFromSlider(20) - brushFromSlider(10)).toBeLessThan(
    brushFromSlider(90) - brushFromSlider(80),
  );
  for (let width = 1; width <= 60; width++)
    expect(brushFromSlider(sliderFromBrush(width))).toBe(width);
});

test('stroke geometry handles thick strokes and dots', () => {
  const annotations = [
    stroke('first', [
      { x: 20, y: 0 },
      { x: 20, y: 100 },
    ]),
    stroke('second', [
      { x: 80, y: 0 },
      { x: 80, y: 100 },
    ]),
    stroke('distant', [
      { x: 120, y: 0 },
      { x: 120, y: 100 },
    ]),
  ];
  const hits = annotations.filter((a) =>
    strokeHit(a, { x: 0, y: 50 }, { x: 100, y: 50 }, 2),
  );
  expect(hits.map((a) => a.id)).toEqual(['first', 'second']);
  expect(
    strokeHit(
      { ...annotations[0], width: 60 },
      { x: 45, y: 40 },
      { x: 45, y: 60 },
      2,
    ),
  ).toBe(true);
  expect(
    strokeHit(
      stroke('dot', [{ x: 50, y: 50 }]),
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      2,
    ),
  ).toBe(true);
});

test('rectangle hit geometry covers text and icon bounds', () => {
  const bounds = { left: 40, top: 40, right: 90, bottom: 60 };
  expect(rectangleHit({ x: 0, y: 50 }, { x: 120, y: 50 }, bounds, 2)).toBe(
    true,
  );
  expect(rectangleHit({ x: 0, y: 80 }, { x: 120, y: 80 }, bounds, 2)).toBe(
    false,
  );
  expect(rectangleHit({ x: 50, y: 50 }, { x: 50, y: 50 }, bounds, 2)).toBe(
    true,
  );
});

// Sample a few interior pixels using standard Canvas alpha compositing. This
// checks the renderer's overlap behavior without relying on edge antialiasing.
function sampledCanvas(samples: Point[]) {
  const pixels = samples.map(() => [0, 0, 0, 0]);
  let path: Point[] = [];
  const context: Parameters<typeof paintStrokes>[0] = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: '#000000',
    fillStyle: '#000000',
    beginPath() {
      path = [];
    },
    moveTo(x, y) {
      path.push({ x, y });
    },
    lineTo(x, y) {
      path.push({ x, y });
    },
    arc(x, y) {
      path = [{ x, y }];
    },
    fill() {
      this.stroke();
    },
    stroke() {
      for (let i = 0; i < samples.length; i++) {
        if (
          !path.some(
            (p, index) =>
              pointSegmentDistance(
                samples[i],
                path[Math.max(0, index - 1)],
                p,
              ) <
              this.lineWidth / 2,
          )
        )
          continue;
        if (this.globalCompositeOperation === 'destination-out') {
          pixels[i] = pixels[i].map((v) => v * (1 - this.globalAlpha));
          continue;
        }
        const hex = this.strokeStyle as string;
        const rgb = [1, 3, 5].map(
          (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
        );
        const a = this.globalAlpha;
        pixels[i] = [
          ...rgb.map((v, channel) => v * a + pixels[i][channel] * (1 - a)),
          a + pixels[i][3] * (1 - a),
        ];
      }
    },
  };
  return { context, pixels };
}

test('panning and zooming repaint a fixed canvas without reallocating its buffer', () => {
  let width = 0,
    height = 0,
    allocations = 0;
  const canvas = {
    get width() {
      return width;
    },
    set width(value: number) {
      width = value;
      allocations++;
    },
    get height() {
      return height;
    },
    set height(value: number) {
      height = value;
      allocations++;
    },
  };
  const calls: unknown[][] = [];
  const context = {
    ...sampledCanvas([]).context,
    setTransform(...args: unknown[]) {
      calls.push(['transform', ...args]);
    },
    clearRect(...args: number[]) {
      calls.push(['clear', ...args]);
    },
  };
  for (let i = 1; i <= 20; i++) {
    calls.length = 0;
    renderMapPaint(
      canvas,
      context,
      [],
      { x: -i * 20, y: i * 10, scale: i / 10 },
      { width: 800, height: 600 },
      2,
    );
    expect(calls).toEqual([
      ['transform', 1, 0, 0, 1, 0, 0],
      ['clear', 0, 0, 1600, 1200],
      ['transform', i / 5, 0, 0, i / 5, -i * 40, i * 20],
    ]);
  }
  expect(allocations).toBe(2);
  renderMapPaint(
    canvas,
    context,
    [],
    { x: 0, y: 0, scale: 1 },
    { width: 800, height: 700 },
    2,
  );
  expect(allocations).toBe(3);
  expect(canvas.height).toBe(1400);
});

test('new translucent paint replaces only overlapping translucent pixels and preserves opaque paint', () => {
  const strokes = [
    stroke(
      'old',
      [
        { x: 0, y: 5 },
        { x: 20, y: 5 },
      ],
      '#ff0000',
      0.4,
    ),
    stroke(
      'solid',
      [
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      '#00ff00',
    ),
    stroke(
      'new',
      [
        { x: 8, y: 5 },
        { x: 18, y: 5 },
      ],
      '#0000ff',
      0.5,
    ),
  ];
  const before = JSON.stringify(strokes);
  const { context, pixels } = sampledCanvas([
    { x: 0, y: 5 },
    { x: 14, y: 5 },
    { x: 10, y: 5 },
    { x: 14, y: 10 },
  ]);
  paintStrokes(context, strokes);
  expect(pixels).toEqual([
    [0.4, 0, 0, 0.4],
    [0, 0, 0.5, 0.5],
    [0, 1, 0, 1],
    [0, 0, 0, 0],
  ]);
  expect(JSON.stringify(strokes)).toBe(before);
  const restored = sampledCanvas([{ x: 14, y: 5 }]);
  paintStrokes(restored.context, strokes.slice(0, -1));
  expect(restored.pixels[0]).toEqual([0.4, 0, 0, 0.4]);
});

test('eraser picks a single topmost stroke and follows opaque paint ordering', () => {
  const point = { x: 5, y: 5 };
  const a = stroke('opaque', [point]);
  const b = stroke('translucent', [point], '#fff', 0.5);
  const c = stroke('newest', [point], '#fff', 0.7);
  expect(eraserStrokeAt([a, b, c], point, 1)?.id).toBe('opaque');
  expect(eraserStrokeAt([b, c], point, 1)?.id).toBe('newest');
  expect(eraserStrokeAt([a], { x: 50, y: 50 }, 1)).toBeUndefined();
  expect(isEraserClick(point, point)).toBe(true);
  expect(isEraserClick(point, { x: 20, y: 5 })).toBe(false);
  expect(isEraserClick(point, point, true)).toBe(false);
});
