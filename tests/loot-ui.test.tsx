import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LootLibrary, RegionLoot } from '../components/loot';
import { createRun, loot } from '../lib/model';
const noop = () => {};

test('regional loot appears only for Interloper and Misery', () => {
  for (const difficulty of [
    'Interloper',
    'Misery',
    'Pilgrim',
    'Voyageur',
    'Stalker',
    'Custom',
  ] as const) {
    const run = createRun('My run', difficulty);
    const markup = renderToStaticMarkup(
      <RegionLoot run={run} onUpdate={noop} onLibrary={noop} />,
    );
    expect(markup.includes('regional-loot-item')).toBe(
      ['Interloper', 'Misery'].includes(difficulty),
    );
  }
});

test('the full loot page remains available to other difficulties', () => {
  const markup = renderToStaticMarkup(
    <LootLibrary
      run={createRun('My run', 'Pilgrim')}
      onUpdate={noop}
      onRegion={noop}
    />,
  );
  expect(markup).toContain('Interloper loot tables');
  expect(markup).toContain('Comments: Bleak Inlet');
});

test('collapsed regions retain an expand control without rendering their spawns', () => {
  const run = createRun();
  run.lootSets = [4];
  const render = () =>
    renderToStaticMarkup(
      <LootLibrary run={run} onUpdate={noop} onRegion={noop} />,
    );
  expect(render()).toContain('Cross out Cannery, inside');
  run.collapsedLootRegions = ['Bleak Inlet'];
  const markup = render();
  expect(markup).toContain('Expand Bleak Inlet');
  expect(markup).toContain('Prybar available in Bleak Inlet');
  expect(markup).toContain('No Hammer listed in Bleak Inlet');
  expect(markup).not.toContain('Cross out Cannery, inside');
  expect(markup).toContain('Collapse Mystery Lake');
});

test('collapsed loot availability follows selected sets even after spawns are crossed out', () => {
  const run = createRun();
  run.collapsedLootRegions = ['Bleak Inlet'];
  run.lootSets = [4];
  run.dismissedLoot = loot.map((entry) => entry.id);
  expect(
    renderToStaticMarkup(
      <LootLibrary run={run} onUpdate={noop} onRegion={noop} />,
    ),
  ).toContain('Prybar available in Bleak Inlet');
  run.lootSets = [];
  const markup = renderToStaticMarkup(
    <LootLibrary run={run} onUpdate={noop} onRegion={noop} />,
  );
  expect(markup).toContain('No Prybar listed in Bleak Inlet');
  expect(markup).not.toContain('Prybar available in Bleak Inlet');
});
