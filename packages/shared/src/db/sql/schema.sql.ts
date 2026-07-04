/**
 * Canonical DDL for the ExamDump schema, shared by both storage engines
 * (better-sqlite3 on desktop, sql.js on web) so they can never drift apart.
 * Desktop additionally wraps `QUESTIONS_DDL` in a hand-rolled migration dance
 * (see apps/desktop/src/db/schema.ts) to carry forward existing user data;
 * web has no legacy data and just runs `FULL_FRESH_DDL` once per new database.
 */

export const QUESTION_BANKS_DDL = `CREATE TABLE IF NOT EXISTS question_banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source_file TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 0
)`;

export const QUESTIONS_DDL = `CREATE TABLE IF NOT EXISTS questions (
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

export const REMAINING_TABLES_DDL = `
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

  CREATE TABLE IF NOT EXISTS question_flags (
    question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
    flagged_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS game_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL,
    score INTEGER NOT NULL,
    played_at INTEGER NOT NULL
  );
`;

export const RESPONSES_UNIQUE_INDEX_DDL = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_attempt_question
    ON question_responses(attempt_id, question_id);
`;

/** Full schema for a brand-new database, in dependency order. */
export const FULL_FRESH_DDL = [
  `${QUESTION_BANKS_DDL};`,
  `${QUESTIONS_DDL};`,
  REMAINING_TABLES_DDL,
  RESPONSES_UNIQUE_INDEX_DDL,
].join('\n');
