import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config();

const db = new Database(process.env.DB_PATH || './data.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS stock_events (
  id TEXT PRIMARY KEY,
  water_name TEXT NOT NULL,
  county TEXT NOT NULL,
  species TEXT NOT NULL,
  quantity INTEGER,
  avg_length REAL,
  date_stocked TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'UT'
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expo_push_token TEXT NOT NULL UNIQUE,
  counties_json TEXT NOT NULL,
  species_json TEXT NOT NULL,
  waters_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  states_json TEXT NOT NULL DEFAULT '["UT"]'
);
CREATE TABLE IF NOT EXISTS poll_state (
  state TEXT PRIMARY KEY,
  last_success TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS state_requests (
  state_code TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  last_requested_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_push (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedup_key TEXT NOT NULL UNIQUE,
  expo_push_token TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

// Existing user databases are migrated in-place; never delete their history.
const eventColumns = db.prepare('PRAGMA table_info(stock_events)').all().map((row) => row.name);
if (!eventColumns.includes('state')) db.exec("ALTER TABLE stock_events ADD COLUMN state TEXT NOT NULL DEFAULT 'UT'");
const subscriptionColumns = db.prepare('PRAGMA table_info(subscriptions)').all().map((row) => row.name);
if (!subscriptionColumns.includes('states_json')) db.exec("ALTER TABLE subscriptions ADD COLUMN states_json TEXT NOT NULL DEFAULT '[\"UT\"]'");
// Older databases contain only Utah polling events; keep them assigned to UT.
db.exec('CREATE INDEX IF NOT EXISTS idx_events_state_date ON stock_events(state, date_stocked DESC)');

const parseArray = (value) => {
  try {
    const result = JSON.parse(value || '[]');
    return Array.isArray(result) ? result : [];
  } catch { return []; }
};

export function upsertSubscription({ expo_push_token, states, counties, species, waters }) {
  db.prepare(`
    INSERT INTO subscriptions (expo_push_token, states_json, counties_json, species_json, waters_json, created_at)
    VALUES (@expo_push_token, @states_json, @counties_json, @species_json, @waters_json, @created_at)
    ON CONFLICT(expo_push_token) DO UPDATE SET
      states_json=excluded.states_json,
      counties_json=excluded.counties_json,
      species_json=excluded.species_json,
      waters_json=excluded.waters_json
  `).run({
    expo_push_token,
    states_json: JSON.stringify(states ?? ['UT']),
    counties_json: JSON.stringify(counties ?? []),
    species_json: JSON.stringify(species ?? []),
    waters_json: JSON.stringify(waters ?? []),
    created_at: new Date().toISOString(),
  });
}

export function deleteSubscription(expo_push_token) {
  deleteSubscriptionQueues(expo_push_token);
  return db.prepare('DELETE FROM subscriptions WHERE expo_push_token = ?').run(expo_push_token).changes;
}

export function listSubscriptions() {
  return db.prepare('SELECT * FROM subscriptions').all().map((r) => ({
    id: r.id,
    expo_push_token: r.expo_push_token,
    states: parseArray(r.states_json),
    counties: parseArray(r.counties_json),
    species: parseArray(r.species_json),
    waters: parseArray(r.waters_json),
  }));
}

export function wasStatePolled(state) {
  return !!db.prepare('SELECT state FROM poll_state WHERE state = ?').get(state);
}
export function markStatePolled(state) {
  db.prepare(`INSERT INTO poll_state(state, last_success) VALUES (?, ?)
    ON CONFLICT(state) DO UPDATE SET last_success = excluded.last_success`).run(state, new Date().toISOString());
}

export function insertNewEvents(events, state = 'UT') {
  // RETURNING avoids the previous bug: selecting the last N rows could include old events.
  const insert = db.prepare(`INSERT OR IGNORE INTO stock_events
    (id, state, water_name, county, species, quantity, avg_length, date_stocked, first_seen_at)
    VALUES (@id, @state, @water_name, @county, @species, @quantity, @avg_length, @date_stocked, @first_seen_at)
    RETURNING *`);
  const tx = db.transaction((evs) => {
    const inserted = [];
    for (const e of evs) {
      if (!e.id || !e.water_name || !e.date_stocked) continue;
      const row = insert.get({
        id: String(e.id), state,
        water_name: String(e.water_name),
        county: String(e.county || 'UNKNOWN'),
        species: String(e.species || 'FISH'),
        quantity: e.quantity ?? null,
        avg_length: e.avg_length ?? null,
        date_stocked: String(e.date_stocked),
        first_seen_at: e.first_seen_at || new Date().toISOString(),
      });
      if (row) inserted.push(row);
    }
    return inserted;
  });
  const newOnes = tx(events);
  return { insertedCount: newOnes.length, newOnes };
}

export function getRecentEvents(limit = 50, state = 'UT') {
  return db.prepare(`SELECT * FROM stock_events WHERE state = ?
    ORDER BY date_stocked DESC, first_seen_at DESC LIMIT ?`).all(state, limit);
}

export function queueNotification(token, eventId, message) {
  db.prepare(`INSERT OR IGNORE INTO pending_push
      (dedup_key, expo_push_token, title, body, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(`${token}|${eventId}`, token,
    message.title, message.body, JSON.stringify(message.data), new Date().toISOString());
}
export function listPendingNotifications(limit = 300) {
  return db.prepare('SELECT * FROM pending_push ORDER BY id ASC LIMIT ?').all(limit).map((row) => ({
    queueId: row.id,
    to: row.expo_push_token,
    title: row.title,
    body: row.body,
    data: JSON.parse(row.data_json),
    sound: 'default', channelId: 'stocking-alerts',
  }));
}
export function markNotificationsAccepted(ids) {
  const deleteOne = db.prepare('DELETE FROM pending_push WHERE id = ?');
  db.transaction((values) => { for (const id of values) deleteOne.run(id); })(ids);
}
export function deleteSubscriptionQueues(token) {
  db.prepare('DELETE FROM pending_push WHERE expo_push_token = ?').run(token);
}

export function recordStateRequest(stateCode) {
  db.prepare(`INSERT INTO state_requests(state_code, request_count, last_requested_at)
    VALUES (?, 1, ?) ON CONFLICT(state_code) DO UPDATE SET
      request_count = request_count + 1, last_requested_at = excluded.last_requested_at`)
    .run(stateCode, new Date().toISOString());
}

export function listStateRequests() {
  return db.prepare('SELECT state_code, request_count, last_requested_at FROM state_requests ORDER BY request_count DESC, state_code').all();
}
