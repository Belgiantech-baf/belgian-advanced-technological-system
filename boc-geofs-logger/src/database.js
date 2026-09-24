import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const schema = `
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL,
  callsign TEXT,
  uid TEXT,
  aircraft_id TEXT,
  message TEXT NOT NULL,
  server TEXT NOT NULL,
  created_at TEXT NOT NULL,
  moderation_flagged INTEGER NOT NULL DEFAULT 0,
  moderation_reason TEXT,
  moderation_reviewed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_callsign ON chat_messages(callsign);
CREATE INDEX IF NOT EXISTS idx_chat_uid ON chat_messages(uid);
CREATE INDEX IF NOT EXISTS idx_chat_message ON chat_messages(message);
CREATE INDEX IF NOT EXISTS idx_chat_dedupe ON chat_messages(dedupe_key);
`;

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(schema);
  return db;
}

function rowToMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    timestamp: row.timestamp,
    callsign: row.callsign,
    uid: row.uid,
    aircraftId: row.aircraft_id,
    message: row.message,
    server: row.server,
    createdAt: row.created_at,
    moderation: {
      flagged: Boolean(row.moderation_flagged),
      reason: row.moderation_reason,
      reviewed: Boolean(row.moderation_reviewed),
    },
  };
}

export function createRepository(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO chat_messages
      (source_id, dedupe_key, timestamp, callsign, uid, aircraft_id, message, server, created_at)
    VALUES (@sourceId, @dedupeKey, @timestamp, @callsign, @uid, @aircraftId, @message, @server, @createdAt)
  `);
  const insertMany = (messages) => {
    db.exec('BEGIN');
    try {
      const results = messages.map((message) => insert.run(message));
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const count = db.prepare('SELECT COUNT(*) AS count FROM chat_messages');
  const last = db.prepare('SELECT timestamp FROM chat_messages ORDER BY id DESC LIMIT 1');

  return {
    insertMany(messages) {
      const results = insertMany(messages);
      return {
        count: results.reduce((total, result) => total + Number(result.changes), 0),
        keys: messages.filter((_message, index) => Number(results[index].changes) > 0).map((message) => message.dedupeKey),
      };
    },
    list({ limit, offset = 0, q, callsign, uid, from, to }) {
      const where = [];
      const params = {};
      if (q) {
        where.push('(message LIKE @q OR callsign LIKE @q OR uid LIKE @q)');
        params.q = `%${q}%`;
      }
      if (callsign) { where.push('callsign = @callsign'); params.callsign = callsign; }
      if (uid) { where.push('uid = @uid'); params.uid = uid; }
      if (from) { where.push('timestamp >= @from'); params.from = from; }
      if (to) { where.push('timestamp <= @to'); params.to = to; }
      params.limit = limit;
      params.offset = offset;
      const sql = `SELECT * FROM chat_messages ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY timestamp DESC, id DESC LIMIT @limit OFFSET @offset`;
      return db.prepare(sql).all(params).map(rowToMessage);
    },
    get(id) {
      return rowToMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id));
    },
    updateModeration(id, moderation) {
      const result = db.prepare(`
        UPDATE chat_messages
        SET moderation_flagged = @flagged,
            moderation_reason = @reason,
            moderation_reviewed = @reviewed
        WHERE id = @id
      `).run({ id, flagged: moderation.flagged ? 1 : 0, reason: moderation.reason ?? null, reviewed: moderation.reviewed ? 1 : 0 });
      return result.changes ? this.get(id) : null;
    },
    stats() {
      return { messagesLogged: count.get().count, lastMessage: last.get()?.timestamp ?? null };
    },
  };
}
