import { describe, expect, test } from 'bun:test';
import {
  atlasSchema,
  blankLootComments,
  excludedAlternative,
  lootGroups,
  selectedLootSets,
  spawnGroups,
  toggleLootDiscovery,
  toggleLootDismissed,
  candidateSets,
  createRun,
  effectiveSet,
  initialAtlas,
  loot,
  mapLoot,
  maps,
  mergeGuestRuns,
  regionToMap,
  regionNote,
  regionGroups,
  runLoot,
  sourceNotes,
} from '../lib/model';
import source from '../data/loot.json';
import world from '../data/world.json';
import { existsSync } from 'node:fs';

describe('Workbook fidelity', () => {
  test('all 577 workbook cells remain traceable', () => {
    expect(loot).toHaveLength(219);
    for (const [sheet, count] of Object.entries(source.counts)) {
      expect(
        loot.flatMap((e) => e.sources).filter((s) => s.sheet === sheet),
      ).toHaveLength(count);
    }
    expect(loot.reduce((sum, e) => sum + e.sources.length, 0)).toBe(577);
  });
  test('Mystery Lake source cells preserve the supplied entries', () => {
    const bedroll = loot.find(
      (e) =>
        e.region === 'Mystery Lake' &&
        e.item === 'Bedroll' &&
        e.location === 'Camp Office',
    )!;
    expect(bedroll.sets).toContain(1);
    expect(bedroll.sources).toContainEqual(
      expect.objectContaining({ sheet: 'Set1', cell: 'B66' }),
    );
    expect(sourceNotes(bedroll, 1)[0].note).toContain('under the stairs');
  });
  test('every workbook region resolves to a real atlas map', () => {
    for (const entry of loot)
      expect(maps[regionToMap(entry.region)]).toBeDefined();
    expect(
      mapLoot('mystery-lake').every((e) => e.region === 'Mystery Lake'),
    ).toBe(true);
  });
  test('each map image exists with valid dimensions, including all clickable world links', () => {
    for (const modes of Object.values(maps))
      for (const asset of Object.values(modes)) {
        expect(existsSync(`public${asset.src}`)).toBe(true);
        expect(asset.width).toBeGreaterThan(0);
        expect(asset.height).toBeGreaterThan(0);
      }
    expect(world.links).toHaveLength(23);
    for (const link of world.links) {
      expect(maps[link.id]).toBeDefined();
      expect(link.x).toBeLessThan(world.width);
      expect(link.y).toBeLessThan(world.height);
      expect(link.width).toBeGreaterThan(0);
      expect(link.height).toBeGreaterThan(0);
      expect(link.x - link.width / 2).toBeGreaterThanOrEqual(0);
      expect(link.y - link.height / 2).toBeGreaterThanOrEqual(0);
      expect(link.x + link.width / 2).toBeLessThanOrEqual(world.width);
      expect(link.y + link.height / 2).toBeLessThanOrEqual(world.height);
    }
  });
});
describe('Discovery-driven run sets', () => {
  test('unknown starts with all four candidates', () =>
    expect(candidateSets([])).toEqual([1, 2, 3, 4]));
  test('a find common to all sets does not eliminate a set', () => {
    const shared = loot.find((e) => e.sets.length === 4)!;
    expect(candidateSets([shared.id])).toEqual([1, 2, 3, 4]);
  });
  test('a unique discovery identifies its set and removing it restores unknown', () => {
    const unique = loot.find((e) => e.sets.length === 1)!;
    const run = createRun();
    run.discoveries = [unique.id];
    expect(effectiveSet(run)).toBe(unique.sets[0]);
    run.discoveries = [];
    expect(effectiveSet(run)).toBeNull();
  });
  test('conflicting evidence remains a visible conflict, without inventing a set', () => {
    const first = loot.find((e) => e.sets.length === 1)!;
    const second = loot.find(
      (e) => e.sets.length === 1 && e.sets[0] !== first.sets[0],
    )!;
    expect(candidateSets([first.id, second.id])).toEqual([]);
  });
  test('manual selection persists across map changes and is isolated by run', () => {
    const a = createRun(),
      b = createRun();
    a.lootSet = 3;
    a.selectedMap = 'ash-canyon';
    expect(effectiveSet(a)).toBe(3);
    expect(effectiveSet(b)).toBeNull();
  });
});
describe('Journal integrity', () => {
  test('guest import preserves both journals and deduplicates subsequent imports', () => {
    const guest = initialAtlas(),
      account = initialAtlas();
    const merged = mergeGuestRuns(account, guest);
    expect(merged.runs).toHaveLength(2);
    expect(mergeGuestRuns(merged, guest).runs).toHaveLength(2);
    expect(guest.runs).toHaveLength(1);
    expect(account.runs).toHaveLength(1);
  });
  test('validation rejects malformed coordinates, empty journals and unknown active run', () => {
    const state = initialAtlas();
    expect(atlasSchema.safeParse(state).success).toBe(true);
    expect(atlasSchema.safeParse({ ...state, runs: [] }).success).toBe(false);
    expect(
      atlasSchema.safeParse({ ...state, activeRunId: 'not-owned' }).success,
    ).toBe(false);
    const bad = structuredClone(state);
    bad.runs[0].annotations['mystery-lake:interloper'] = [
      {
        id: 'test',
        type: 'note',
        color: '#d26750',
        x: NaN,
        y: 1,
        createdAt: new Date().toISOString(),
      },
    ];
    expect(atlasSchema.safeParse(bad).success).toBe(false);
  });
});

describe('Region journal and compact loot grid', () => {
  test('old snapshots gain region notes and no longer reopen removed guides', () => {
    const state = initialAtlas();
    const { regionNotes: _notes, ...legacy } = state.runs[0];
    const restored = atlasSchema.parse({
      ...state,
      runs: [{ ...legacy, selectedMap: 'must-read-information' }],
    });
    expect(restored.runs[0].regionNotes).toEqual({});
    expect(restored.runs[0].selectedMap).toBe('mystery-lake');
    expect(regionGroups.flatMap((group) => group.ids)).not.toContain(
      'must-read-information',
    );
    expect(regionGroups.flatMap((group) => group.ids)).not.toContain(
      'additions-&-changes',
    );
  });
  test('legacy notes are readable per region, and editing or clearing does not resurrect them', () => {
    const run = createRun();
    run.annotations['mystery-lake:interloper'] = [
      {
        id: 'old-note',
        type: 'note',
        x: 1,
        y: 1,
        color: '#ffffff',
        title: 'Camp Office',
        text: 'Food upstairs',
        createdAt: '2026-09-06',
      },
    ];
    expect(regionNote(run, 'mystery-lake')).toBe('Camp Office\nFood upstairs');
    expect(regionNote(run, 'ash-canyon')).toBe('');
    run.regionNotes['mystery-lake'] = 'Return tomorrow';
    expect(regionNote(run, 'mystery-lake')).toBe('Return tomorrow');
    expect(regionNote(createRun(), 'mystery-lake')).toBe('');
    run.regionNotes['mystery-lake'] = '';
    expect(regionNote(run, 'mystery-lake')).toBe('');
    expect(run.annotations['mystery-lake:interloper'][0].text).toBe(
      'Food upstairs',
    );
  });
  test('grid includes all 219 locations when unknown and only the selected set otherwise', () => {
    const run = createRun();
    expect(runLoot(run)).toHaveLength(219);
    for (const set of [1, 2, 3, 4]) {
      run.lootSet = set;
      expect(runLoot(run)).toEqual(
        loot.filter((entry) => entry.sets.includes(set)),
      );
    }
  });
  test('a conflicting discovery stays accessible for correction', () => {
    const run = createRun();
    const unique = loot.find((entry) => entry.sets.length === 1)!;
    run.discoveries = [unique.id];
    run.lootSet = unique.sets[0] === 1 ? 2 : 1;
    expect(runLoot(run)).toContain(unique);
    run.discoveries = [];
    expect(runLoot(run)).not.toContain(unique);
  });
});

describe('Workbook spawn groups and per-run loot actions', () => {
  test('every imported spawn belongs to exactly its source bordered group', () => {
    expect(
      spawnGroups.reduce((count, group) => count + group.entries.length, 0),
    ).toBe(577);
    for (const group of spawnGroups) {
      for (const id of group.entries) {
        const entry = loot.find((entry) => entry.id === id)!;
        expect(entry.region).toBe(group.region);
        expect(entry.item).toBe(group.item);
        expect(
          entry.sources.some(
            (source) =>
              source.group === group.id && source.sheet === `Set${group.set}`,
          ),
        ).toBe(true);
      }
    }
  });
  test('Set 4 Bleak Inlet prybar preserves its independent inside spawn', () => {
    const groups = lootGroups('Bleak Inlet', 'Prybar', [4]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.entries.length)).toEqual([5, 1]);
    const inside = loot.find(
      (entry) =>
        entry.region === 'Bleak Inlet' &&
        entry.item === 'Prybar' &&
        entry.location === 'Cannery, inside',
    )!;
    expect(groups[1].entries).toEqual([inside.id]);
    const run = createRun();
    Object.assign(
      run,
      toggleLootDiscovery(run, groups[0].entries[0], groups[0]),
    );
    expect(excludedAlternative(run, groups[0].entries[1], groups[0])).toBe(
      true,
    );
    expect(excludedAlternative(run, inside.id, groups[1])).toBe(false);
    Object.assign(run, toggleLootDiscovery(run, inside.id, groups[1]));
    expect(run.discoveries).toHaveLength(2);
    Object.assign(
      run,
      toggleLootDiscovery(run, groups[0].entries[0], groups[0]),
    );
    expect(excludedAlternative(run, groups[0].entries[1], groups[0])).toBe(
      false,
    );
    expect(run.discoveries).toEqual([inside.id]);
  });
  test('manual strikethrough toggles without ruling out a loot set', () => {
    const run = createRun(),
      group = lootGroups('Bleak Inlet', 'Prybar', [4])[0],
      id = group.entries[0];
    Object.assign(run, toggleLootDismissed(run, id, group));
    expect(run.dismissedLoot).toContain(id);
    expect(selectedLootSets(run)).toEqual([1, 2, 3, 4]);
    expect(run.discoveries).toEqual([]);
    Object.assign(run, toggleLootDismissed(run, id, group));
    expect(run.dismissedLoot).toEqual([]);
  });
  test('checking another alternative replaces only that group’s previous find', () => {
    const run = createRun(),
      group = lootGroups('Bleak Inlet', 'Prybar', [4])[0];
    Object.assign(run, toggleLootDiscovery(run, group.entries[0], group));
    Object.assign(run, toggleLootDiscovery(run, group.entries[1], group));
    expect(run.discoveries).toEqual([group.entries[1]]);
    Object.assign(run, toggleLootDismissed(run, group.entries[0], group));
    expect(run.discoveries).toEqual([]);
  });
  test('blank Set 4 Bleak Inlet hammer comments remain readable, without inventing a spawn', () => {
    const comment = blankLootComments.find(
      (comment) => comment.sheet === 'Set4' && comment.cell === 'E13',
    )!;
    expect(comment.region).toBe('Bleak Inlet');
    expect(comment.item).toBe('Hammer');
    expect(comment.note).toContain('Prepper Cache');
    expect(comment.community).toBe(true);
    expect(lootGroups('Bleak Inlet', 'Hammer', [4])).toEqual([]);
  });
  test('multiselect includes any combination, empty selection, and legacy single selections', () => {
    const run = createRun();
    expect(run.name).toBe('My run');
    run.lootSet = 4;
    expect(selectedLootSets(run)).toEqual([4]);
    run.lootSets = [1, 3];
    expect(selectedLootSets(run)).toEqual([1, 3]);
    expect(
      lootGroups('Bleak Inlet', 'Prybar', [1, 3]).every(
        (group) => group.sets.join(',') === '1,3',
      ),
    ).toBe(true);
    run.lootSets = [];
    expect(selectedLootSets(run)).toEqual([]);
    expect(lootGroups('Bleak Inlet', 'Prybar', [])).toEqual([]);
    expect(selectedLootSets(createRun())).toEqual([1, 2, 3, 4]);
  });
});
