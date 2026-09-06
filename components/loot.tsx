'use client';
import {
  BedDouble,
  Flame,
  Axe,
  Hammer,
  Lamp,
  Search,
  Wrench,
  MessageSquare,
  Package,
  ChevronDown,
  RotateCcw,
  ChevronRight,
  Check,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  blankLootComments,
  candidateSets,
  excludedAlternative,
  loot,
  lootGroups,
  lootItems,
  lootRegions,
  manualLootSets,
  regionToMap,
  selectedLootSets,
  toggleLootDiscovery,
  toggleLootDismissed,
  type LootEntry,
  type LootGroup,
  type Run,
} from '@/lib/model';

export const itemIcons: Record<string, typeof Flame> = {
  Bedroll: BedDouble,
  Firestriker: Flame,
  Hacksaw: Axe,
  Hammer,
  Lantern: Lamp,
  'Mag lens': Search,
  Prybar: Wrench,
};
type UpdateRun = (patch: Partial<Run>) => void;
type CommentSource = {
  sheet: string;
  cell: string;
  note: string;
  community: boolean;
};
function LootComments({
  sources,
  label,
}: {
  sources: CommentSource[];
  label: string;
}) {
  const notes = sources.filter((source) => source.note);
  if (!notes.length) return null;
  // Keep all source references while showing identical comments only once.
  const grouped = new Map<string, CommentSource[]>();
  for (const note of notes) {
    const key = `${note.community}:${note.note}`;
    grouped.set(key, [...(grouped.get(key) ?? []), note]);
  }
  return (
    <Popover>
      <PopoverTrigger
        className="loot-comment-button"
        aria-label={`Comments: ${label}`}
        title="Read workbook comments"
      >
        <MessageSquare size={13} />
      </PopoverTrigger>
      <PopoverContent className="loot-comment-popover" align="end">
        <PopoverTitle className="sr-only">Notes</PopoverTitle>
        {[...grouped.entries()].map(([key, items]) => (
          <section className="loot-comment" key={key}>
            <p>
              <span>
                {items[0].community ? 'Community comment' : 'Location note'}:
              </span>{' '}
              {items[0].note}
            </p>
          </section>
        ))}
      </PopoverContent>
    </Popover>
  );
}
export function LootSetPicker({
  run,
  onUpdate,
}: {
  run: Run;
  onUpdate: UpdateRun;
}) {
  const sets = selectedLootSets(run),
    possible = candidateSets(run.discoveries),
    manual = manualLootSets(run);
  return (
    <fieldset className="loot-set-picker">
      <legend className="sr-only">Visible loot sets</legend>
      <span>Set</span>
      <div className="set-choices">
        {[1, 2, 3, 4].map((set) => (
          <button
            key={set}
            aria-label={`Set ${set}`}
            aria-pressed={sets.includes(set)}
            disabled={!possible.includes(set)}
            title={
              !possible.includes(set)
                ? 'Ruled out by your loot discoveries'
                : undefined
            }
            className={sets.includes(set) ? 'chosen' : 'excluded'}
            onClick={() => {
              const next = manual.includes(set)
                ? manual.filter((value) => value !== set)
                : [...manual, set].sort((a, b) => a - b);
              onUpdate({
                lootSets: next,
                lootSet: next.length === 1 ? next[0] : null,
              });
            }}
          >
            {set}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
function SpawnLocation({
  entry,
  group,
  run,
  onUpdate,
}: {
  entry: LootEntry;
  group: LootGroup;
  run: Run;
  onUpdate: UpdateRun;
}) {
  const found = run.discoveries.includes(entry.id),
    automatic = excludedAlternative(run, entry.id, group),
    crossed = automatic || run.dismissedLoot.includes(entry.id);
  return (
    <li
      className={`spawn-location ${found ? 'spawn-found' : ''} ${crossed ? 'spawn-dismissed' : ''}`}
    >
      <button
        className="spawn-name"
        aria-pressed={crossed}
        aria-label={`${crossed ? 'Restore' : 'Cross out'} ${entry.location}`}
        title={
          automatic
            ? 'Another location in this group was found. Click to clear that find and restore these alternatives.'
            : undefined
        }
        onClick={() => onUpdate(toggleLootDismissed(run, entry.id, group))}
      >
        {entry.location}
      </button>
      <LootComments
        sources={entry.sources.filter((source) =>
          group.sets.includes(Number(source.sheet.slice(-1))),
        )}
        label={`${entry.item} · ${entry.location}`}
      />
      <Checkbox
        className="spawn-checkbox"
        checked={found}
        aria-label={`${found ? 'Unmark' : 'Mark'} ${entry.item} at ${entry.location} as found`}
        onCheckedChange={() =>
          onUpdate(toggleLootDiscovery(run, entry.id, group))
        }
      />
    </li>
  );
}
function LootCell({
  region,
  item,
  run,
  onUpdate,
  locationFilter,
}: {
  region: string;
  item: string;
  run: Run;
  onUpdate: UpdateRun;
  locationFilter?: string;
}) {
  const sets = selectedLootSets(run),
    groups = lootGroups(region, item, sets).filter(
      (group) =>
        !locationFilter ||
        group.entries.some(
          (id) =>
            loot.find((entry) => entry.id === id)?.location === locationFilter,
        ),
    );
  const comments = blankLootComments.filter(
    (comment) =>
      !locationFilter &&
      comment.region === region &&
      comment.item === item &&
      sets.includes(comment.set),
  );
  return (
    <div className="loot-cell-groups">
      {groups.map((group) => (
        <div className="spawn-group" key={group.id}>
          {sets.length > 1 && (
            <small className="spawn-group-sets">
              Set {group.sets.join(' · ')}
            </small>
          )}
          <ul className="spawn-locations">
            {group.entries.map((id) => {
              const entry = loot.find((entry) => entry.id === id)!;
              if (locationFilter && entry.location !== locationFilter)
                return null;
              return (
                <SpawnLocation
                  key={id}
                  entry={entry}
                  group={group}
                  run={run}
                  onUpdate={onUpdate}
                />
              );
            })}
          </ul>
        </div>
      ))}
      {!!comments.length && (
        <div className="blank-cell-comments">
          <LootComments sources={comments} label={`${region} · ${item}`} />
        </div>
      )}
      {!groups.length && !comments.length && (
        <span className="grid-empty" aria-label="No listed locations">
          —
        </span>
      )}
    </div>
  );
}
export function RegionLoot({
  run,
  onUpdate,
  onLibrary,
}: {
  run: Run;
  onUpdate: UpdateRun;
  onLibrary: () => void;
}) {
  if (!['Interloper', 'Misery'].includes(run.difficulty)) return null;
  const region =
    lootRegions.find((region) => regionToMap(region) === run.selectedMap) ??
    (run.selectedMap === 'langston-mine' ? 'Zone of Contamination' : null);
  const sets = selectedLootSets(run),
    locationFilter =
      run.selectedMap === 'langston-mine' ? 'Langston Mine' : undefined;
  const items = region
    ? lootItems.filter(
        (item) =>
          lootGroups(region, item, sets).some(
            (group) =>
              !locationFilter ||
              group.entries.some(
                (id) =>
                  loot.find((entry) => entry.id === id)?.location ===
                  locationFilter,
              ),
          ) ||
          (!locationFilter &&
            blankLootComments.some(
              (comment) =>
                comment.region === region &&
                comment.item === item &&
                sets.includes(comment.set),
            )),
      )
    : [];
  return (
    <div className="regional-loot">
      {region &&
        items.map((item) => {
          const Icon = itemIcons[item] ?? Package;
          return (
            <article className="regional-loot-item" key={item}>
              <h3>
                <Icon size={16} />
                {item}
              </h3>
              <LootCell
                region={region}
                item={item}
                run={run}
                onUpdate={onUpdate}
                locationFilter={locationFilter}
              />
            </article>
          );
        })}
      {!sets.length && (
        <p className="inline-help">
          Select a set on the loot tables page to show locations.
        </p>
      )}
      <button className="text-button all-loot-link" onClick={onLibrary}>
        Loot tables
      </button>
    </div>
  );
}
export function LootLibrary({
  run,
  onUpdate,
}: {
  run: Run;
  onUpdate: UpdateRun;
  onRegion: (region: string) => void;
}) {
  const collapsedRegions = run.collapsedLootRegions ?? [];
  return (
    <main className="library loot-library">
      <header className="loot-library-heading">
        <div className="loot-library-title">
          <h1>Interloper loot tables</h1>
          <button
            className="loot-reset"
            aria-label="Reset loot table checkboxes"
            title="Uncheck all loot in this run"
            disabled={!run.discoveries.length}
            onClick={() => onUpdate({ discoveries: [] })}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
        <LootSetPicker run={run} onUpdate={onUpdate} />
      </header>
      {/* Keyboard focus lets users scroll the data table with arrow keys. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
      <section
        className="loot-grid-scroll"
        aria-label="Loot by region and item; scroll for more locations"
        tabIndex={0}
      >
        <Table className="loot-grid">
          <caption className="sr-only">
            Loot locations. Regions are rows and item types are columns.
            Dividers separate independent spawns. Click a location to cross it
            out, tick a checkbox to record a find, or open its comment icon.
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Region</TableHead>
              {lootItems.map((item) => {
                const Icon = itemIcons[item] ?? Package;
                return (
                  <TableHead scope="col" key={item}>
                    <span className="gear-heading">
                      <Icon size={16} />
                      {item}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lootRegions.map((region) => {
              const collapsed = collapsedRegions.includes(region);
              const prefix = `loot-${regionToMap(region)}`;
              return (
                <TableRow
                  key={region}
                  className={collapsed ? 'region-collapsed' : ''}
                >
                  <TableHead scope="row">
                    <div className="loot-region-heading">
                      <button
                        className="region-collapse-toggle grid-region-link"
                        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${region}`}
                        aria-expanded={!collapsed}
                        aria-controls={lootItems
                          .map((_, index) => `${prefix}-${index}`)
                          .join(' ')}
                        onClick={() =>
                          onUpdate({
                            collapsedLootRegions: collapsed
                              ? collapsedRegions.filter(
                                  (name) => name !== region,
                                )
                              : [...collapsedRegions, region],
                          })
                        }
                      >
                        {collapsed ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                        <span>{region}</span>
                      </button>
                    </div>
                  </TableHead>
                  {lootItems.map((item, index) => (
                    <TableCell key={item} id={`${prefix}-${index}`}>
                      {collapsed ? (
                        lootGroups(region, item, selectedLootSets(run)).length >
                        0 ? (
                          <Check
                            size={15}
                            className="loot-available"
                            aria-label={`${item} available in ${region}`}
                          />
                        ) : (
                          <span
                            className="loot-unavailable"
                            aria-label={`No ${item} listed in ${region}`}
                          >
                            —
                          </span>
                        )
                      ) : (
                        <LootCell
                          region={region}
                          item={item}
                          run={run}
                          onUpdate={onUpdate}
                        />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
      {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
    </main>
  );
}
