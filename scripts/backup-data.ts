import { Database } from 'bun:sqlite';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { resolve } from 'node:path';

const destination = process.argv[2];
if (!destination)
  throw new Error('Usage: bun scripts/backup-data.ts <new-backup-directory>');
const source = process.env.TLD_DATA_DIR ?? '.data';
const secret =
  process.env.BETTER_AUTH_SECRET ??
  readFileSync(`${source}/auth-secret`, 'utf8');
const output = resolve(destination);
mkdirSync(output, { mode: 0o700 });
const db = new Database(`${source}/atlas.sqlite`, { readonly: true });
try {
  db.run('PRAGMA busy_timeout = 5000');
  db.run('VACUUM INTO ?', [`${output}/atlas.sqlite`]);
  chmodSync(`${output}/atlas.sqlite`, 0o600);
  writeFileSync(`${output}/auth-secret`, secret, { mode: 0o600, flag: 'wx' });
  if (existsSync(`${source}/recovery-secrets.json`))
    writeFileSync(
      `${output}/recovery-secrets.json`,
      readFileSync(`${source}/recovery-secrets.json`),
      { mode: 0o600, flag: 'wx' },
    );
  console.log(
    `Private database snapshot and matching auth secret saved to ${output}`,
  );
} finally {
  db.close();
}
