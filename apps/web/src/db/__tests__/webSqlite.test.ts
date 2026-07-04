import { describe, it, expect } from 'vitest';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { WebSqliteAdapter, loadPersistedBytes } from '../webSqlite';
import { FULL_FRESH_DDL } from '@shared/db/sql/schema.sql';

async function freshDb(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(FULL_FRESH_DDL);
  return db;
}

describe('WebSqliteAdapter', () => {
  it('supports prepare().run/get/all against the shared DDL', async () => {
    const db = await freshDb();
    const adapter = new WebSqliteAdapter(db);
    const insert = adapter.prepare(
      'INSERT INTO question_banks (name, source_file, created_at, question_count) VALUES (?,?,?,0)'
    );
    const result = insert.run('Net+', 'net.pdf', 1234);
    expect(result.changes).toBe(1);
    expect(typeof result.lastInsertRowid).toBe('number');

    const row = adapter.prepare('SELECT * FROM question_banks WHERE id = ?').get(result.lastInsertRowid) as { name: string };
    expect(row.name).toBe('Net+');

    const rows = adapter.prepare('SELECT * FROM question_banks').all();
    expect(rows).toHaveLength(1);
  });

  it('round-trips through export()/rehydrate — the core durability mechanism', async () => {
    const db = await freshDb();
    const adapter = new WebSqliteAdapter(db);
    adapter
      .prepare('INSERT INTO question_banks (name, source_file, created_at, question_count) VALUES (?,?,?,0)')
      .run('Persisted', 'p.pdf', 1);

    const bytes = db.export();
    const SQL = await initSqlJs();
    const reloaded = new SQL.Database(bytes);
    const stmt = reloaded.prepare('SELECT name FROM question_banks');
    expect(stmt.step()).toBe(true);
    const row = stmt.getAsObject() as { name: string };
    expect(row.name).toBe('Persisted');
  });

  it('rolls back a transaction on throw', async () => {
    const db = await freshDb();
    const adapter = new WebSqliteAdapter(db);
    const insertThenThrow = () => {
      adapter
        .prepare('INSERT INTO question_banks (name, source_file, created_at, question_count) VALUES (?,?,?,0)')
        .run('A', 'a.pdf', 1);
      throw new Error('boom');
    };
    const txn = adapter.transaction(insertThenThrow);
    expect(() => txn()).toThrow('boom');
    expect(adapter.prepare('SELECT * FROM question_banks').all()).toHaveLength(0);
  });

  it('commits a transaction that does not throw', async () => {
    const db = await freshDb();
    const adapter = new WebSqliteAdapter(db);
    const txn = adapter.transaction(() => {
      adapter
        .prepare('INSERT INTO question_banks (name, source_file, created_at, question_count) VALUES (?,?,?,0)')
        .run('A', 'a.pdf', 1);
    });
    txn();
    expect(adapter.prepare('SELECT * FROM question_banks').all()).toHaveLength(1);
  });

  it('an explicit flushNow persists to IndexedDB immediately, without waiting for the debounce', async () => {
    const db = await freshDb();
    const adapter = new WebSqliteAdapter(db);
    adapter
      .prepare('INSERT INTO question_banks (name, source_file, created_at, question_count) VALUES (?,?,?,0)')
      .run('A', 'a.pdf', 1);
    await adapter.flushNow();
    const persisted = await loadPersistedBytes();
    expect(persisted).toBeDefined();
    expect(persisted!.byteLength).toBeGreaterThan(0);
  });
});
