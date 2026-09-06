import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { findEraserTarget } from '../lib/map-eraser';
import MapEraserPreview from '../components/map-eraser-preview';
import type { Annotation } from '../lib/model';

const base = { x: 200, y: 100, color: '#fff', createdAt: '2026-09-06' };
const line: Annotation = {
  ...base,
  id: 'line',
  type: 'draw',
  width: 10,
  points: [
    { x: 200, y: 100 },
    { x: 400, y: 100 },
  ],
};
const labels: Annotation[] = [
  { ...base, id: 'icon', type: 'marker', icon: 'shelter' },
  { ...base, id: 'text', type: 'text', text: 'Shelter here' },
  { ...base, id: 'comment', type: 'comment', text: 'Supplies inside' },
];

test('eraser detects lines at different pan and zoom positions using screen-pixel tolerance', () => {
  for (const scale of [0.1, 0.5, 1, 3]) {
    const view = { x: 90, y: -5, scale };
    const pointer = { x: 300 * scale + view.x, y: 100 * scale + view.y };
    expect(findEraserTarget([line], pointer, view, [])?.annotation.id).toBe(
      'line',
    );
    expect(
      findEraserTarget(
        [line],
        { ...pointer, y: pointer.y + 5 * scale + 4 },
        view,
        [],
      )?.annotation.id,
    ).toBe('line');
    expect(
      findEraserTarget(
        [line],
        { ...pointer, y: pointer.y + 5 * scale + 6 },
        view,
        [],
      ),
    ).toBeNull();
  }
});

test('icons, text and comments use their visible bounds, including portions outside the map image', () => {
  const view = { x: 100, y: 100, scale: 0.2 };
  const bounds = { left: 80, right: 120, top: 80, bottom: 120 };
  for (const annotation of labels) {
    const target = findEraserTarget([annotation], { x: 85, y: 85 }, view, [
      { id: annotation.id, bounds },
    ]);
    expect(target).toEqual({ annotation, bounds });
    const html = renderToStaticMarkup(
      <MapEraserPreview target={target!} view={view} />,
    );
    expect(html).toContain('class="map-eraser-preview"');
    expect(html).toContain('<rect');
    expect(html).toContain('stroke="#111"');
    expect(html).toContain('stroke="#fff"');
  }
});

test('the topmost visible label is the one highlighted and selected over a stroke', () => {
  const bounds = { left: 280, right: 320, top: 80, bottom: 120 };
  const hit = findEraserTarget(
    [line, ...labels],
    { x: 300, y: 100 },
    { x: 0, y: 0, scale: 1 },
    labels.map((a) => ({ id: a.id, bounds })),
  );
  expect(hit?.annotation.id).toBe('comment');
  const remaining = [line, ...labels].filter(
    (a) => a.id !== hit?.annotation.id,
  );
  expect(remaining.map((a) => a.id)).toEqual(['line', 'icon', 'text']);
  expect(
    findEraserTarget(
      remaining,
      { x: 300, y: 100 },
      { x: 0, y: 0, scale: 1 },
      labels.map((a) => ({ id: a.id, bounds })),
    )?.annotation.id,
  ).toBe('text');
});

test('line and dot previews render above the map in viewport coordinates', () => {
  const view = { x: 10, y: 20, scale: 2 };
  const html = renderToStaticMarkup(
    <MapEraserPreview target={{ annotation: line }} view={view} />,
  );
  expect(html).toContain('points="410,220 810,220"');
  expect(html).toContain('stroke-width="24"');
  expect(html).toContain('opacity="1"');
  expect(html).toContain('brightness(1.35)');
  const dot = renderToStaticMarkup(
    <MapEraserPreview
      target={{ annotation: { ...line, points: [line.points![0]] } }}
      view={view}
    />,
  );
  expect(dot).toContain('<circle');
  expect(dot).toContain('cx="410"');
  expect(dot).toContain('cy="220"');
  const translucent = renderToStaticMarkup(
    <MapEraserPreview
      target={{ annotation: { ...line, color: '#f03050', opacity: 0.4 } }}
      view={view}
    />,
  );
  expect(translucent).toContain('stroke="#f03050"');
  expect(translucent).toContain('opacity="0.7"');
  expect(translucent).not.toContain('stroke="#111"');
  expect(translucent).not.toContain('stroke="#ffffffbb"');
});

test('empty areas and stale label bounds never select a deleted annotation', () => {
  expect(
    findEraserTarget([line], { x: 900, y: 900 }, { x: 0, y: 0, scale: 1 }, []),
  ).toBeNull();
  expect(
    findEraserTarget([], { x: 10, y: 10 }, { x: 0, y: 0, scale: 1 }, [
      { id: 'deleted', bounds: { left: 0, right: 20, top: 0, bottom: 20 } },
    ]),
  ).toBeNull();
});
