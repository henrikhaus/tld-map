import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { CHAT_RETENTION_MS } from '../lib/chat';
import { pruneChatMessages } from '../server/chat-retention';

test('48-hour expiry deletes messages and dependent content, retaining identities and restrictions', () => {
  const db = new Database(':memory:');
  try {
    db.run('PRAGMA foreign_keys=ON');
    db.run('CREATE TABLE user (id TEXT PRIMARY KEY)');
    db.run(
      readFileSync(
        new URL('../server/migrations/002-chat.sql', import.meta.url),
        'utf8',
      ),
    );
    db.run(
      readFileSync(
        new URL('../server/migrations/003-chat-retention.sql', import.meta.url),
        'utf8',
      ),
    );
    const now = 1_800_000_000_000;
    db.run(
      "INSERT INTO chat_people(id,guest_name,color,created_at) VALUES ('guest','Anonymous12345','#83a9cc',?)",
      [now - CHAT_RETENTION_MS],
    );
    db.run(
      "INSERT INTO chat_restrictions(person_id,kind,reason) VALUES ('guest','ban','Spam')",
    );
    for (const [id, age] of [
      [1, CHAT_RETENTION_MS + 1],
      [2, CHAT_RETENTION_MS],
      [3, CHAT_RETENTION_MS - 1],
    ]) {
      db.run(
        "INSERT INTO chat_messages(id,person_id,nonce,body,normalized,created_at) VALUES (?,'guest',?,'Test message','test',?)",
        [id, String(id), now - age],
      );
      db.run("INSERT INTO chat_reactions VALUES (?,'guest','👍')", [id]);
      db.run(
        "INSERT INTO chat_flags(message_id,person_id,reason) VALUES (?,'guest','spam')",
        [id],
      );
    }
    expect(pruneChatMessages(db, now)).toBe(2);
    expect(db.query('SELECT id FROM chat_messages').all()).toEqual([{ id: 3 }]);
    expect(db.query('SELECT message_id FROM chat_reactions').all()).toEqual([
      { message_id: 3 },
    ]);
    expect(db.query('SELECT message_id FROM chat_flags').all()).toEqual([
      { message_id: 3 },
    ]);
    expect(db.query('SELECT id FROM chat_people').all()).toEqual([
      { id: 'guest' },
    ]);
    expect(db.query('SELECT kind FROM chat_restrictions').get()).toEqual({
      kind: 'ban',
    });
    expect(db.query('SELECT revision FROM chat_meta').get()).toEqual({
      revision: 1,
    });
    expect(pruneChatMessages(db, now)).toBe(0);
    expect(db.query('SELECT revision FROM chat_meta').get()).toEqual({
      revision: 1,
    });
    expect(pruneChatMessages(db, now + 1)).toBe(1);
    expect(db.query('SELECT id FROM chat_messages').all()).toEqual([]);
  } finally {
    db.close();
  }
});
