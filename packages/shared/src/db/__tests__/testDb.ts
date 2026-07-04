import Database from 'better-sqlite3';
import { FULL_FRESH_DDL } from '../sql/schema.sql';
import { setDb } from '../context';

/**
 * Builds a throwaway in-memory SqliteLike database for unit tests, using
 * better-sqlite3 purely as a convenient concrete engine — the code under
 * test only ever depends on the SqliteLike interface, never on this engine.
 */
export function initTestDb(): void {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(FULL_FRESH_DDL);
  setDb(db);
}
