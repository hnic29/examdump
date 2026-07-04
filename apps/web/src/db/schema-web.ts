import initSqlJs from 'sql.js';
// eslint-disable-next-line import/no-unresolved -- Vite's `?url` suffix import, typed via vite/client
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { FULL_FRESH_DDL } from '@shared/db/sql/schema.sql';
import { setDb } from '@shared/db/context';
import { WebSqliteAdapter, loadPersistedBytes } from './webSqlite';

let adapter: WebSqliteAdapter | null = null;

/** Loads a persisted database from IndexedDB, or creates a fresh one and runs the DDL once. */
export async function initWebDb(): Promise<WebSqliteAdapter> {
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const existing = await loadPersistedBytes();
  const db = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  if (!existing) db.run(FULL_FRESH_DDL);
  adapter = new WebSqliteAdapter(db);
  setDb(adapter);
  return adapter;
}

export function getWebDbAdapter(): WebSqliteAdapter {
  if (!adapter) throw new Error('Web database not initialized. Call initWebDb() first.');
  return adapter;
}
