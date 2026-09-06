import { expect, test } from 'bun:test';
import { advanceMapGesture, type MapGesture } from '../lib/map-gesture';
import { panView } from '../lib/map-view';

test('placement, erasing and opening a note stay clicks through minor pointer jitter', () => {
  for (const mode of ['place', 'erase', 'activate'] as const) {
    const start = { mode, x: 100, y: 100 };
    expect(advanceMapGesture(start, { x: 100, y: 100 })).toBeNull();
    expect(advanceMapGesture(start, { x: 103, y: 102 })).toBeNull();
    expect(start.mode).toBe(mode);
  }
});

test('dragging cancels each pending action permanently, even after returning to the click position', () => {
  for (const mode of ['place', 'erase', 'activate'] as const) {
    const first = advanceMapGesture(
      { mode, x: 100, y: 100 },
      { x: 110, y: 105 },
    )!;
    expect(first.gesture.mode).toBe('pan');
    expect(first.delta).toEqual({ x: 10, y: 5 });
    const back = advanceMapGesture(first.gesture, { x: 100, y: 100 })!;
    expect(back.gesture.mode).toBe('pan');
    expect(back.delta).toEqual({ x: -10, y: -5 });
    const release = advanceMapGesture(back.gesture, { x: 100, y: 100 })!;
    expect(release.gesture.mode).toBe('pan');
  }
});

test('dragging uses incremental map movement without triggering tool actions', () => {
  let gesture: MapGesture = { mode: 'place', x: 100, y: 100 };
  let camera = { x: -50, y: -25, scale: 0.5 };
  for (const pointer of [
    { x: 110, y: 105 },
    { x: 130, y: 115 },
    { x: 140, y: 120 },
  ]) {
    const next = advanceMapGesture(gesture, pointer)!;
    gesture = next.gesture;
    camera = panView(camera, next.delta);
  }
  expect(camera).toEqual({ x: -10, y: -5, scale: 0.5 });
  expect(gesture.mode).toBe('pan');
});

test('a displaced pointer-up cancels placement even without an intervening move event', () => {
  const release = advanceMapGesture(
    { mode: 'place', x: 100, y: 100 },
    { x: 160, y: 100 },
  );
  expect(release?.gesture.mode).toBe('pan');
  expect(release?.delta).toEqual({ x: 60, y: 0 });
});
