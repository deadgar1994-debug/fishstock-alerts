import Database from "better-sqlite3";
import dotenv from "dotenv";
dotenv.config();

const db = new Database(process.env.DB_PATH || "./data.sqlite");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS stock_events (
  id TEXT PRIMARY KEY,
  water_name TEXT NOT NULL,
  county TEXT NOT NULL,
  species TEXT NOT NULL,
  quantity INTEGER,
  avg_length REAL,
  date_stocked TEXT NOT NULL,
  first_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expo_push_token TEXT NOT NULL UNIQUE,
  counties_json TEXT NOT NULL,
  species_json TEXT NOT NULL,
  waters_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

export function upsertSubscription({ expo_push_token, counties, species, waters }) {
  const stmt = db.prepare(`
    INSERT INTO subscriptions (expo_push_token, counties_json, species_json, waters_json, created_at)
    VALUES (@expo_push_token, @counties_json, @species_json, @waters_json, @created_at)
    ON CONFLICT(expo_push_token) DO UPDATE SET
      counties_json=excluded.counties_json,
      species_json=excluded.species_json,
      waters_json=excluded.waters_json
  `);

  stmt.run({
    expo_push_token,
    counties_json: JSON.stringify(counties ?? []),
    species_json: JSON.stringify(species ?? []),
    waters_json: JSON.stringify(waters ?? []),
    created_at: new Date().toISOString(),
  });
}

export function listSubscriptions() {
  const rows = db.prepare(`SELECT * FROM subscriptions`).all();
  return rows.map((r) => ({
    id: r.id,
    expo_push_token: r.expo_push_token,
    counties: safeJson(r.counties_json),
    species: safeJson(r.species_json),
    waters: safeJson(r.waters_json),
  }));
}

export function insertNewEvents(events) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO stock_events
      (id, water_name, county, species, quantity, avg_length, date_stocked, first_seen_at)
    VALUES
      (@id, @water_name, @county, @species, @quantity, @avg_length, @date_stocked, @first_seen_at)
  `);

  const tx = db.transaction((evs) => {
    let inserted = 0;
    for (const e of evs) {
      const info = insert.run(e);
      if (info.changes > 0) inserted += 1;
    }
    return inserted;
  });

  const insertedCount = tx(events);
  const newOnes = db
    .prepare(`SELECT * FROM stock_events ORDER BY first_seen_at DESC LIMIT ?`)
    .all(insertedCount);

  return { insertedCount, newOnes };
}

export function getRecentEvents(limit = 50) {
  return db
    .prepare(`SELECT * FROM stock_events ORDER BY date_stocked DESC, first_seen_at DESC LIMIT ?`)
    .all(limit);
}

function safeJson(s) {
  try { return JSON.parse(s || "[]"); } catch { return []; }
}
