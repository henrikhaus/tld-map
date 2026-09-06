import { z } from 'zod';
import rawMaps from '@/data/maps.json';
import rawLoot from '@/data/loot.json';

export const COLORS = [
  '#ff442b',
  '#1685ff',
  '#37d34a',
  '#ffd21c',
  '#b44dff',
  '#252c30',
  '#f5f1dd',
];
export const markerKinds = [
  'shelter',
  'fire',
  'danger',
  'supplies',
  'destination',
  'hunting',
] as const;
export const pointSchema = z.object({
  x: z.number().min(0).max(30000),
  y: z.number().min(0).max(30000),
});
export const annotationSchema = z.object({
  id: z.string().max(100),
  type: z.enum(['draw', 'text', 'note', 'marker', 'comment']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  x: z.number().min(0).max(30000),
  y: z.number().min(0).max(30000),
  points: z.array(pointSchema).max(20000).optional(),
  width: z.number().min(0.1).max(1000000).optional(),
  opacity: z.number().min(0.01).max(1).optional(),
  shadow: z.boolean().optional(),
  circle: z.boolean().optional(),
  title: z.string().max(120).optional(),
  text: z.string().max(5000).optional(),
  icon: z.enum(markerKinds).optional(),
  lootId: z.string().max(100).optional(),
  createdAt: z.string().max(40),
});
export const runSchema = z.object({
  id: z.string().max(100),
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .transform((name) => (name === 'The quiet wilderness' ? 'My run' : name)),
  difficulty: z.enum([
    'Interloper',
    'Misery',
    'Pilgrim',
    'Voyageur',
    'Stalker',
    'Custom',
  ]),
  createdAt: z.string().max(40),
  selectedMap: z
    .string()
    .max(100)
    .transform((id) =>
      ['must-read-information', 'additions-&-changes'].includes(id)
        ? 'mystery-lake'
        : ((
            {
              'sundered-pass-map-locations': 'sundered-pass',
              'zone-of-contamination-map-locations': 'zone-of-contamination',
              'forsaken-airfield-map-locations': 'forsaken-airfield',
            } as Record<string, string>
          )[id] ?? id),
    ),
  lootSet: z.number().int().min(1).max(4).nullable(),
  lootSets: z
    .array(z.number().int().min(1).max(4))
    .max(4)
    .refine((sets) => new Set(sets).size === sets.length)
    .optional(),
  mapViews: z
    .record(
      z.string().max(140),
      z.object({
        centerX: z.number().min(-1000000).max(1000000),
        centerY: z.number().min(-1000000).max(1000000),
        scale: z.number().min(0.0001).max(4),
      }),
    )
    .default({}),
  generalNotes: z.string().max(1000000).default(''),
  collapsedLootRegions: z.array(z.string().max(100)).max(100).default([]),
  dismissedLoot: z.array(z.string().max(100)).max(1000).default([]),
  discoveries: z.array(z.string().max(100)).max(1000),
  regionNotes: z
    .record(z.string().max(100), z.string().max(100000))
    .default({}),
  annotations: z.record(
    z.string().max(140),
    z.array(annotationSchema).max(3000),
  ),
});
export const atlasSchema = z
  .object({
    version: z.literal(1),
    activeRunId: z.string().max(100),
    runs: z.array(runSchema).min(1).max(100),
  })
  .superRefine((state, ctx) => {
    if (new Set(state.runs.map((r) => r.id)).size !== state.runs.length)
      ctx.addIssue({ code: 'custom', message: 'Run IDs must be unique' });
    if (!state.runs.some((r) => r.id === state.activeRunId))
      ctx.addIssue({ code: 'custom', message: 'Active run must exist' });
  });
export type Annotation = z.infer<typeof annotationSchema>;
export type Run = z.infer<typeof runSchema>;
export type AtlasState = z.infer<typeof atlasSchema>;
export type Tool = 'hand' | 'draw' | 'text' | 'marker' | 'comment' | 'erase';
export type Point = z.infer<typeof pointSchema>;
export type LootEntry = (typeof rawLoot.entries)[number];
export type MapAsset = {
  src: string;
  previewSrc?: string;
  originalSrc?: string;
  width: number;
  height: number;
  source: string;
};
export const maps = rawMaps as Record<
  string,
  Record<'pilgrim' | 'interloper', MapAsset>
>;
export const loot = rawLoot.entries;
export const lootItems = [...new Set(loot.map((e) => e.item))];
export const lootRegions = [...new Set(loot.map((e) => e.region))].sort();
const names: Record<string, string> = {
  'game-world': 'World map',
  'keepers-pass': 'Keeper’s Pass',
  'winding-river-&-carter-hydro-dam': 'Winding River & Carter Hydro Dam',
  'transition-cave': 'Far Territory transition cave',
  'must-read-information': 'Map reading guide',
  'additions-&-changes': 'Map updates',
  'connections-between-regions': 'Region connections',
};
export function mapName(id: string) {
  return (
    names[id] ??
    id
      .split('-')
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(' ')
  );
}
export const regionGroups = [
  {
    name: 'Lower Great Bear',
    ids: [
      'mystery-lake',
      'coastal-highway',
      'mountain-town',
      'pleasant-valley',
      'desolation-point',
      'timberwolf-mountain',
      'ash-canyon',
      'forlorn-muskeg',
      'broken-railroad',
      'hushed-river-valley',
      'bleak-inlet',
      'blackrock',
    ],
  },
  {
    name: 'The Far Territory',
    ids: [
      'transfer-pass',
      'forsaken-airfield',
      'zone-of-contamination',
      'sundered-pass',
    ],
  },
  {
    name: 'Passages & interiors',
    ids: [
      'ravine',
      'winding-river-&-carter-hydro-dam',
      'crumbling-highway',
      'keepers-pass',
      'far-range-branch-line',
      'langston-mine',
      'transition-cave',
      'connections-between-regions',
    ],
  },
];
export function regionToMap(region: string) {
  if (region === 'Winding River') return 'winding-river-&-carter-hydro-dam';
  return region
    .toLowerCase()
    .replace(/[’']/g, '')
    .replaceAll(' ', '-');
}
export function mapLoot(id: string) {
  return loot.filter(
    (e) =>
      regionToMap(e.region) === id ||
      (id === 'langston-mine' &&
        e.region === 'Zone of Contamination' &&
        e.location === 'Langston Mine'),
  );
}
export function modeFor(run: Run): 'pilgrim' | 'interloper' {
  return ['Interloper', 'Misery'].includes(run.difficulty)
    ? 'interloper'
    : 'pilgrim';
}
export function candidateSets(discoveries: string[]) {
  const entries = discoveries
    .map((id) => loot.find((e) => e.id === id))
    .filter((e): e is LootEntry => !!e);
  return [1, 2, 3, 4].filter((set) =>
    entries.every((e) => e.sets.includes(set)),
  );
}
export function effectiveSet(run: Run) {
  const possible = candidateSets(run.discoveries);
  return run.lootSet ?? (possible.length === 1 ? possible[0] : null);
}
export function createRun(
  name = 'My run',
  difficulty: Run['difficulty'] = 'Interloper',
): Run {
  return {
    id: crypto.randomUUID(),
    name,
    difficulty,
    createdAt: new Date().toISOString(),
    selectedMap: 'mystery-lake',
    lootSet: null,
    discoveries: [],
    dismissedLoot: [],
    collapsedLootRegions: [],
    generalNotes: '',
    mapViews: {},
    annotations: {},
    regionNotes: {},
  };
}
export function initialAtlas(): AtlasState {
  const run = createRun();
  return { version: 1, activeRunId: run.id, runs: [run] };
}
export function annotateKey(run: Run) {
  return `${run.selectedMap}:${modeFor(run)}`;
}
export function mergeGuestRuns(
  account: AtlasState,
  guest: AtlasState,
): AtlasState {
  const ids = new Set(account.runs.map((r) => r.id));
  const added = guest.runs.filter((r) => !ids.has(r.id));
  return { ...account, runs: [...account.runs, ...added].slice(0, 100) };
}
export function sourceNotes(entry: LootEntry, set: number | null) {
  const sources = set
    ? entry.sources.filter((s) => s.sheet === `Set${set}`)
    : entry.sources;
  return sources.filter(
    (s, i) => s.note && sources.findIndex((t) => t.note === s.note) === i,
  );
}

// Legacy point notes remain in the saved snapshot; regional text supersedes
// their combined content only once that region's note has been edited.
export function regionNote(run: Run, mapId: string) {
  if (Object.hasOwn(run.regionNotes, mapId)) return run.regionNotes[mapId];
  const notes = Object.entries(run.annotations)
    .filter(([key]) => key.slice(0, key.lastIndexOf(':')) === mapId)
    .flatMap(([, entries]) => entries.filter((entry) => entry.type === 'note'));
  return notes
    .filter((note, i) => notes.findIndex((other) => other.id === note.id) === i)
    .map((note) => [note.title, note.text].filter(Boolean).join('\n'))
    .join('\n\n');
}
export function runLoot(run: Run) {
  const selected = effectiveSet(run),
    candidates = candidateSets(run.discoveries);
  return loot.filter(
    (entry) =>
      // Keep recorded discoveries accessible, even when a manual set conflicts.
      run.discoveries.includes(entry.id) ||
      (selected
        ? entry.sets.includes(selected)
        : !candidates.length ||
          entry.sets.some((set) => candidates.includes(set))),
  );
}

export const spawnGroups = rawLoot.spawnGroups;
export const blankLootComments = rawLoot.additionalComments;
export function selectedLootSets(run: Run): number[] {
  // Preserve earlier single-set choices; new runs begin with all sets selected.
  return run.lootSets ?? (run.lootSet === null ? [1, 2, 3, 4] : [run.lootSet]);
}
export type LootGroup = { id: string; entries: string[]; sets: number[] };
export function lootGroups(
  region: string,
  item: string,
  sets: number[],
): LootGroup[] {
  const result = new Map<string, LootGroup>();
  for (const source of spawnGroups) {
    if (
      source.region !== region ||
      source.item !== item ||
      !sets.includes(source.set)
    )
      continue;
    const key = [...source.entries].sort().join('|');
    const existing = result.get(key);
    if (existing) existing.sets.push(source.set);
    else
      result.set(key, {
        id: source.id,
        entries: source.entries,
        sets: [source.set],
      });
  }
  return [...result.values()];
}
export function excludedAlternative(run: Run, id: string, group: LootGroup) {
  return (
    !run.discoveries.includes(id) &&
    group.entries.some(
      (other) => other !== id && run.discoveries.includes(other),
    )
  );
}
export function toggleLootDiscovery(
  run: Run,
  id: string,
  group: LootGroup,
): Partial<Run> {
  const found = run.discoveries.includes(id);
  return {
    discoveries: found
      ? run.discoveries.filter((other) => other !== id)
      : [
          ...run.discoveries.filter((other) => !group.entries.includes(other)),
          id,
        ],
    dismissedLoot: run.dismissedLoot.filter((other) => other !== id),
  };
}
export function toggleLootDismissed(
  run: Run,
  id: string,
  group: LootGroup,
): Partial<Run> {
  if (excludedAlternative(run, id, group)) {
    return {
      discoveries: run.discoveries.filter(
        (other) => !group.entries.includes(other),
      ),
      dismissedLoot: run.dismissedLoot.filter((other) => other !== id),
    };
  }
  return {
    dismissedLoot: run.dismissedLoot.includes(id)
      ? run.dismissedLoot.filter((other) => other !== id)
      : [...run.dismissedLoot, id],
    discoveries: run.discoveries.filter((other) => other !== id),
  };
}
