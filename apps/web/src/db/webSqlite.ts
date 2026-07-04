import type { Database as SqlJsDatabase, BindParams } from 'sql.js';
import { get, set } from 'idb-keyval';
import type { SqliteLike, SqliteStatement } from '@shared/db/context';

function toBindParams(params: unknown[]): BindParams {
  return params as unknown as BindParams;
}

const DB_KEY = 'examdump-db-v1';
const FLUSH_DEBOUNCE_MS = 300;

/**
 * Adapts a sql.js in-memory database to the SqliteLike surface the shared
 * db/*.ts query modules expect, and persists it to IndexedDB so data
 * survives a reload. Every module in this codebase only ever calls
 * `prepare(sql).run/get/all(...params)` exactly once per prepared
 * statement (never re-executes a stored handle), so each call here does a
 * fresh sql.js prepare/bind/step/free cycle rather than trying to keep a
 * long-lived statement handle around.
 */
export class WebSqliteAdapter implements SqliteLike {
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly db: SqlJsDatabase) {}

  prepare(sql: string): SqliteStatement {
    const run = (...params: unknown[]) => {
      const stmt = this.db.prepare(sql);
      try {
        stmt.bind(toBindParams(params));
        stmt.step();
      } finally {
        stmt.free();
      }
      const changes = this.db.getRowsModified();
      const idRow = this.db.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowid = (idRow[0]?.values[0]?.[0] as number) ?? 0;
      this.scheduleFlush();
      return { changes, lastInsertRowid };
    };

    const get = (...params: unknown[]): unknown => {
      const stmt = this.db.prepare(sql);
      try {
        stmt.bind(toBindParams(params));
        return stmt.step() ? stmt.getAsObject() : undefined;
      } finally {
        stmt.free();
      }
    };

    const all = (...params: unknown[]): unknown[] => {
      const stmt = this.db.prepare(sql);
      const rows: unknown[] = [];
      try {
        stmt.bind(toBindParams(params));
        while (stmt.step()) rows.push(stmt.getAsObject());
      } finally {
        stmt.free();
      }
      return rows;
    };

    return { run, get, all };
  }

  exec(sql: string): unknown {
    const result = this.db.run(sql);
    this.scheduleFlush();
    return result;
  }

  pragma(source: string): unknown {
    return this.db.run(`PRAGMA ${source}`);
  }

  transaction<T extends (...args: never[]) => unknown>(fn: T): T {
    const wrapped = ((...args: unknown[]) => {
      this.db.run('BEGIN');
      try {
        const result = fn(...(args as never[]));
        this.db.run('COMMIT');
        this.scheduleFlush();
        return result;
      } catch (e) {
        this.db.run('ROLLBACK');
        throw e;
      }
    }) as T;
    return wrapped;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => { this.flushNow(); }, FLUSH_DEBOUNCE_MS);
  }

  /**
   * Persists the database to IndexedDB immediately, bypassing the debounce.
   * Call this after any operation that must never be lost (completed
   * attempts, imports, edits) and on visibilitychange/beforeunload — the
   * debounce alone only bounds worst-case loss to an in-progress unsubmitted
   * answer, never a completed attempt.
   */
  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await set(DB_KEY, this.db.export());
  }
}

export async function loadPersistedBytes(): Promise<Uint8Array | undefined> {
  return get(DB_KEY);
}
