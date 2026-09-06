import { expect, test } from 'bun:test';
import {
  changeAnnotationHistory,
  type AnnotationHistory,
} from '../lib/annotation-history';
import type { Annotation } from '../lib/model';

function line(id: string): Annotation {
  return {
    id,
    type: 'draw',
    x: 0,
    y: 0,
    color: '#ff0000',
    width: 3,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    createdAt: '2026-09-06',
  };
}
const empty = (): AnnotationHistory => ({ past: [], present: [], future: [] });

test('ten strokes undo immediately down to an empty map and redo in order', () => {
  let state = empty();
  for (let i = 1; i <= 10; i++) {
    state = changeAnnotationHistory(state, {
      type: 'commit',
      annotations: [...state.present, line(String(i))],
    });
  }
  const completed = state.present;
  for (let remaining = 9; remaining >= 0; remaining--) {
    state = changeAnnotationHistory(state, { type: 'undo' });
    expect(state.present.map((a) => a.id)).toEqual(
      completed.slice(0, remaining).map((a) => a.id),
    );
    expect(state.past.length).toBe(remaining);
  }
  expect(changeAnnotationHistory(state, { type: 'undo' })).toBe(state);
  for (let restored = 1; restored <= 10; restored++) {
    state = changeAnnotationHistory(state, { type: 'redo' });
    expect(state.present).toEqual(completed.slice(0, restored));
  }
  expect(changeAnnotationHistory(state, { type: 'redo' })).toBe(state);
  expect(completed.length).toBe(10);
});

test('consecutive transitions preserve snapshots without waiting for a render', () => {
  const before = empty();
  const one = changeAnnotationHistory(before, {
    type: 'commit',
    annotations: [line('one')],
  });
  const two = changeAnnotationHistory(one, {
    type: 'commit',
    annotations: [...one.present, line('two')],
  });
  const undoOne = changeAnnotationHistory(two, { type: 'undo' });
  const undoTwo = changeAnnotationHistory(undoOne, { type: 'undo' });
  expect(undoOne.present).toEqual(one.present);
  expect(undoTwo.present).toEqual([]);
  expect(one.past).toEqual([[]]);
  expect(two.past).toEqual([[], one.present]);
  expect(before).toEqual(empty());
});

test('a new edit after undo clears redo, while edits and erasures restore their previous contents', () => {
  const original = line('one');
  let state = changeAnnotationHistory(empty(), {
    type: 'commit',
    annotations: [original],
  });
  state = changeAnnotationHistory(state, {
    type: 'commit',
    annotations: [{ ...original, color: '#0000ff' }],
  });
  state = changeAnnotationHistory(state, { type: 'commit', annotations: [] });
  state = changeAnnotationHistory(state, { type: 'undo' });
  expect(state.present[0].color).toBe('#0000ff');
  state = changeAnnotationHistory(state, { type: 'undo' });
  expect(state.present).toEqual([original]);
  state = changeAnnotationHistory(state, {
    type: 'commit',
    annotations: [...state.present, line('new')],
  });
  expect(state.future).toEqual([]);
  expect(changeAnnotationHistory(state, { type: 'redo' })).toBe(state);
  expect(changeAnnotationHistory(state, { type: 'undo' }).present).toEqual([
    original,
  ]);
});

test('history retains the latest forty edits and restores pre-existing map annotations', () => {
  const original = line('saved');
  let state: AnnotationHistory = { ...empty(), present: [original] };
  state = changeAnnotationHistory(state, {
    type: 'commit',
    annotations: [original, line('new')],
  });
  expect(changeAnnotationHistory(state, { type: 'undo' }).present).toEqual([
    original,
  ]);
  for (let i = 0; i < 50; i++) {
    state = changeAnnotationHistory(state, {
      type: 'commit',
      annotations: [...state.present, line(String(i))],
    });
  }
  expect(state.past.length).toBe(40);
});
