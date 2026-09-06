import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRef } from 'react';
import MapEditor, { type EditorHandle } from '../components/map-editor';
import {
  annotationSchema,
  atlasSchema,
  createRun,
  initialAtlas,
  maps,
  type Annotation,
} from '../lib/model';
import { draggedLabel, saveMapText } from '../lib/map-annotations';
const text: Annotation = {
  id: 'label',
  type: 'text',
  color: '#abcdef',
  x: 100,
  y: 150,
  text: 'Camp',
  createdAt: '2026-09-06',
};
const noop = () => {};

test('inline text transactions add, replace and delete without mutating the original', () => {
  const original = [text];
  expect(saveMapText([], text)).toEqual(original);
  expect(saveMapText(original, { ...text, text: 'Home' })[0].text).toBe('Home');
  expect(original[0].text).toBe('Camp');
  expect(saveMapText(original, { ...text, text: '' })).toEqual([]);
  expect(saveMapText(original, { ...text, text: '  ' })).toEqual([]);
});

test('label drag uses map coordinates at each zoom level and clamps to map bounds', () => {
  expect(
    draggedLabel(text, { x: 40, y: -20 }, 0.5, { x: 1000, y: 1000 }),
  ).toMatchObject({ x: 180, y: 110 });
  expect(
    draggedLabel(text, { x: 40, y: -20 }, 2, { x: 1000, y: 1000 }),
  ).toMatchObject({ x: 120, y: 140 });
  expect(
    draggedLabel(text, { x: -5000, y: 5000 }, 1, { x: 1000, y: 1000 }),
  ).toMatchObject({ x: 0, y: 1000 });
  expect(text.x).toBe(100);
});

test('new styles and large strokes validate while invalid opacity is rejected', () => {
  expect(
    annotationSchema.parse({
      ...text,
      type: 'draw',
      width: 60000,
      opacity: 0.35,
    }).opacity,
  ).toBe(0.35);
  expect(annotationSchema.safeParse({ ...text, opacity: 1.2 }).success).toBe(
    false,
  );
  expect(annotationSchema.safeParse({ ...text, opacity: -1 }).success).toBe(
    false,
  );
  expect(annotationSchema.parse(text).shadow).toBeUndefined();
  expect(
    annotationSchema.parse({ ...text, type: 'marker' }).circle,
  ).toBeUndefined();
});

test('general notes default blank for legacy saves and remain independent by run', () => {
  const state = initialAtlas();
  const { generalNotes: _notes, ...legacy } = state.runs[0];
  expect(
    atlasSchema.parse({ ...state, runs: [legacy] }).runs[0].generalNotes,
  ).toBe('');
  state.runs[0].generalNotes = 'Return to the mine';
  expect(createRun().generalNotes).toBe('');
  expect(atlasSchema.parse(state).runs[0].generalNotes).toBe(
    'Return to the mine',
  );
});

test('text editing renders an inline input, while saved text has no tooltip trigger', () => {
  const props = {
    asset: maps['mystery-lake'].interloper,
    annotations: [text],
    onChange: noop,
    pendingLoot: null,
    onPlaced: noop,
    editorRef: createRef<EditorHandle>(),
  };
  const editing = renderToStaticMarkup(
    <MapEditor {...props} initialFocus={text} />,
  );
  expect(editing).toContain('inline-map-text');
  expect(editing).toContain('<textarea');
  expect(editing).not.toContain('role="dialog"');
  const saved = renderToStaticMarkup(<MapEditor {...props} />);
  const label = saved.match(/<button[^>]*class="annotation-text[^>]*>/)?.[0];
  expect(label).toBeDefined();
  expect(label).not.toContain('tooltip');
});

test('map comments use their own inline editor and never enter the legacy region note data', () => {
  const comment: Annotation = {
    ...text,
    type: 'comment',
    text: 'Matches under the stairs',
  };
  const html = renderToStaticMarkup(
    <MapEditor
      asset={maps['mystery-lake'].interloper}
      annotations={[]}
      initialFocus={comment}
      onChange={noop}
      pendingLoot={null}
      onPlaced={noop}
      editorRef={createRef<EditorHandle>()}
    />,
  );
  expect(html).toContain('aria-label="Map comment"');
  expect(html).toContain('Matches under the stairs');
  expect(html).not.toContain('role="dialog"');
});

test('a new empty comment shows its icon before saving and an empty save removes it', () => {
  const comment: Annotation = { ...text, type: 'comment', text: '' };
  const html = renderToStaticMarkup(
    <MapEditor
      asset={maps['mystery-lake'].interloper}
      annotations={[]}
      initialFocus={comment}
      onChange={noop}
      pendingLoot={null}
      onPlaced={noop}
      editorRef={createRef<EditorHandle>()}
    />,
  );
  expect(html).toContain('class="annotation-comment');
  expect(html).toContain('fill="currentColor"');
  expect(html).toContain('aria-label="Map comment"');
  expect(saveMapText([comment], comment)).toEqual([]);
});
