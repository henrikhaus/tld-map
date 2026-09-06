import { Database } from 'bun:sqlite';
const username = process.argv[2];
if (!username)
  throw new Error('Usage: bun scripts/grant-admin.ts <existing-username>');
const db = new Database(`${process.env.TLD_DATA_DIR ?? '.data'}/atlas.sqlite`);
db.run('PRAGMA foreign_keys = ON');
const user = db
  .query('SELECT id,username FROM user WHERE lower(username)=lower(?)')
  .get(username) as { id: string; username: string } | null;
if (!user)
  throw new Error(
    'Create this account in the site first. No admin access was granted.',
  );
if (
  !db
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='site_admin'",
    )
    .get()
)
  throw new Error('Start the API once to apply the admin migration.');
db.run(
  'INSERT INTO site_admin(singleton,user_id) VALUES (1,?) ON CONFLICT(singleton) DO UPDATE SET user_id=excluded.user_id',
  [user.id],
);
if (
  db
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chat_meta'",
    )
    .get()
)
  db.run('UPDATE chat_meta SET revision=revision+1 WHERE id=1');
console.log(
  `Admin access granted to ${user.username}. Access is tied to this account ID, not its username.`,
);
db.close();
