import { expect, test } from 'bun:test';
import { createRun, initialAtlas, type Run } from '../lib/model';
import {
  addImportedRun,
  exportRun,
  parseRunFile,
  MAX_RUN_FILE_BYTES,
} from '../lib/run-transfer';

function populatedRun(): Run {
  const run = createRun('Coastal expedition', 'Misery');
  run.generalNotes = 'Day 12\nTravel notes — 火';
  run.regionNotes = { 'mystery-lake': 'Food in the cabin' };
  run.selectedMap = 'game-world';
  run.lootSets = [2, 4];
  run.discoveries = ['found'];
  run.dismissedLoot = ['dismissed'];
  run.collapsedLootRegions = ['Mystery Lake'];
  run.mapViews = {
    'game-world:interloper': { centerX: 1234, centerY: 500, scale: 0.7 },
  };
  run.annotations = {
    'mystery-lake:interloper': [
      'draw',
      'text',
      'comment',
      'marker',
      'note',
    ].map((type, i) => ({
      id: `annotation-${i}`,
      type: type as Run['annotations'][string][number]['type'],
      color: '#ff442b',
      x: 120,
      y: 250,
      createdAt: run.createdAt,
      text: 'Camp here\nTwo nights',
      points: [
        { x: 120, y: 250 },
        { x: 130, y: 260 },
      ],
      width: 25,
      opacity: 0.4,
      icon: 'shelter',
      shadow: true,
      circle: false,
    })),
  };
  return run;
}

test('run exports round-trip all notes, annotations, loot progress and map views', () => {
  const run = populatedRun();
  const { content, filename } = exportRun(run);
  const imported = parseRunFile(content);
  expect(imported.id).not.toBe(run.id);
  expect({ ...imported, id: run.id }).toEqual(run);
  expect(filename).toMatch(
    /^Coastal-expedition-\d{4}-\d{2}-\d{2}\.tld-run\.json$/,
  );
  expect(parseRunFile(content).id).not.toBe(imported.id);
  expect(JSON.parse(content).format).toBe('tld-atlas-run');
});

test('imports add a uniquely named copy without changing existing runs', () => {
  const state = initialAtlas();
  const before = JSON.stringify(state);
  const file = exportRun(state.runs[0]).content;
  const imported = parseRunFile(file);
  const next = addImportedRun(state, imported);
  expect(JSON.stringify(state)).toBe(before);
  expect(next.runs[0]).toEqual(state.runs[0]);
  expect(next.runs[1].name).toBe('My run (imported)');
  expect(next.activeRunId).toBe(imported.id);
  const third = addImportedRun(next, parseRunFile(file));
  expect(third.runs[2].name).toBe('My run (imported 2)');
});

test('unsupported files, versions, annotations and maps are rejected', () => {
  expect(() => parseRunFile('not JSON')).toThrow('not valid JSON');
  expect(() => parseRunFile(JSON.stringify(initialAtlas()))).toThrow(
    'not a valid run export',
  );
  const file = JSON.parse(exportRun(populatedRun()).content);
  expect(() => parseRunFile(JSON.stringify({ ...file, version: 2 }))).toThrow(
    'unsupported format',
  );
  file.run.annotations['mystery-lake:interloper'][0].color =
    'url(https://untrusted.example)';
  expect(() => parseRunFile(JSON.stringify(file))).toThrow(
    'unsupported run data',
  );
  file.run.annotations = {};
  file.run.selectedMap = '__proto__';
  expect(() => parseRunFile(JSON.stringify(file))).toThrow('map unavailable');
  expect(() => parseRunFile(' '.repeat(MAX_RUN_FILE_BYTES + 1))).toThrow(
    'smaller than 10 MB',
  );
});

test('export includes only run data and import respects the run limit', () => {
  const run = Object.assign(createRun(), {
    password: 'not-to-export',
    user: { name: 'private' },
  });
  const content = exportRun(run).content;
  expect(content).not.toContain('not-to-export');
  expect(content).not.toContain('private');
  const state = initialAtlas();
  state.runs = Array.from({ length: 100 }, () => createRun());
  state.activeRunId = state.runs[0].id;
  expect(() => addImportedRun(state, parseRunFile(content))).toThrow(
    '100 runs',
  );
  expect(state.runs).toHaveLength(100);
});
