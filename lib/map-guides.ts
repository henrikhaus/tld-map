import { mapName, maps, type MapAsset } from './model';

// Public map labels for image and search descriptions; never user notes.
export const mapLandmarks: Record<string, string[]> = {
  'game-world': [],
  'mystery-lake': [
    'Camp Office',
    'Trapper’s Homestead',
    'Carter Hydro Dam',
    'Forestry Lookout',
  ],
  'coastal-highway': [
    'Quonset Garage',
    'Jackrabbit Island',
    'Fishing Camp',
    'Log Sort',
  ],
  'mountain-town': [
    'Orca Gas Station',
    'Paradise Meadows Farm',
    'St. Christopher’s Church',
    'Milton Basin',
  ],
  'pleasant-valley': [
    'Pleasant Valley Farmstead',
    'Thomson’s Crossing',
    'Signal Hill',
    'Misty Falls Picnic Area',
  ],
  'desolation-point': ['Hibernia Processing', 'Riken', 'No. 5 Abandoned Mine'],
  'timberwolf-mountain': [
    'Mountaineer’s Hut',
    'Crystal Lake',
    'Tail Section',
    'Echo Peak East',
  ],
  'ash-canyon': [
    'Gold Mine',
    'Miner’s Folly',
    'High Meadow',
    'Wolf’s Jaw Overlook',
  ],
  'forlorn-muskeg': [
    'Old Spence Family Homestead',
    'Poacher’s Camp',
    'Bunkhouses',
  ],
  'broken-railroad': [
    'Maintenance Yard',
    'Maintenance Shed',
    'Hunting Lodge',
    'Broken Bridge',
  ],
  'hushed-river-valley': [
    'Mysterious Signal Fire',
    'Stairsteps Lake',
    'Ice Caves',
    'Reclusive Falls',
  ],
  'bleak-inlet': [
    'Cannery',
    'Fallen Lighthouse',
    'Long Bridge',
    'Washed Out Trailers',
  ],
  blackrock: [
    'Blackrock Prison',
    'Power Plant',
    'Abandoned Mine',
    'Cook’s Farm',
  ],
  'transfer-pass': [],
  'forsaken-airfield': ['Main Hangar', 'Control Tower', 'Mindful Cabin'],
  'zone-of-contamination': ['Langston Mine', 'Concentrator'],
  'sundered-pass': ['Weather Station', 'Roamer’s Cave', 'Plane crash'],
  ravine: ['Railway trestle', 'Train cars', 'Lower ravine'],
  'winding-river-&-carter-hydro-dam': [
    'Upper Dam',
    'Lower Dam',
    'Winding River',
  ],
  'crumbling-highway': [],
  'keepers-pass': ['Keeper’s Pass North', 'Keeper’s Pass South'],
  'far-range-branch-line': [],
  'langston-mine': [],
  'transition-cave': [],
  'connections-between-regions': [],
};

export function mapHeading(id: string) {
  return id === 'game-world' ? 'The Long Dark maps' : `${mapName(id)} map`;
}

export function mapImageDescription(asset: MapAsset) {
  const match = Object.entries(maps).find(([, modes]) =>
    Object.values(modes).some((entry) => entry.src === asset.src),
  );
  if (!match) return 'Community map for The Long Dark';
  const [id, modes] = match;
  if (id === 'game-world')
    return 'The Long Dark world map showing Lower Great Bear and the Far Territory regions';
  const variant =
    modes.pilgrim.src === modes.interloper.src
      ? ''
      : asset.src === modes.interloper.src
        ? ' — Interloper variant'
        : ' — Pilgrim variant';
  const landmarks = mapLandmarks[id]?.slice(0, 3) ?? [];
  return `${mapHeading(id)} for The Long Dark${variant}${landmarks.length ? `, including ${landmarks.join(', ')}` : ''}`;
}
