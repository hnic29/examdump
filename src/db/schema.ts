import Database from 'better-sqlite3';

let _db: Database.Database | null = null;

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function initDb(dbPath: string): Database.Database {
  _db = createDb(dbPath);
  return _db;
}

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.');
  return _db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_file TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      question_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice','true_false','multi_select')),
      options TEXT NOT NULL,
      correct_answers TEXT NOT NULL,
      explanation TEXT,
      links TEXT,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      timed_mode TEXT NOT NULL CHECK(timed_mode IN ('none','total','per_question','both')),
      total_time_limit INTEGER,
      per_question_time_limit INTEGER,
      show_answer_immediately INTEGER NOT NULL DEFAULT 0,
      score REAL,
      total_questions INTEGER NOT NULL,
      correct_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS question_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_answers TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      time_taken INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS waterfall_progress (
      bank_id INTEGER PRIMARY KEY REFERENCES question_banks(id) ON DELETE CASCADE,
      introduced_count INTEGER NOT NULL,
      last_session_date TEXT NOT NULL
    );
  `);

  // Enforce one response per (attempt, question). SQLite can't add a constraint
  // to an existing table, so we use a unique index — which also backs the
  // ON CONFLICT upsert in saveResponse(). Drop any pre-existing duplicates
  // (keeping the earliest row) first, otherwise index creation would fail on
  // older databases written before this invariant existed.
  db.exec(`
    DELETE FROM question_responses
    WHERE id NOT IN (
      SELECT MIN(id) FROM question_responses GROUP BY attempt_id, question_id
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_attempt_question
      ON question_responses(attempt_id, question_id);
  `);
}
