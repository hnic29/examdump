/**
 * Minimal synchronous SQL surface both storage engines must satisfy: the
 * subset of better-sqlite3's API this codebase actually uses. Desktop's
 * better-sqlite3 `Database` instance already satisfies this shape natively;
 * web's sql.js-backed adapter (apps/web/src/db/webSqlite.ts) implements it
 * explicitly. Every query module in this directory depends only on this
 * interface, never on a concrete engine.
 */
export interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteLike {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): unknown;
  pragma(source: string, options?: unknown): unknown;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
}

let _db: SqliteLike | null = null;

export function setDb(db: SqliteLike): void {
  _db = db;
}

export function getDb(): SqliteLike {
  if (!_db) throw new Error('Database not initialized. Call setDb() first.');
  return _db;
}
