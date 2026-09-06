import type { Database } from 'bun:sqlite';
import { CHAT_RETENTION_MS } from '../lib/chat';

/** Remove expired content and its dependent records as one transaction. */
export function pruneChatMessages(db: Database, now = Date.now()) {
  return db.transaction(() => {
    const cutoff = now - CHAT_RETENTION_MS;
    db.run(
      'DELETE FROM chat_flags WHERE message_id IN (SELECT id FROM chat_messages WHERE created_at<=?)',
      [cutoff],
    );
    db.run('DELETE FROM chat_messages WHERE created_at<=?', [cutoff]);
    // SQLite changes() excludes cascaded reaction deletions from this count.
    const { changes } = db.query('SELECT changes() AS changes').get() as {
      changes: number;
    };
    if (changes) db.run('UPDATE chat_meta SET revision=revision+1 WHERE id=1');
    return changes;
  })();
}
