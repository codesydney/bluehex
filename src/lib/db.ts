import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Location of the SQLite file. Override with DATABASE_PATH in the environment.
const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), "data", "bluehex.db");

// Reuse a single connection across hot-reloads in development. Next.js clears
// module state on each reload, so we stash the instance on globalThis.
const globalForDb = globalThis as unknown as { db?: Database.Database };

function createConnection(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

// Minimal, idempotent schema. Grow this as the app gains real tables.
function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.prepare(
    `INSERT OR IGNORE INTO site_meta (key, value) VALUES (?, ?)`,
  ).run("tagline", "The Claude consulting arm of Code.Sydney Pty Ltd.");
}

export const db: Database.Database = globalForDb.db ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
