import { expect, test } from 'bun:test';
import {
  constrainView,
  panView,
  rememberView,
  restoreView,
} from '../lib/map-view';
import { createRun, runSchema } from '../lib/model';
const asset = { width: 4000, height: 3000 },
  size = { width: 1000, height: 700 };
test('dragging continues from the current camera after zooming or reaching a pan boundary', () => {
  let view = constrainView(
    panView({ x: 0, y: 0, scale: 1 }, { x: 2000, y: 0 }),
    asset,
    size,
  );
  expect(view.x).toBe(920);
  view = constrainView(panView(view, { x: -5, y: 0 }), asset, size);
  expect(view.x).toBe(915);
  // A zoom around the viewport center occurs between pointer moves.
  view = { x: 500 - (500 - view.x) * 2, y: 350 - (350 - view.y) * 2, scale: 2 };
  const zoomed = view;
  expect(panView(view, { x: 0, y: 0 })).toEqual(zoomed);
  expect(panView(view, { x: -10, y: 6 })).toEqual({
    x: zoomed.x - 10,
    y: zoomed.y + 6,
    scale: 2,
  });
});
test('saved zoom and map center roundtrip and adapt to resized panels', () => {
  const camera = { x: -500, y: -200, scale: 0.6 };
  const saved = rememberView(camera, size);
  expect(restoreView(saved, asset, size)).toEqual(camera);
  const resized = { width: 700, height: 600 };
  expect(rememberView(restoreView(saved, asset, resized), resized)).toEqual(
    saved,
  );
});
test('panning and old saved views always retain a visible piece of the map', () => {
  for (const scale of [0.0001, 0.2, 1, 4]) {
    for (const x of [-100000, 100000])
      for (const y of [-100000, 100000]) {
        const v = constrainView({ x, y, scale }, asset, size);
        expect(v.x).toBeLessThanOrEqual(size.width - 80);
        expect(v.y).toBeLessThanOrEqual(size.height - 80);
        expect(v.x + asset.width * v.scale).toBeGreaterThanOrEqual(80);
        expect(v.y + asset.height * v.scale).toBeGreaterThanOrEqual(80);
      }
  }
});
test('legacy runs gain separate saved views without changing any annotations', () => {
  const run = createRun();
  const { mapViews: _views, ...legacy } = run;
  expect(runSchema.parse(legacy).mapViews).toEqual({});
  const view = rememberView({ x: -500, y: -200, scale: 0.6 }, size);
  run.mapViews['mystery-lake:interloper'] = view;
  expect(runSchema.parse(run).mapViews['mystery-lake:interloper']).toEqual(
    view,
  );
  expect(createRun().mapViews).toEqual({});
  expect(
    runSchema.safeParse({ ...run, mapViews: { bad: { ...view, scale: 0 } } })
      .success,
  ).toBe(false);
});
