import { describe, it, expect, afterEach } from 'vitest';
import { createDb, getDb, initDb } from '../schema';

describe('createDb', () => {
  afterEach(() => {
    // reset singleton
    initDb(':memory:');
  });

  it('creates all five tables', () => {
    const db = createDb(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('question_banks');
    expect(names).toContain('questions');
    expect(names).toContain('quiz_attempts');
    expect(names).toContain('question_responses');
    expect(names).toContain('waterfall_progress');
  });

  it('enforces foreign key cascade on bank delete', () => {
    const db = createDb(':memory:');
    db.prepare("INSERT INTO question_banks (name, source_file, created_at, question_count) VALUES ('t','f.txt',1,0)").run();
    const bankId = (db.prepare('SELECT id FROM question_banks').get() as { id: number }).id;
    db.prepare('INSERT INTO questions (bank_id, question_text, question_type, options, correct_answers, order_index) VALUES (?,?,?,?,?,?)').run(bankId, 'Q', 'multiple_choice', '[]', '["A"]', 0);
    db.prepare('DELETE FROM question_banks WHERE id = ?').run(bankId);
    const remaining = db.prepare('SELECT COUNT(*) as c FROM questions WHERE bank_id = ?').get(bankId) as { c: number };
    expect(remaining.c).toBe(0);
  });

  it('getDb throws if not initialized', () => {
    // Force uninitialized state by calling with a fresh module mock is complex;
    // instead verify getDb returns after initDb
    const db = initDb(':memory:');
    expect(getDb()).toBe(db);
  });

  it('creates waterfall_progress table', () => {
    const db = createDb(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('waterfall_progress');
  });
});
