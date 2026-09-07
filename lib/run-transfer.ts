import { z } from 'zod';
import { atlasSchema, runSchema, type AtlasState, type Run } from './model';
import { regionIds } from './routes';

export const MAX_RUN_FILE_BYTES = 10 * 1024 * 1024;
const fileSchema = z
  .object({
    format: z.literal('tld-atlas-run'),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    run: runSchema,
  })
  .strict();

export function exportRun(run: Run) {
  const content = JSON.stringify(
    {
      format: 'tld-atlas-run',
      version: 1,
      exportedAt: new Date().toISOString(),
      run: runSchema.parse(run),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(content).length > MAX_RUN_FILE_BYTES)
    throw new Error('This run is too large to export (10 MB maximum).');
  const name =
    run.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
  return {
    content,
    filename: `${name}-${new Date().toISOString().slice(0, 10)}.tld-run.json`,
  };
}

export function parseRunFile(content: string): Run {
  if (new TextEncoder().encode(content).length > MAX_RUN_FILE_BYTES)
    throw new Error('Choose a run file smaller than 10 MB.');
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(
      'This file is not valid JSON. Choose an exported run file.',
    );
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    value.format === 'tld-atlas-run' &&
    'version' in value &&
    value.version !== 1
  )
    throw new Error(
      'This run file uses a newer or unsupported format. Update the app before importing it.',
    );
  const result = fileSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      'This is not a valid run export, or it contains unsupported run data.',
    );
  if (
    result.data.run.selectedMap !== 'game-world' &&
    !regionIds.includes(result.data.run.selectedMap)
  )
    throw new Error(
      'This run uses a map unavailable in this app version. Update the app before importing it.',
    );
  return { ...result.data.run, id: crypto.randomUUID() };
}

export function addImportedRun(state: AtlasState, imported: Run): AtlasState {
  if (state.runs.length >= 100)
    throw new Error(
      'You already have 100 runs. Remove a run before importing another.',
    );
  const names = new Set(state.runs.map((run) => run.name));
  let name = imported.name;
  for (let i = 1; names.has(name); i++) {
    const suffix = i === 1 ? ' (imported)' : ` (imported ${i})`;
    name = imported.name.slice(0, 60 - suffix.length).trimEnd() + suffix;
  }
  // A copy is always added; importing never replaces an existing journal.
  const run = { ...imported, name };
  const next = atlasSchema.parse({
    ...state,
    activeRunId: run.id,
    runs: [...state.runs, run],
  });
  if (
    new TextEncoder().encode(JSON.stringify(next)).length > MAX_RUN_FILE_BYTES
  )
    throw new Error(
      'These runs would exceed the journal size limit. Export and remove an older run first.',
    );
  return next;
}
