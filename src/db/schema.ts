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

const QUESTIONS_DDL = `CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_id INTEGER NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice','true_false','multi_select','interactive')),
  options TEXT NOT NULL,
  correct_answers TEXT NOT NULL,
  explanation TEXT,
  links TEXT,
  order_index INTEGER NOT NULL,
  image_data TEXT
)`;

function runMigrations(db: Database.Database): void {
  // question_banks has no FK deps — always safe to create first.
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_file TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      question_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Handle questions table separately so we can migrate existing rows.
  const existingQSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='questions'")
      .get() as { sql: string } | undefined
  )?.sql ?? '';

  if (!existingQSql) {
    // Fresh install — create with full schema.
    db.exec(QUESTIONS_DDL);
  } else if (!existingQSql.includes('image_data')) {
    // CRITICAL: FK off before rename. With FK on, SQLite rewrites question_responses'
    // FK to point at "questions_old", making DROP TABLE fail. With FK off the rename
    // is transparent and question_responses keeps referencing "questions" by name.
    db.pragma('foreign_keys = OFF');
    try {
      db.exec('ALTER TABLE questions RENAME TO questions_old');
      db.exec(QUESTIONS_DDL);
      db.exec(`
        INSERT INTO questions
          (id, bank_id, question_text, question_type, options, correct_answers, explanation, links, order_index, image_data)
        SELECT id, bank_id, question_text, question_type, options, correct_answers, explanation, links, order_index, NULL
        FROM questions_old
      `);
      db.exec('DROP TABLE questions_old');
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // Remaining tables — safe now that questions exists.
  db.exec(`
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

  db.exec(`
    DELETE FROM question_responses
    WHERE id NOT IN (
      SELECT MIN(id) FROM question_responses GROUP BY attempt_id, question_id
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_attempt_question
      ON question_responses(attempt_id, question_id);
  `);
}
