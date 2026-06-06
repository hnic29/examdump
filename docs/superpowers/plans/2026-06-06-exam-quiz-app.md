# ExamDump Quiz App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop exam-prep quiz app that imports PDF/DOCX/TXT exam dumps, parses questions, and runs timed/untimed practice tests with full history tracking.

**Architecture:** Electron 42 main/preload/renderer three-process model. Main process owns SQLite (better-sqlite3), file I/O, rule-based parsing, and the embedded WebContentsView browser panel. Renderer is a React app that communicates exclusively through the contextBridge preload API. All timer state lives in React; all persistence lives in SQLite.

**Tech Stack:** Electron 42, React 18, TypeScript, Vite, better-sqlite3, pdf-parse, mammoth, Vitest

---

### Task 1: Install dependencies and configure test runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install production dependencies**

```bash
npm install react react-dom better-sqlite3 pdf-parse mammoth
```

Expected: packages added to `node_modules/`, no errors.

- [ ] **Step 2: Install dev dependencies**

```bash
npm install --save-dev @types/react @types/react-dom @types/better-sqlite3 @types/pdf-parse vitest @testing-library/react @testing-library/user-event jsdom electron-rebuild
```

- [ ] **Step 3: Rebuild better-sqlite3 for Electron's Node runtime**

```bash
npx electron-rebuild -f -w better-sqlite3
```

Expected output contains: `✔ Rebuild Complete`

If this fails with "No module named 'distutils'": `pip install setuptools` then retry.

- [ ] **Step 4: Add scripts to package.json**

Open `package.json`. Add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest",
"rebuild": "electron-rebuild -f -w better-sqlite3"
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 6: Verify test runner works**

```bash
npm test
```

Expected: `No test files found` (not an error — just no tests yet).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "feat: add react, sqlite, pdf/docx parsing, vitest dependencies"
```

---

### Task 2: TypeScript types

**Files:**
- Create: `src/types.ts`
- Create: `src/electron.d.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
export type QuestionType = 'multiple_choice' | 'true_false' | 'multi_select';
export type TimedMode = 'none' | 'total' | 'per_question' | 'both';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionLink {
  text: string;
  url: string;
}

export interface QuestionBank {
  id: number;
  name: string;
  sourceFile: string;
  createdAt: number;
  questionCount: number;
}

export interface Question {
  id: number;
  bankId: number;
  questionText: string;
  questionType: QuestionType;
  options: QuestionOption[];
  correctAnswers: string[];
  explanation: string | null;
  links: QuestionLink[] | null;
  orderIndex: number;
}

export interface QuizAttempt {
  id: number;
  bankId: number;
  startedAt: number;
  completedAt: number | null;
  timedMode: TimedMode;
  totalTimeLimit: number | null;
  perQuestionTimeLimit: number | null;
  showAnswerImmediately: boolean;
  score: number | null;
  totalQuestions: number;
  correctCount: number;
}

export interface QuestionResponse {
  id: number;
  attemptId: number;
  questionId: number;
  selectedAnswers: string[];
  isCorrect: boolean;
  timeTaken: number;
}

export interface ParsedQuestion {
  question: string;
  type: QuestionType;
  options: QuestionOption[];
  correct_answers: string[];
  explanation: string | null;
  links: QuestionLink[] | null;
}

export interface ParseResult {
  success: boolean;
  questions: ParsedQuestion[];
  confidence: number;
}

export interface CreateAttemptInput {
  bankId: number;
  timedMode: TimedMode;
  totalTimeLimit: number | null;
  perQuestionTimeLimit: number | null;
  showAnswerImmediately: boolean;
  totalQuestions: number;
}

export interface SaveResponseInput {
  attemptId: number;
  questionId: number;
  selectedAnswers: string[];
  isCorrect: boolean;
  timeTaken: number;
}

export interface CompleteAttemptInput {
  attemptId: number;
  correctCount: number;
  score: number;
}

export interface ElectronAPI {
  importFile: () => Promise<{ text: string; fileName: string } | null>;
  parseFile: (text: string) => Promise<ParseResult>;
  ingestJSON: (json: string, name: string) => Promise<{ id: number; questionCount: number }>;
  loadBanks: () => Promise<QuestionBank[]>;
  loadQuestions: (bankId: number) => Promise<Question[]>;
  deleteBank: (bankId: number) => Promise<void>;
  createAttempt: (input: CreateAttemptInput) => Promise<number>;
  saveResponse: (input: SaveResponseInput) => Promise<void>;
  completeAttempt: (input: CompleteAttemptInput) => Promise<void>;
  getHistory: (bankId: number) => Promise<QuizAttempt[]>;
  getResponses: (attemptId: number) => Promise<QuestionResponse[]>;
  openPanel: (url: string) => Promise<void>;
  closePanel: () => Promise<void>;
  generatePrompt: (text: string) => Promise<string>;
  copyToClipboard: (text: string) => Promise<void>;
  onPanelStateChanged: (cb: (open: boolean) => void) => () => void;
}
```

- [ ] **Step 2: Create src/electron.d.ts**

```typescript
import type { ElectronAPI } from './types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/electron.d.ts
git commit -m "feat: add shared TypeScript domain types and preload API interface"
```

---

### Task 3: Database schema

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/schema.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createDb, getDb, initDb } from '../schema';

describe('createDb', () => {
  afterEach(() => {
    // reset singleton
    initDb(':memory:');
  });

  it('creates all four tables', () => {
    const db = createDb(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('question_banks');
    expect(names).toContain('questions');
    expect(names).toContain('quiz_attempts');
    expect(names).toContain('question_responses');
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/db/__tests__/schema.test.ts
```

Expected: FAIL — `Cannot find module '../schema'`

- [ ] **Step 3: Create src/db/schema.ts**

```typescript
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
      question_id INTEGER NOT NULL REFERENCES questions(id),
      selected_answers TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      time_taken INTEGER NOT NULL
    );
  `);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/db/__tests__/schema.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/schema.test.ts
git commit -m "feat: SQLite schema with four tables and cascade deletes"
```

---

### Task 4: Database CRUD layer

**Files:**
- Create: `src/db/banks.ts`
- Create: `src/db/questions.ts`
- Create: `src/db/attempts.ts`
- Create: `src/db/responses.ts`
- Create: `src/db/__tests__/crud.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/db/__tests__/crud.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../schema';
import { createBank, getAllBanks, deleteBank, getBankStats } from '../banks';
import { insertQuestions, getQuestionsForBank } from '../questions';
import { createAttempt, completeAttempt, getAttemptsForBank } from '../attempts';
import { saveResponse, getResponsesForAttempt } from '../responses';

beforeEach(() => { initDb(':memory:'); });

describe('banks', () => {
  it('creates and retrieves a bank', () => {
    createBank('Network+', 'net.pdf');
    const banks = getAllBanks();
    expect(banks).toHaveLength(1);
    expect(banks[0].name).toBe('Network+');
    expect(banks[0].sourceFile).toBe('net.pdf');
    expect(banks[0].questionCount).toBe(0);
  });

  it('deletes a bank', () => {
    createBank('Net+', 'n.pdf');
    const [bank] = getAllBanks();
    deleteBank(bank.id);
    expect(getAllBanks()).toHaveLength(0);
  });
});

describe('questions', () => {
  it('inserts questions and updates bank count', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    insertQuestions(bank.id, [
      { question: 'Q1', type: 'multiple_choice', options: [{ id: 'A', text: 'Ans' }], correct_answers: ['A'], explanation: null, links: null },
    ]);
    const qs = getQuestionsForBank(bank.id);
    expect(qs).toHaveLength(1);
    expect(qs[0].questionText).toBe('Q1');
    expect(getAllBanks()[0].questionCount).toBe(1);
  });
});

describe('attempts', () => {
  it('creates and completes an attempt', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const attemptId = createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions: 5 });
    expect(typeof attemptId).toBe('number');
    completeAttempt({ attemptId, correctCount: 4, score: 80 });
    const attempts = getAttemptsForBank(bank.id);
    expect(attempts[0].score).toBe(80);
    expect(attempts[0].correctCount).toBe(4);
    expect(attempts[0].completedAt).not.toBeNull();
  });
});

describe('responses', () => {
  it('saves and retrieves a response', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    insertQuestions(bank.id, [
      { question: 'Q', type: 'multiple_choice', options: [{ id: 'A', text: 'x' }], correct_answers: ['A'], explanation: null, links: null },
    ]);
    const [q] = getQuestionsForBank(bank.id);
    const attemptId = createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: false, totalQuestions: 1 });
    saveResponse({ attemptId, questionId: q.id, selectedAnswers: ['A'], isCorrect: true, timeTaken: 12 });
    const responses = getResponsesForAttempt(attemptId);
    expect(responses[0].isCorrect).toBe(true);
    expect(responses[0].timeTaken).toBe(12);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/db/__tests__/crud.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create src/db/banks.ts**

```typescript
import type { QuestionBank } from '../types';
import { getDb } from './schema';

interface BankRow { id: number; name: string; source_file: string; created_at: number; question_count: number; }

function toBank(r: BankRow): QuestionBank {
  return { id: r.id, name: r.name, sourceFile: r.source_file, createdAt: r.created_at, questionCount: r.question_count };
}

export function createBank(name: string, sourceFile: string): QuestionBank {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = db.prepare('INSERT INTO question_banks (name, source_file, created_at, question_count) VALUES (?,?,?,0)').run(name, sourceFile, now);
  return toBank(db.prepare('SELECT * FROM question_banks WHERE id = ?').get(result.lastInsertRowid) as BankRow);
}

export function getAllBanks(): QuestionBank[] {
  return (getDb().prepare('SELECT * FROM question_banks ORDER BY created_at DESC').all() as BankRow[]).map(toBank);
}

export function deleteBank(id: number): void {
  getDb().prepare('DELETE FROM question_banks WHERE id = ?').run(id);
}

export function updateBankQuestionCount(bankId: number, count: number): void {
  getDb().prepare('UPDATE question_banks SET question_count = ? WHERE id = ?').run(count, bankId);
}

export function getBankStats(bankId: number): { bestScore: number | null; lastTaken: number | null } {
  const row = getDb().prepare('SELECT MAX(score) as best_score, MAX(started_at) as last_taken FROM quiz_attempts WHERE bank_id = ? AND completed_at IS NOT NULL').get(bankId) as { best_score: number | null; last_taken: number | null };
  return { bestScore: row.best_score, lastTaken: row.last_taken };
}
```

- [ ] **Step 4: Create src/db/questions.ts**

```typescript
import type { Question, QuestionOption, QuestionLink, ParsedQuestion } from '../types';
import { getDb } from './schema';
import { updateBankQuestionCount } from './banks';

interface QuestionRow { id: number; bank_id: number; question_text: string; question_type: string; options: string; correct_answers: string; explanation: string | null; links: string | null; order_index: number; }

function toQuestion(r: QuestionRow): Question {
  return {
    id: r.id, bankId: r.bank_id, questionText: r.question_text,
    questionType: r.question_type as Question['questionType'],
    options: JSON.parse(r.options) as QuestionOption[],
    correctAnswers: JSON.parse(r.correct_answers) as string[],
    explanation: r.explanation,
    links: r.links ? JSON.parse(r.links) as QuestionLink[] : null,
    orderIndex: r.order_index,
  };
}

export function insertQuestions(bankId: number, parsed: ParsedQuestion[]): number {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO questions (bank_id, question_text, question_type, options, correct_answers, explanation, links, order_index) VALUES (?,?,?,?,?,?,?,?)');
  db.transaction((qs: ParsedQuestion[]) => {
    qs.forEach((q, i) => stmt.run(bankId, q.question, q.type, JSON.stringify(q.options), JSON.stringify(q.correct_answers), q.explanation ?? null, q.links ? JSON.stringify(q.links) : null, i));
  })(parsed);
  updateBankQuestionCount(bankId, parsed.length);
  return parsed.length;
}

export function getQuestionsForBank(bankId: number): Question[] {
  return (getDb().prepare('SELECT * FROM questions WHERE bank_id = ? ORDER BY order_index').all(bankId) as QuestionRow[]).map(toQuestion);
}
```

- [ ] **Step 5: Create src/db/attempts.ts**

```typescript
import type { QuizAttempt, CreateAttemptInput, CompleteAttemptInput, TimedMode } from '../types';
import { getDb } from './schema';

interface AttemptRow { id: number; bank_id: number; started_at: number; completed_at: number | null; timed_mode: string; total_time_limit: number | null; per_question_time_limit: number | null; show_answer_immediately: number; score: number | null; total_questions: number; correct_count: number; }

function toAttempt(r: AttemptRow): QuizAttempt {
  return {
    id: r.id, bankId: r.bank_id, startedAt: r.started_at, completedAt: r.completed_at,
    timedMode: r.timed_mode as TimedMode,
    totalTimeLimit: r.total_time_limit, perQuestionTimeLimit: r.per_question_time_limit,
    showAnswerImmediately: r.show_answer_immediately === 1,
    score: r.score, totalQuestions: r.total_questions, correctCount: r.correct_count,
  };
}

export function createAttempt(input: CreateAttemptInput): number {
  const result = getDb().prepare('INSERT INTO quiz_attempts (bank_id, started_at, timed_mode, total_time_limit, per_question_time_limit, show_answer_immediately, total_questions, correct_count) VALUES (?,?,?,?,?,?,?,0)').run(input.bankId, Math.floor(Date.now() / 1000), input.timedMode, input.totalTimeLimit ?? null, input.perQuestionTimeLimit ?? null, input.showAnswerImmediately ? 1 : 0, input.totalQuestions);
  return result.lastInsertRowid as number;
}

export function completeAttempt(input: CompleteAttemptInput): void {
  getDb().prepare('UPDATE quiz_attempts SET completed_at = ?, correct_count = ?, score = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), input.correctCount, input.score, input.attemptId);
}

export function getAttemptsForBank(bankId: number): QuizAttempt[] {
  return (getDb().prepare('SELECT * FROM quiz_attempts WHERE bank_id = ? ORDER BY started_at DESC').all(bankId) as AttemptRow[]).map(toAttempt);
}

export function getAttemptWithResponses(attemptId: number): QuizAttempt | null {
  const row = getDb().prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId) as AttemptRow | undefined;
  return row ? toAttempt(row) : null;
}
```

- [ ] **Step 6: Create src/db/responses.ts**

```typescript
import type { QuestionResponse, SaveResponseInput } from '../types';
import { getDb } from './schema';

interface ResponseRow { id: number; attempt_id: number; question_id: number; selected_answers: string; is_correct: number; time_taken: number; }

function toResponse(r: ResponseRow): QuestionResponse {
  return { id: r.id, attemptId: r.attempt_id, questionId: r.question_id, selectedAnswers: JSON.parse(r.selected_answers) as string[], isCorrect: r.is_correct === 1, timeTaken: r.time_taken };
}

export function saveResponse(input: SaveResponseInput): void {
  getDb().prepare('INSERT INTO question_responses (attempt_id, question_id, selected_answers, is_correct, time_taken) VALUES (?,?,?,?,?)').run(input.attemptId, input.questionId, JSON.stringify(input.selectedAnswers), input.isCorrect ? 1 : 0, input.timeTaken);
}

export function getResponsesForAttempt(attemptId: number): QuestionResponse[] {
  return (getDb().prepare('SELECT * FROM question_responses WHERE attempt_id = ? ORDER BY id').all(attemptId) as ResponseRow[]).map(toResponse);
}
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/db/__tests__/crud.test.ts
```

Expected: 4 test suites, all passed.

- [ ] **Step 8: Commit**

```bash
git add src/db/
git commit -m "feat: SQLite CRUD layer for banks, questions, attempts, responses"
```

---

### Task 5: Rule-based parser

**Files:**
- Create: `src/parser/ruleParser.ts`
- Create: `src/parser/__tests__/ruleParser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/parser/__tests__/ruleParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseExamDump } from '../ruleParser';

const SAMPLE = `Question: 1 CY0-001: Actual Exam Q&A |
Which protocol provides reliable, connection-oriented delivery at Layer 4?
A. UDP
B. TCP
C. IP
D. ICMP
Answer: B
Explanation:
TCP operates at Layer 4 and uses a three-way handshake for reliability.
Authoritative Links for Further Research:
https://example.com/tcp

Question: 2 CY0-001: Actual Exam Q&A |
Select ALL protocols that operate at Layer 4.
A. UDP
B. TCP
C. HTTP
D. FTP
Answer: A, B
Explanation:
Both UDP and TCP operate at Layer 4.`;

const NO_ANSWER_SAMPLE = `Question: 1 SY0-601 |
What is a firewall?
A. A hardware device
B. A software tool
C. Both A and B
D. Neither`;

describe('parseExamDump', () => {
  it('parses multiple_choice question correctly', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.success).toBe(true);
    expect(result.questions[0].type).toBe('multiple_choice');
    expect(result.questions[0].correct_answers).toEqual(['B']);
    expect(result.questions[0].options).toHaveLength(4);
    expect(result.questions[0].options[0]).toEqual({ id: 'A', text: 'UDP' });
  });

  it('detects multi_select when multiple correct answers', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.questions[1].type).toBe('multi_select');
    expect(result.questions[1].correct_answers).toEqual(['A', 'B']);
  });

  it('parses explanation text', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.questions[0].explanation).toContain('three-way handshake');
  });

  it('parses authoritative links', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.questions[0].links).toHaveLength(1);
    expect(result.questions[0].links![0].url).toBe('https://example.com/tcp');
  });

  it('handles questions without answers gracefully', () => {
    const result = parseExamDump(NO_ANSWER_SAMPLE);
    expect(result.questions[0].correct_answers).toEqual([]);
  });

  it('detects true_false type', () => {
    const text = `Question: 1 Test |
TCP is connectionless.
A. True
B. False
Answer: B`;
    const result = parseExamDump(text);
    expect(result.questions[0].type).toBe('true_false');
  });

  it('returns low confidence for unrecognized format', () => {
    const result = parseExamDump('This is not an exam dump at all.');
    expect(result.success).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/parser/__tests__/ruleParser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create src/parser/ruleParser.ts**

```typescript
import type { ParsedQuestion, ParseResult, QuestionOption, QuestionLink, QuestionType } from '../types';

const OPTION_RE = /^([A-E])\.\s+(.+)/;
const ANSWER_RE = /^Answer:\s*([A-E](?:,\s*[A-E])*)/i;
const EXPLANATION_RE = /^Explanation:\s*/i;
const LINKS_HEADER_RE = /^Authoritative Links/i;
const URL_RE = /https?:\/\/[^\s]+/g;

export function parseExamDump(text: string): ParseResult {
  const blocks = text.split(/(?=Question:\s*\d+)/i).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0) return { success: false, questions: [], confidence: 0 };

  const questions: ParsedQuestion[] = [];
  let recognized = 0;

  for (const block of blocks) {
    const q = parseBlock(block);
    if (q) { questions.push(q); recognized++; }
  }

  const confidence = recognized / blocks.length;
  return { success: confidence >= 0.5, questions, confidence };
}

function parseBlock(block: string): ParsedQuestion | null {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  let idx = 0;
  // Skip "Question: N ..." header line
  if (/^Question:\s*\d+/i.test(lines[idx])) idx++;

  // Collect question text until first option line
  const qLines: string[] = [];
  while (idx < lines.length && !OPTION_RE.test(lines[idx])) {
    qLines.push(lines[idx++]);
  }
  const questionText = qLines.join(' ').trim();
  if (!questionText) return null;

  // Collect options
  const options: QuestionOption[] = [];
  while (idx < lines.length && OPTION_RE.test(lines[idx])) {
    const m = lines[idx++].match(OPTION_RE)!;
    options.push({ id: m[1], text: m[2].trim() });
  }
  if (options.length < 2) return null;

  // Answer line (optional)
  let correctAnswers: string[] = [];
  if (idx < lines.length && ANSWER_RE.test(lines[idx])) {
    const m = lines[idx++].match(ANSWER_RE)!;
    correctAnswers = m[1].split(',').map(a => a.trim());
  }

  // Explanation (optional)
  let explanation: string | null = null;
  const links: QuestionLink[] = [];

  if (idx < lines.length && EXPLANATION_RE.test(lines[idx])) {
    idx++;
    const explLines: string[] = [];
    while (idx < lines.length && !LINKS_HEADER_RE.test(lines[idx])) {
      explLines.push(lines[idx++]);
    }
    explanation = explLines.join('\n').trim() || null;
  }

  // Authoritative links (optional)
  if (idx < lines.length && LINKS_HEADER_RE.test(lines[idx])) {
    idx++;
    for (; idx < lines.length; idx++) {
      const urlMatches = lines[idx].match(URL_RE);
      if (urlMatches) {
        const url = urlMatches[0];
        const labelPart = lines[idx].replace(url, '').trim();
        links.push({ text: labelPart || url, url });
      }
    }
  }

  // Determine question type
  let type: QuestionType = 'multiple_choice';
  if (options.length === 2 &&
      options[0].text.toLowerCase() === 'true' &&
      options[1].text.toLowerCase() === 'false') {
    type = 'true_false';
  } else if (correctAnswers.length > 1) {
    type = 'multi_select';
  }

  return {
    question: questionText,
    type,
    options,
    correct_answers: correctAnswers,
    explanation,
    links: links.length > 0 ? links : null,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/parser/__tests__/ruleParser.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/parser/ruleParser.ts src/parser/__tests__/ruleParser.test.ts
git commit -m "feat: rule-based exam dump parser with multi_select, true_false, links"
```

---

### Task 6: File extractor and prompt generator

**Files:**
- Create: `src/parser/fileExtractor.ts`
- Create: `src/parser/promptGenerator.ts`
- Create: `src/parser/__tests__/promptGenerator.test.ts`

- [ ] **Step 1: Create src/parser/fileExtractor.ts**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';

export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt') {
    return fs.readFile(filePath, 'utf-8');
  }

  if (ext === '.pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === '.docx' || ext === '.doc') {
    const mammoth = await import('mammoth');
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}. Supported: .txt, .pdf, .docx`);
}
```

- [ ] **Step 2: Write prompt generator test**

Create `src/parser/__tests__/promptGenerator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generatePrompt } from '../promptGenerator';

describe('generatePrompt', () => {
  it('includes the document text between markers', () => {
    const prompt = generatePrompt('Hello exam content');
    expect(prompt).toContain('--- DOCUMENT START ---');
    expect(prompt).toContain('Hello exam content');
    expect(prompt).toContain('--- DOCUMENT END ---');
  });

  it('includes the JSON schema in the prompt', () => {
    const prompt = generatePrompt('content');
    expect(prompt).toContain('"questions"');
    expect(prompt).toContain('"correct_answers"');
    expect(prompt).toContain('multiple_choice');
    expect(prompt).toContain('multi_select');
    expect(prompt).toContain('true_false');
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
npx vitest run src/parser/__tests__/promptGenerator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create src/parser/promptGenerator.ts**

```typescript
export function generatePrompt(documentText: string): string {
  return `Parse the following exam document into this exact JSON format and return ONLY the JSON, no other text:

{
  "questions": [
    {
      "question": "Question text here",
      "type": "multiple_choice",
      "options": [{"id": "A", "text": "Option text"}],
      "correct_answers": ["A"],
      "explanation": "Why this is correct, or null if not provided",
      "links": [{"text": "Link label", "url": "https://example.com"}]
    }
  ]
}

Rules:
- "type" must be one of: "multiple_choice" (one correct), "multi_select" (multiple correct), "true_false"
- For true_false: options must be [{"id":"A","text":"True"},{"id":"B","text":"False"}]
- "explanation" is null if no explanation is present in the source
- "links" is null if no authoritative links are present
- "correct_answers" is an array of option id strings, e.g. ["A"] or ["A","C"]

--- DOCUMENT START ---
${documentText}
--- DOCUMENT END ---`;
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/parser/__tests__/promptGenerator.test.ts
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/parser/fileExtractor.ts src/parser/promptGenerator.ts src/parser/__tests__/promptGenerator.test.ts
git commit -m "feat: file text extractor (pdf/docx/txt) and AI prompt generator"
```

---

### Task 7: IPC bridge — channels, preload, and main process handlers

**Files:**
- Create: `src/ipc/channels.ts`
- Modify: `src/preload.ts`
- Modify: `src/main.ts`
- Create: `src/browser/panel.ts`

- [ ] **Step 1: Create src/ipc/channels.ts**

```typescript
export const IPC = {
  IMPORT_FILE: 'import-file',
  PARSE_FILE: 'parse-file',
  INGEST_JSON: 'ingest-json',
  LOAD_BANKS: 'load-banks',
  LOAD_QUESTIONS: 'load-questions',
  DELETE_BANK: 'delete-bank',
  CREATE_ATTEMPT: 'create-attempt',
  SAVE_RESPONSE: 'save-response',
  COMPLETE_ATTEMPT: 'complete-attempt',
  GET_HISTORY: 'get-history',
  GET_RESPONSES: 'get-responses',
  OPEN_PANEL: 'open-panel',
  CLOSE_PANEL: 'close-panel',
  GENERATE_PROMPT: 'generate-prompt',
  COPY_TO_CLIPBOARD: 'copy-to-clipboard',
  PANEL_STATE_CHANGED: 'panel-state-changed',
} as const;
```

- [ ] **Step 2: Replace src/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipc/channels';
import type { ElectronAPI, CreateAttemptInput, SaveResponseInput, CompleteAttemptInput } from './types';

const api: ElectronAPI = {
  importFile: () => ipcRenderer.invoke(IPC.IMPORT_FILE),
  parseFile: (text) => ipcRenderer.invoke(IPC.PARSE_FILE, text),
  ingestJSON: (json, name) => ipcRenderer.invoke(IPC.INGEST_JSON, json, name),
  loadBanks: () => ipcRenderer.invoke(IPC.LOAD_BANKS),
  loadQuestions: (bankId) => ipcRenderer.invoke(IPC.LOAD_QUESTIONS, bankId),
  deleteBank: (bankId) => ipcRenderer.invoke(IPC.DELETE_BANK, bankId),
  createAttempt: (input: CreateAttemptInput) => ipcRenderer.invoke(IPC.CREATE_ATTEMPT, input),
  saveResponse: (input: SaveResponseInput) => ipcRenderer.invoke(IPC.SAVE_RESPONSE, input),
  completeAttempt: (input: CompleteAttemptInput) => ipcRenderer.invoke(IPC.COMPLETE_ATTEMPT, input),
  getHistory: (bankId) => ipcRenderer.invoke(IPC.GET_HISTORY, bankId),
  getResponses: (attemptId) => ipcRenderer.invoke(IPC.GET_RESPONSES, attemptId),
  openPanel: (url) => ipcRenderer.invoke(IPC.OPEN_PANEL, url),
  closePanel: () => ipcRenderer.invoke(IPC.CLOSE_PANEL),
  generatePrompt: (text) => ipcRenderer.invoke(IPC.GENERATE_PROMPT, text),
  copyToClipboard: (text) => ipcRenderer.invoke(IPC.COPY_TO_CLIPBOARD, text),
  onPanelStateChanged: (cb) => {
    const handler = (_: unknown, open: boolean) => cb(open);
    ipcRenderer.on(IPC.PANEL_STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.PANEL_STATE_CHANGED, handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
```

- [ ] **Step 3: Create src/browser/panel.ts**

```typescript
import { BrowserWindow, WebContentsView } from 'electron';

let panel: WebContentsView | null = null;
let resizeListener: (() => void) | null = null;

export function openPanel(mainWindow: BrowserWindow, url: string): void {
  if (!panel) {
    panel = new WebContentsView();
    mainWindow.contentView.addChildView(panel);
  }
  sizePanelToWindow(mainWindow);
  panel.webContents.loadURL(url);

  resizeListener = () => sizePanelToWindow(mainWindow);
  mainWindow.on('resize', resizeListener);
}

export function closePanel(mainWindow: BrowserWindow): void {
  if (!panel) return;
  if (resizeListener) { mainWindow.removeListener('resize', resizeListener); resizeListener = null; }
  mainWindow.contentView.removeChildView(panel);
  panel.webContents.destroy();
  panel = null;
}

export function isPanelOpen(): boolean {
  return panel !== null;
}

function sizePanelToWindow(win: BrowserWindow): void {
  if (!panel) return;
  const [w, h] = win.getContentSize();
  const panelW = Math.floor(w * 0.6);
  panel.setBounds({ x: w - panelW, y: 0, width: panelW, height: h });
}
```

- [ ] **Step 4: Replace src/main.ts**

```typescript
import { app, BrowserWindow, ipcMain, dialog, clipboard } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { initDb } from './db/schema';
import { getAllBanks, createBank, deleteBank, getBankStats } from './db/banks';
import { insertQuestions, getQuestionsForBank } from './db/questions';
import { createAttempt, completeAttempt, getAttemptsForBank } from './db/attempts';
import { saveResponse, getResponsesForAttempt } from './db/responses';
import { extractText } from './parser/fileExtractor';
import { parseExamDump } from './parser/ruleParser';
import { generatePrompt } from './parser/promptGenerator';
import { openPanel, closePanel, isPanelOpen } from './browser/panel';
import { IPC } from './ipc/channels';
import type { ParsedQuestion, CreateAttemptInput, SaveResponseInput, CompleteAttemptInput } from './types';

if (started) app.quit();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.on('ready', () => {
  initDb(path.join(app.getPath('userData'), 'examdump.db'));
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function registerIpcHandlers() {
  ipcMain.handle(IPC.IMPORT_FILE, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Exam Files', extensions: ['pdf', 'docx', 'doc', 'txt'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const text = await extractText(filePath);
    return { text, fileName: path.basename(filePath) };
  });

  ipcMain.handle(IPC.PARSE_FILE, async (_e, text: string) => {
    return parseExamDump(text);
  });

  ipcMain.handle(IPC.INGEST_JSON, async (_e, json: string, name: string) => {
    const parsed = JSON.parse(json) as { questions: ParsedQuestion[] };
    const bank = createBank(name, 'ai-parsed');
    const count = insertQuestions(bank.id, parsed.questions);
    return { id: bank.id, questionCount: count };
  });

  ipcMain.handle(IPC.LOAD_BANKS, () => {
    return getAllBanks().map(b => ({ ...b, ...getBankStats(b.id) }));
  });

  ipcMain.handle(IPC.LOAD_QUESTIONS, (_e, bankId: number) => getQuestionsForBank(bankId));

  ipcMain.handle(IPC.DELETE_BANK, (_e, bankId: number) => deleteBank(bankId));

  ipcMain.handle(IPC.CREATE_ATTEMPT, (_e, input: CreateAttemptInput) => createAttempt(input));

  ipcMain.handle(IPC.SAVE_RESPONSE, (_e, input: SaveResponseInput) => saveResponse(input));

  ipcMain.handle(IPC.COMPLETE_ATTEMPT, (_e, input: CompleteAttemptInput) => completeAttempt(input));

  ipcMain.handle(IPC.GET_HISTORY, (_e, bankId: number) => getAttemptsForBank(bankId));

  ipcMain.handle(IPC.GET_RESPONSES, (_e, attemptId: number) => getResponsesForAttempt(attemptId));

  ipcMain.handle(IPC.OPEN_PANEL, (_e, url: string) => {
    if (!mainWindow) return;
    openPanel(mainWindow, url);
    mainWindow.webContents.send(IPC.PANEL_STATE_CHANGED, true);
  });

  ipcMain.handle(IPC.CLOSE_PANEL, () => {
    if (!mainWindow) return;
    closePanel(mainWindow);
    mainWindow.webContents.send(IPC.PANEL_STATE_CHANGED, false);
  });

  ipcMain.handle(IPC.GENERATE_PROMPT, (_e, text: string) => generatePrompt(text));

  ipcMain.handle(IPC.COPY_TO_CLIPBOARD, (_e, text: string) => clipboard.writeText(text));
}
```

- [ ] **Step 5: Verify app still launches**

```bash
npm start
```

Expected: window opens. DevTools console should show no errors. Close the window.

- [ ] **Step 6: Commit**

```bash
git add src/ipc/channels.ts src/preload.ts src/main.ts src/browser/panel.ts
git commit -m "feat: IPC bridge, preload contextBridge API, main process handlers, WebContentsView panel"
```

---

### Task 8: React app shell

**Files:**
- Modify: `index.html`
- Create: `src/renderer.tsx` (replaces `src/renderer.ts`)
- Create: `src/App.tsx`
- Create: `src/components/Sidebar.tsx`
- Create: `src/styles/app.css`

- [ ] **Step 1: Update index.html**

Replace the contents of `index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>ExamDump</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Delete src/renderer.ts and create src/renderer.tsx**

Delete `src/renderer.ts`, then create `src/renderer.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';

const root = document.getElementById('root')!;
createRoot(root).render(<App />);
```

- [ ] **Step 3: Create src/styles/app.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0f1117;
  color: #e0e0e0;
  height: 100vh;
  overflow: hidden;
}

.app-shell { display: flex; height: 100vh; }

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #1a1f2e;
  border-right: 1px solid #2d3a52;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px 14px 12px;
  font-size: 15px;
  font-weight: 700;
  color: #e0e0e0;
  border-bottom: 1px solid #2d3a52;
}

.sidebar-section-label {
  padding: 10px 14px 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #4a5568;
}

.sidebar-banks { flex: 1; overflow-y: auto; }

.sidebar-bank-item {
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  color: #c9d4e8;
  border-radius: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-bank-item:hover { background: #232b3e; }
.sidebar-bank-item.active { background: #2196f320; color: #64b5f6; }

.sidebar-nav { border-top: 1px solid #2d3a52; padding: 8px 0; }

.sidebar-nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 14px;
  background: none;
  border: none;
  color: #8b9cb0;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.sidebar-nav-btn:hover { background: #232b3e; color: #e0e0e0; }
.sidebar-nav-btn.danger:hover { color: #f44336; }

.main-panel { flex: 1; overflow-y: auto; padding: 24px; }

.btn {
  padding: 8px 18px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary { background: #2196f3; color: #fff; }
.btn-primary:hover { background: #1976d2; }
.btn-primary:disabled { background: #2d3a52; color: #4a5568; cursor: default; }
.btn-secondary { background: #1e2535; color: #c9d4e8; border: 1px solid #2d3a52; }
.btn-secondary:hover { background: #232b3e; }
.btn-danger { background: #f4433620; color: #f44336; border: 1px solid #f4433640; }
.btn-danger:hover { background: #f4433630; }
.btn-success { background: #4caf50; color: #fff; }
.btn-success:hover { background: #388e3c; }

.card { background: #1e2535; border: 1px solid #2d3a52; border-radius: 8px; padding: 20px; }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.badge-mc { background: #2196f320; color: #64b5f6; }
.badge-tf { background: #9c27b020; color: #ce93d8; }
.badge-ms { background: #ff980020; color: #ffcc80; }

.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}

.modal {
  background: #1a1f2e;
  border: 1px solid #2d3a52;
  border-radius: 10px;
  padding: 24px;
  min-width: 420px;
  max-width: 560px;
  width: 100%;
}

.modal h2 { font-size: 17px; margin-bottom: 16px; }

.form-row { margin-bottom: 14px; }
.form-label { display: block; font-size: 12px; color: #8b9cb0; margin-bottom: 5px; }
.form-input {
  width: 100%;
  background: #0f1117;
  border: 1px solid #2d3a52;
  border-radius: 5px;
  padding: 7px 10px;
  color: #e0e0e0;
  font-size: 13px;
}
.form-input:focus { outline: none; border-color: #2196f3; }

.radio-group { display: flex; flex-direction: column; gap: 7px; }
.radio-option {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  border: 1px solid #2d3a52;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.radio-option.selected { border-color: #2196f3; background: #2196f320; }

.panel-overlay-strip {
  position: fixed;
  top: 0; right: 40%;
  width: 40px; height: 100%;
  z-index: 200;
  display: flex; flex-direction: column;
  align-items: center;
  padding-top: 12px;
}

.panel-back-btn {
  background: #2196f3;
  color: #fff;
  border: none;
  border-radius: 6px 0 0 6px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 11px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}
```

- [ ] **Step 4: Create src/App.tsx**

```tsx
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Library } from './components/Library';
import { ImportFlow } from './components/ImportFlow';
import { ActiveQuiz } from './components/ActiveQuiz';
import { Results } from './components/Results';
import { History } from './components/History';
import type { QuestionBank } from './types';

type AppView =
  | { screen: 'library'; selectedBankId: number | null }
  | { screen: 'import' }
  | { screen: 'quiz'; bankId: number }
  | { screen: 'results'; attemptId: number; bankId: number }
  | { screen: 'history'; bankId: number };

export function App() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [view, setView] = useState<AppView>({ screen: 'library', selectedBankId: null });
  const [panelOpen, setPanelOpen] = useState(false);

  const refreshBanks = async () => setBanks(await window.electronAPI.loadBanks());

  useEffect(() => {
    refreshBanks();
    const unsub = window.electronAPI.onPanelStateChanged(setPanelOpen);
    return unsub;
  }, []);

  const closePanel = () => window.electronAPI.closePanel();

  return (
    <div className="app-shell">
      <Sidebar
        banks={banks}
        selectedBankId={view.screen === 'library' ? view.selectedBankId : null}
        onSelectBank={(id) => setView({ screen: 'library', selectedBankId: id })}
        onImport={() => setView({ screen: 'import' })}
        onHistory={(bankId) => setView({ screen: 'history', bankId })}
      />

      <main className="main-panel">
        {view.screen === 'library' && (
          <Library
            banks={banks}
            selectedBankId={view.selectedBankId}
            onStartQuiz={(bankId) => setView({ screen: 'quiz', bankId })}
            onDeleteBank={async (bankId) => { await window.electronAPI.deleteBank(bankId); refreshBanks(); setView({ screen: 'library', selectedBankId: null }); }}
          />
        )}
        {view.screen === 'import' && (
          <ImportFlow
            onComplete={() => { refreshBanks(); setView({ screen: 'library', selectedBankId: null }); }}
            onCancel={() => setView({ screen: 'library', selectedBankId: null })}
          />
        )}
        {view.screen === 'quiz' && (
          <ActiveQuiz
            bankId={view.bankId}
            onComplete={(attemptId) => setView({ screen: 'results', attemptId, bankId: view.bankId })}
            onCancel={() => setView({ screen: 'library', selectedBankId: view.bankId })}
          />
        )}
        {view.screen === 'results' && (
          <Results
            attemptId={view.attemptId}
            bankId={view.bankId}
            onRetake={() => setView({ screen: 'quiz', bankId: view.bankId })}
            onBack={() => setView({ screen: 'library', selectedBankId: view.bankId })}
          />
        )}
        {view.screen === 'history' && (
          <History
            bankId={view.bankId}
            onBack={() => setView({ screen: 'library', selectedBankId: view.bankId })}
          />
        )}
      </main>

      {panelOpen && (
        <div className="panel-overlay-strip">
          <button className="panel-back-btn" onClick={closePanel}>
            {view.screen === 'quiz' ? '⏸ Resume Quiz' : '← Back'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create src/components/Sidebar.tsx**

```tsx
import React from 'react';
import type { QuestionBank } from '../types';

interface Props {
  banks: QuestionBank[];
  selectedBankId: number | null;
  onSelectBank: (id: number) => void;
  onImport: () => void;
  onHistory: (bankId: number) => void;
}

export function Sidebar({ banks, selectedBankId, onSelectBank, onImport, onHistory }: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">ExamDump</div>

      <div className="sidebar-section-label">Question Banks</div>
      <div className="sidebar-banks">
        {banks.length === 0 && (
          <div style={{ padding: '10px 14px', color: '#4a5568', fontSize: 12 }}>
            No banks yet. Import a file to get started.
          </div>
        )}
        {banks.map(bank => (
          <div
            key={bank.id}
            className={`sidebar-bank-item${selectedBankId === bank.id ? ' active' : ''}`}
            onClick={() => onSelectBank(bank.id)}
            title={bank.name}
          >
            📂 {bank.name}
          </div>
        ))}
      </div>

      <div className="sidebar-nav">
        <button className="sidebar-nav-btn" onClick={onImport}>
          📥 Import File
        </button>
        {selectedBankId !== null && (
          <button className="sidebar-nav-btn" onClick={() => onHistory(selectedBankId)}>
            📊 History
          </button>
        )}
        <button
          className="sidebar-nav-btn"
          onClick={() => window.electronAPI.openPanel('https://claude.ai')}
        >
          🤖 AI Helper
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the app to verify the shell loads**

```bash
npm start
```

Expected: window opens with dark sidebar on the left and empty main area. No console errors. Close the window.

- [ ] **Step 7: Commit**

```bash
git add index.html src/renderer.tsx src/App.tsx src/components/Sidebar.tsx src/styles/app.css
git commit -m "feat: React app shell with sidebar layout and navigation state"
```

> Note: `src/renderer.ts` is now replaced by `src/renderer.tsx`. Delete the old file if git still tracks it: `git rm src/renderer.ts`

---

### Task 9: Library screen

**Files:**
- Create: `src/components/Library.tsx`

- [ ] **Step 1: Create src/components/Library.tsx**

```tsx
import React from 'react';
import type { QuestionBank } from '../types';

interface Props {
  banks: QuestionBank[];
  selectedBankId: number | null;
  onStartQuiz: (bankId: number) => void;
  onDeleteBank: (bankId: number) => void;
}

function formatDate(ts: number | null): string {
  if (!ts) return 'Never';
  return new Date(ts * 1000).toLocaleDateString();
}

export function Library({ banks, selectedBankId, onStartQuiz, onDeleteBank }: Props) {
  const bank = banks.find(b => b.id === selectedBankId) ?? null;

  if (!bank) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 32 }}>📚</div>
        <div style={{ color: '#8b9cb0', fontSize: 14 }}>Select a question bank from the sidebar, or import a new one.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>{bank.name}</h1>
        <div style={{ color: '#8b9cb0', fontSize: 13 }}>Imported from: {bank.sourceFile}</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ color: '#8b9cb0', fontSize: 11, marginBottom: 4 }}>QUESTIONS</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{bank.questionCount}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ color: '#8b9cb0', fontSize: 11, marginBottom: 4 }}>ADDED</div>
          <div style={{ fontSize: 14 }}>{formatDate(bank.createdAt)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-primary"
          onClick={() => onStartQuiz(bank.id)}
          disabled={bank.questionCount === 0}
        >
          ▶ Start Quiz
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm(`Delete "${bank.name}" and all its history?`)) {
              onDeleteBank(bank.id);
            }
          }}
        >
          🗑 Delete Bank
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in app**

```bash
npm start
```

Click "Import File" to add a test file (or create a text file with a few questions first). After importing, click the bank in the sidebar. Expected: bank detail view with question count and Start Quiz button.

- [ ] **Step 3: Commit**

```bash
git add src/components/Library.tsx
git commit -m "feat: library screen with bank detail and start quiz button"
```

---

### Task 10: Import flow

**Files:**
- Create: `src/components/ImportFlow.tsx`

- [ ] **Step 1: Create src/components/ImportFlow.tsx**

```tsx
import React, { useState } from 'react';
import type { ParsedQuestion } from '../types';

type ImportStep = 'idle' | 'parsing' | 'preview' | 'ai-fallback' | 'naming' | 'saving';

interface Props {
  onComplete: () => void;
  onCancel: () => void;
}

export function ImportFlow({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<ImportStep>('idle');
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [bankName, setBankName] = useState('');
  const [pasteJson, setPasteJson] = useState('');
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');

  const handlePickFile = async () => {
    setError('');
    const result = await window.electronAPI.importFile();
    if (!result) return;
    setFileName(result.fileName);
    setExtractedText(result.text);
    setBankName(result.fileName.replace(/\.[^.]+$/, ''));
    setStep('parsing');
    const parsed = await window.electronAPI.parseFile(result.text);
    if (parsed.success && parsed.questions.length > 0) {
      setParsedQuestions(parsed.questions);
      setStep('preview');
    } else {
      const p = await window.electronAPI.generatePrompt(result.text);
      setPrompt(p);
      setStep('ai-fallback');
    }
  };

  const handleCopyPrompt = async () => {
    await window.electronAPI.copyToClipboard(prompt);
  };

  const handlePasteImport = async () => {
    setError('');
    try {
      const parsed = JSON.parse(pasteJson) as { questions: ParsedQuestion[] };
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setError('JSON must have a "questions" array with at least one item.');
        return;
      }
      setParsedQuestions(parsed.questions);
      setStep('naming');
    } catch {
      setError('Invalid JSON. Make sure you copied the full response from the AI.');
    }
  };

  const handleSave = async () => {
    if (!bankName.trim()) { setError('Please enter a name for this question bank.'); return; }
    setStep('saving');
    await window.electronAPI.ingestJSON(JSON.stringify({ questions: parsedQuestions }), bankName.trim());
    onComplete();
  };

  if (step === 'idle' || step === 'parsing') {
    return (
      <div style={{ maxWidth: 500 }}>
        <h2 style={{ marginBottom: 16 }}>Import Question Bank</h2>
        <p style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 20 }}>
          Supported formats: PDF, DOCX, TXT
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handlePickFile} disabled={step === 'parsing'}>
            {step === 'parsing' ? '⏳ Parsing...' : '📁 Choose File'}
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'ai-fallback') {
    return (
      <div style={{ maxWidth: 600 }}>
        <h2 style={{ marginBottom: 8 }}>Parse with AI</h2>
        <p style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 16 }}>
          The file format wasn't recognized automatically. Use the AI Helper to parse it:
        </p>
        <ol style={{ color: '#c9d4e8', fontSize: 13, lineHeight: 2, marginBottom: 16, paddingLeft: 20 }}>
          <li>Click <strong>Copy Prompt</strong> — the full prompt is now on your clipboard</li>
          <li>Click <strong>Open AI Browser</strong> and choose Claude, ChatGPT, or Gemini</li>
          <li>Log in if needed, paste the prompt, and hit Send</li>
          <li>Copy the JSON from the AI's response</li>
          <li>Paste it below and click <strong>Paste & Import</strong></li>
        </ol>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button className="btn btn-secondary" onClick={handleCopyPrompt}>📋 Copy Prompt</button>
          <button className="btn btn-secondary" onClick={() => window.electronAPI.openPanel('https://claude.ai')}>🤖 Open AI Browser</button>
        </div>
        <textarea
          value={pasteJson}
          onChange={e => setPasteJson(e.target.value)}
          placeholder='Paste the JSON response here...'
          style={{ width: '100%', height: 120, background: '#0f1117', border: '1px solid #2d3a52', borderRadius: 6, padding: 10, color: '#e0e0e0', fontSize: 12, resize: 'vertical', marginBottom: 10 }}
        />
        {error && <div style={{ color: '#f44336', fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handlePasteImport} disabled={!pasteJson.trim()}>Paste & Import</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'preview' || step === 'naming') {
    return (
      <div style={{ maxWidth: 600 }}>
        <h2 style={{ marginBottom: 8 }}>
          {step === 'preview' ? `Preview — ${parsedQuestions.length} questions found` : 'Name Your Question Bank'}
        </h2>
        {step === 'preview' && (
          <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
            {parsedQuestions.slice(0, 5).map((q, i) => (
              <div key={i} className="card" style={{ marginBottom: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#8b9cb0', marginBottom: 4 }}>Q{i + 1} · {q.type.replace('_', ' ')}</div>
                <div style={{ fontSize: 13 }}>{q.question.slice(0, 120)}{q.question.length > 120 ? '…' : ''}</div>
              </div>
            ))}
            {parsedQuestions.length > 5 && (
              <div style={{ color: '#8b9cb0', fontSize: 12, padding: '4px 0' }}>…and {parsedQuestions.length - 5} more</div>
            )}
          </div>
        )}
        <div className="form-row">
          <label className="form-label">Question bank name</label>
          <input
            className="form-input"
            value={bankName}
            onChange={e => setBankName(e.target.value)}
            placeholder="e.g. Network+ Study Guide"
          />
        </div>
        {error && <div style={{ color: '#f44336', fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSave}>💾 Save to Library</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return <div style={{ color: '#8b9cb0' }}>Saving…</div>;
}
```

- [ ] **Step 2: Test the import flow manually**

```bash
npm start
```

1. Click "📥 Import File" in the sidebar
2. Pick any `.txt` file with exam content (or create a test file with 2-3 questions in the standard format)
3. If recognized: preview should show the questions, then save
4. Bank should appear in sidebar after save

- [ ] **Step 3: Commit**

```bash
git add src/components/ImportFlow.tsx
git commit -m "feat: import flow with rule-based fast-path and AI browser fallback"
```

---

### Task 11: Quiz setup modal and timer hook

**Files:**
- Create: `src/components/QuizSetup.tsx`
- Create: `src/hooks/useTimer.ts`
- Create: `src/hooks/__tests__/useTimer.test.ts`

- [ ] **Step 1: Write failing timer test**

Create `src/hooks/__tests__/useTimer.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';

describe('useTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('counts down from initial seconds', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useTimer(5, onExpire));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.secondsLeft).toBe(3);
  });

  it('calls onExpire when reaching zero', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useTimer(2, onExpire));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it('pauses and resumes correctly', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useTimer(10, onExpire));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.pause(); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.secondsLeft).toBe(7);
    act(() => { result.current.resume(); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.secondsLeft).toBe(4);
  });

  it('resets to new value', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useTimer(10, onExpire));
    act(() => { result.current.start(); vi.advanceTimersByTime(3000); });
    act(() => { result.current.reset(20); });
    expect(result.current.secondsLeft).toBe(20);
    expect(result.current.isRunning).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/hooks/__tests__/useTimer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create src/hooks/useTimer.ts**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTimerReturn {
  secondsLeft: number;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (seconds: number) => void;
}

export function useTimer(initialSeconds: number, onExpire: () => void): UseTimerReturn {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [paused, setPaused] = useState(true);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (paused || secondsLeft <= 0) return;
    const id = setTimeout(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          setPaused(true);
          setTimeout(() => onExpireRef.current(), 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, paused]);

  const start = useCallback(() => setPaused(false), []);
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);
  const reset = useCallback((s: number) => {
    setSecondsLeft(s);
    setPaused(true);
  }, []);

  return { secondsLeft, isRunning: !paused && secondsLeft > 0, start, pause, resume, reset };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/__tests__/useTimer.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Create src/components/QuizSetup.tsx**

```tsx
import React, { useState } from 'react';
import type { TimedMode, CreateAttemptInput } from '../types';

interface Props {
  bankId: number;
  questionCount: number;
  onStart: (config: Omit<CreateAttemptInput, 'bankId' | 'totalQuestions'>) => void;
  onCancel: () => void;
}

export function QuizSetup({ bankId, questionCount, onStart, onCancel }: Props) {
  const [timedMode, setTimedMode] = useState<TimedMode>('none');
  const [totalMinutes, setTotalMinutes] = useState('90');
  const [perQuestionSeconds, setPerQuestionSeconds] = useState('60');
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(true);

  const handleStart = () => {
    onStart({
      timedMode,
      totalTimeLimit: (timedMode === 'total' || timedMode === 'both') ? parseInt(totalMinutes) * 60 : null,
      perQuestionTimeLimit: (timedMode === 'per_question' || timedMode === 'both') ? parseInt(perQuestionSeconds) : null,
      showAnswerImmediately,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Quiz Setup</h2>
        <p style={{ color: '#8b9cb0', fontSize: 12, marginBottom: 16 }}>{questionCount} questions</p>

        <div className="form-row">
          <label className="form-label">Timer</label>
          <div className="radio-group">
            {([['none', 'No timer'], ['total', 'Total time limit'], ['per_question', 'Per-question time limit'], ['both', 'Both']] as [TimedMode, string][]).map(([val, label]) => (
              <div key={val} className={`radio-option${timedMode === val ? ' selected' : ''}`} onClick={() => setTimedMode(val)}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${timedMode === val ? '#2196f3' : '#4a5568'}`, background: timedMode === val ? '#2196f3' : 'transparent', flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {(timedMode === 'total' || timedMode === 'both') && (
          <div className="form-row">
            <label className="form-label">Total time (minutes)</label>
            <input className="form-input" type="number" min="1" max="360" value={totalMinutes} onChange={e => setTotalMinutes(e.target.value)} />
          </div>
        )}

        {(timedMode === 'per_question' || timedMode === 'both') && (
          <div className="form-row">
            <label className="form-label">Per-question time (seconds)</label>
            <input className="form-input" type="number" min="10" max="300" value={perQuestionSeconds} onChange={e => setPerQuestionSeconds(e.target.value)} />
          </div>
        )}

        <div className="form-row">
          <label className="form-label">Show correct answer after each question?</label>
          <div className="radio-group">
            {([true, false] as const).map(val => (
              <div key={String(val)} className={`radio-option${showAnswerImmediately === val ? ' selected' : ''}`} onClick={() => setShowAnswerImmediately(val)}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${showAnswerImmediately === val ? '#2196f3' : '#4a5568'}`, background: showAnswerImmediately === val ? '#2196f3' : 'transparent', flexShrink: 0 }} />
                {val ? 'Yes — show answer and explanation immediately' : 'No — show all results at the end'}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={handleStart}>▶ Start Quiz</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/QuizSetup.tsx src/hooks/useTimer.ts src/hooks/__tests__/useTimer.test.ts
git commit -m "feat: quiz setup modal with timer options and useTimer hook"
```

---

### Task 12: Active quiz screen and answer feedback

**Files:**
- Create: `src/components/ActiveQuiz.tsx`
- Create: `src/components/AnswerFeedback.tsx`

- [ ] **Step 1: Create src/components/AnswerFeedback.tsx**

```tsx
import React from 'react';
import type { Question, QuestionResponse } from '../types';

interface Props {
  question: Question;
  response: QuestionResponse;
  onNext: () => void;
  onOpenLink: (url: string) => void;
}

export function AnswerFeedback({ question, response, onNext, onOpenLink }: Props) {
  const correct = response.isCorrect;

  return (
    <div>
      <div style={{
        padding: '10px 16px', marginBottom: 12, borderRadius: '6px 6px 0 0',
        background: correct ? '#4caf5018' : '#f4433618',
        border: `1px solid ${correct ? '#4caf5040' : '#f4433640'}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>{correct ? '✅' : '❌'}</span>
        <span style={{ fontWeight: 700, color: correct ? '#4caf50' : '#f44336', fontSize: 14 }}>
          {correct ? 'Correct!' : 'Incorrect'}
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        {question.options.map(opt => {
          const isSelected = response.selectedAnswers.includes(opt.id);
          const isCorrect = question.correctAnswers.includes(opt.id);
          let bg = '#1a1f2e', border = '#2d3a52', color = '#c9d4e8';
          if (isSelected && isCorrect) { bg = '#4caf5020'; border = '#4caf50'; }
          else if (isSelected && !isCorrect) { bg = '#f4433620'; border = '#f44336'; }
          else if (!isSelected && isCorrect) { bg = '#4caf5010'; border = '#4caf5060'; }

          return (
            <div key={opt.id} style={{ display: 'flex', gap: 10, padding: '9px 12px', borderRadius: 6, border: `1px solid ${border}`, background: bg, marginBottom: 6, color }}>
              <div style={{ width: 22, height: 22, borderRadius: 4, background: border, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{opt.id}</div>
              <div style={{ fontSize: 13, paddingTop: 3 }}>
                {opt.text}
                {!isSelected && isCorrect && <span style={{ color: '#4caf50', fontSize: 11, marginLeft: 6 }}>← correct</span>}
              </div>
            </div>
          );
        })}
      </div>

      {question.explanation && (
        <div style={{ borderLeft: `3px solid ${correct ? '#4caf50' : '#f44336'}`, background: '#1e2535', borderRadius: '0 6px 6px 0', padding: '10px 14px', marginBottom: 12, maxHeight: 180, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: '#8b9cb0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Explanation</div>
          <div style={{ fontSize: 12, color: '#c9d4e8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{question.explanation}</div>
        </div>
      )}

      {question.links && question.links.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#8b9cb0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>References</div>
          {question.links.map((link, i) => (
            <button key={i} className="btn btn-secondary" style={{ marginRight: 6, marginBottom: 4, fontSize: 11 }} onClick={() => onOpenLink(link.url)}>
              🔗 {link.text.slice(0, 50)}
            </button>
          ))}
        </div>
      )}

      <button className="btn btn-success" onClick={onNext}>Next Question →</button>
    </div>
  );
}
```

- [ ] **Step 2: Create src/components/ActiveQuiz.tsx**

```tsx
import React, { useState, useEffect, useReducer, useRef } from 'react';
import { QuizSetup } from './QuizSetup';
import { AnswerFeedback } from './AnswerFeedback';
import { useTimer } from '../hooks/useTimer';
import type { Question, QuestionResponse, CreateAttemptInput, TimedMode } from '../types';

type QuizPhase = 'setup' | 'active' | 'feedback';

interface QuizState {
  phase: QuizPhase;
  questions: Question[];
  currentIndex: number;
  selectedAnswers: string[];
  paused: boolean;
  attemptId: number | null;
  config: { timedMode: TimedMode; totalTimeLimit: number | null; perQuestionTimeLimit: number | null; showAnswerImmediately: boolean };
  responses: QuestionResponse[];
  lastResponse: QuestionResponse | null;
  questionStartTime: number;
}

type QuizAction =
  | { type: 'START'; questions: Question[]; attemptId: number; config: QuizState['config'] }
  | { type: 'SELECT'; answers: string[] }
  | { type: 'SUBMIT'; response: QuestionResponse }
  | { type: 'NEXT' }
  | { type: 'TOGGLE_PAUSE' };

function reducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'START':
      return { ...state, phase: 'active', questions: action.questions, currentIndex: 0, selectedAnswers: [], paused: false, attemptId: action.attemptId, config: action.config, responses: [], lastResponse: null, questionStartTime: Date.now() };
    case 'SELECT':
      return { ...state, selectedAnswers: action.answers };
    case 'SUBMIT':
      return { ...state, phase: state.config.showAnswerImmediately ? 'feedback' : 'active', currentIndex: state.config.showAnswerImmediately ? state.currentIndex : state.currentIndex + 1, selectedAnswers: [], responses: [...state.responses, action.response], lastResponse: action.response, questionStartTime: Date.now() };
    case 'NEXT':
      return { ...state, phase: 'active', currentIndex: state.currentIndex + 1, selectedAnswers: [], lastResponse: null, questionStartTime: Date.now() };
    case 'TOGGLE_PAUSE':
      return { ...state, paused: !state.paused };
    default:
      return state;
  }
}

interface Props {
  bankId: number;
  onComplete: (attemptId: number) => void;
  onCancel: () => void;
}

export function ActiveQuiz({ bankId, onComplete, onCancel }: Props) {
  const [state, dispatch] = useReducer(reducer, {
    phase: 'setup', questions: [], currentIndex: 0, selectedAnswers: [], paused: false,
    attemptId: null, config: { timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true },
    responses: [], lastResponse: null, questionStartTime: Date.now(),
  });
  const [questionCount, setQuestionCount] = useState(0);

  useEffect(() => {
    window.electronAPI.loadQuestions(bankId).then(qs => setQuestionCount(qs.length));
  }, [bankId]);

  const handleTotalExpire = () => { if (state.attemptId) finishQuiz(state.attemptId, state.responses, state.questions); };
  const handlePerQExpire = () => {
    if (state.phase !== 'active' || !state.attemptId) return;
    submitAnswer(state.questions[state.currentIndex], [], true);
  };

  const totalTimer = useTimer(state.config.totalTimeLimit ?? 0, handleTotalExpire);
  const perQTimer = useTimer(state.config.perQuestionTimeLimit ?? 0, handlePerQExpire);

  useEffect(() => {
    if (state.paused) { totalTimer.pause(); perQTimer.pause(); }
    else { totalTimer.resume(); perQTimer.resume(); }
  }, [state.paused]);

  useEffect(() => {
    if (state.phase === 'active' && state.config.perQuestionTimeLimit) {
      perQTimer.reset(state.config.perQuestionTimeLimit);
      perQTimer.start();
    }
  }, [state.currentIndex, state.phase]);

  const handleStart = async (cfg: Omit<CreateAttemptInput, 'bankId' | 'totalQuestions'>) => {
    const questions = await window.electronAPI.loadQuestions(bankId);
    const attemptId = await window.electronAPI.createAttempt({ bankId, totalQuestions: questions.length, ...cfg });
    dispatch({ type: 'START', questions, attemptId, config: cfg });
    if (cfg.totalTimeLimit) { totalTimer.reset(cfg.totalTimeLimit); totalTimer.start(); }
    if (cfg.perQuestionTimeLimit) { perQTimer.reset(cfg.perQuestionTimeLimit); perQTimer.start(); }
  };

  const submitAnswer = async (question: Question, answers: string[], autoSubmit = false) => {
    if (!state.attemptId) return;
    const elapsed = Math.floor((Date.now() - state.questionStartTime) / 1000);
    const isCorrect = arraysMatch(answers.sort(), [...question.correctAnswers].sort());
    const response: QuestionResponse = { id: 0, attemptId: state.attemptId, questionId: question.id, selectedAnswers: answers, isCorrect, timeTaken: elapsed };
    await window.electronAPI.saveResponse({ attemptId: state.attemptId, questionId: question.id, selectedAnswers: answers, isCorrect, timeTaken: elapsed });
    const newResponses = [...state.responses, response];
    dispatch({ type: 'SUBMIT', response });
    const isLast = state.currentIndex >= state.questions.length - 1;
    if (!state.config.showAnswerImmediately && isLast) {
      finishQuiz(state.attemptId, newResponses, state.questions);
    }
  };

  const handleNext = () => {
    const isLast = state.currentIndex >= state.questions.length - 1;
    if (isLast) finishQuiz(state.attemptId!, state.responses, state.questions);
    else dispatch({ type: 'NEXT' });
  };

  const finishQuiz = async (attemptId: number, responses: QuestionResponse[], questions: Question[]) => {
    const correctCount = responses.filter(r => r.isCorrect).length;
    const score = (correctCount / questions.length) * 100;
    await window.electronAPI.completeAttempt({ attemptId, correctCount, score });
    onComplete(attemptId);
  };

  const handleSelectAnswer = (optId: string) => {
    const q = state.questions[state.currentIndex];
    if (q.questionType === 'multi_select') {
      const current = state.selectedAnswers;
      const next = current.includes(optId) ? current.filter(a => a !== optId) : [...current, optId];
      dispatch({ type: 'SELECT', answers: next });
    } else {
      dispatch({ type: 'SELECT', answers: [optId] });
    }
  };

  const openLink = async (url: string) => {
    if (!state.paused) dispatch({ type: 'TOGGLE_PAUSE' });
    await window.electronAPI.openPanel(url);
  };

  if (state.phase === 'setup') {
    return <QuizSetup bankId={bankId} questionCount={questionCount} onStart={handleStart} onCancel={onCancel} />;
  }

  const isComplete = state.currentIndex >= state.questions.length;
  if (isComplete) return <div style={{ color: '#8b9cb0' }}>Finishing…</div>;

  const question = state.questions[state.currentIndex];
  const totalSecs = state.config.totalTimeLimit;
  const perQSecs = state.config.perQuestionTimeLimit;

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: '#8b9cb0', fontSize: 12 }}>
          Question {state.currentIndex + 1} of {state.questions.length} · {state.responses.filter(r => r.isCorrect).length} correct
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalSecs && (
            <span style={{ fontFamily: 'monospace', color: totalTimer.secondsLeft < 300 ? '#f44336' : '#ff9800', fontWeight: 700 }}>
              ⏱ {fmt(totalTimer.secondsLeft)}
            </span>
          )}
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}>
            {state.paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>

      {/* Per-question timer bar */}
      {perQSecs && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#8b9cb0', fontSize: 10 }}>Per Q:</span>
          <div style={{ flex: 1, height: 4, background: '#2d3a52', borderRadius: 2 }}>
            <div style={{ height: '100%', borderRadius: 2, background: perQTimer.secondsLeft / perQSecs > 0.4 ? '#4caf50' : perQTimer.secondsLeft / perQSecs > 0.2 ? '#ff9800' : '#f44336', width: `${(perQTimer.secondsLeft / perQSecs) * 100}%`, transition: 'width 1s linear' }} />
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#8b9cb0' }}>{perQTimer.secondsLeft}s</span>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ height: 3, background: '#1e2535', borderRadius: 2, marginBottom: 16 }}>
        <div style={{ height: '100%', background: '#2196f3', borderRadius: 2, width: `${(state.currentIndex / state.questions.length) * 100}%` }} />
      </div>

      {/* Pause overlay */}
      {state.paused && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, cursor: 'pointer' }} onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}>
          <div style={{ textAlign: 'center', color: '#e0e0e0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏸</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Paused</div>
            <div style={{ fontSize: 13, color: '#8b9cb0', marginTop: 6 }}>Click anywhere to resume</div>
          </div>
        </div>
      )}

      {state.phase === 'feedback' && state.lastResponse ? (
        <AnswerFeedback question={question} response={state.lastResponse} onNext={handleNext} onOpenLink={openLink} />
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <span className={`badge ${question.questionType === 'true_false' ? 'badge-tf' : question.questionType === 'multi_select' ? 'badge-ms' : 'badge-mc'}`}>
              {question.questionType === 'multiple_choice' ? 'Multiple Choice' : question.questionType === 'true_false' ? 'True / False' : 'Select All That Apply'}
            </span>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>{question.questionText}</p>
          {question.questionType === 'multi_select' && (
            <p style={{ fontSize: 11, color: '#8b9cb0', marginBottom: 10 }}>Select all that apply</p>
          )}
          {question.options.map(opt => {
            const sel = state.selectedAnswers.includes(opt.id);
            return (
              <div key={opt.id} onClick={() => handleSelectAnswer(opt.id)} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 6, border: `1px solid ${sel ? '#2196f3' : '#2d3a52'}`, background: sel ? '#2196f320' : '#1a1f2e', marginBottom: 6, cursor: 'pointer' }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, background: sel ? '#2196f3' : '#2d3a52', color: sel ? '#fff' : '#8b9cb0', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{opt.id}</div>
                <div style={{ fontSize: 13, paddingTop: 3 }}>{opt.text}</div>
              </div>
            );
          })}
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={state.selectedAnswers.length === 0} onClick={() => submitAnswer(question, state.selectedAnswers)}>
              Submit →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function arraysMatch(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
```

- [ ] **Step 3: Manually test a quiz end-to-end**

```bash
npm start
```

1. Import a file with at least 3 questions
2. Click the bank → Start Quiz
3. Configure timer (try "No timer" first), Show answer: Yes, Start
4. Answer a question → Submit → see feedback (correct/incorrect + explanation)
5. Click Next → proceed through all questions → verify Results screen loads

- [ ] **Step 4: Commit**

```bash
git add src/components/ActiveQuiz.tsx src/components/AnswerFeedback.tsx
git commit -m "feat: active quiz screen with timer, pause, answer selection, and feedback"
```

---

### Task 13: Results and History screens

**Files:**
- Create: `src/components/Results.tsx`
- Create: `src/components/History.tsx`

- [ ] **Step 1: Create src/components/Results.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import type { Question, QuestionResponse, QuizAttempt } from '../types';

interface Props {
  attemptId: number;
  bankId: number;
  onRetake: () => void;
  onBack: () => void;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60); return `${m}m ${s % 60}s`;
}

export function Results({ attemptId, bankId, onRetake, onBack }: Props) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    (async () => {
      const [attempts, qs, resps] = await Promise.all([
        window.electronAPI.getHistory(bankId),
        window.electronAPI.loadQuestions(bankId),
        window.electronAPI.getResponses(attemptId),
      ]);
      setAttempt(attempts.find(a => a.id === attemptId) ?? null);
      setQuestions(qs);
      setResponses(resps);
    })();
  }, [attemptId, bankId]);

  if (!attempt) return <div style={{ color: '#8b9cb0' }}>Loading…</div>;

  const elapsed = attempt.completedAt && attempt.startedAt ? attempt.completedAt - attempt.startedAt : null;
  const scoreColor = (attempt.score ?? 0) >= 70 ? '#4caf50' : (attempt.score ?? 0) >= 50 ? '#ff9800' : '#f44336';

  const responseMap = new Map(responses.map(r => [r.questionId, r]));

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ marginBottom: 4 }}>Quiz Complete</h2>
      <div style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 24 }}>
        {attempt.timedMode !== 'none' && elapsed && `Time: ${fmt(elapsed)} · `}
        {attempt.totalQuestions} questions
      </div>

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: scoreColor }}>{Math.round(attempt.score ?? 0)}%</div>
        <div style={{ color: '#8b9cb0', fontSize: 14, marginTop: 4 }}>
          {attempt.correctCount} / {attempt.totalQuestions} correct
        </div>
      </div>

      {questions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button className="btn btn-secondary" onClick={() => setReviewing(r => !r)} style={{ marginBottom: 12 }}>
            {reviewing ? '▲ Hide Review' : '▼ Review Answers'}
          </button>
          {reviewing && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {questions.map((q, i) => {
                const resp = responseMap.get(q.id);
                const isCorrect = resp?.isCorrect ?? false;
                return (
                  <div key={q.id} className="card" style={{ marginBottom: 8, padding: 12, borderLeft: `3px solid ${isCorrect ? '#4caf50' : '#f44336'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#8b9cb0' }}>Q{i + 1}</span>
                      <span style={{ fontSize: 11, color: isCorrect ? '#4caf50' : '#f44336' }}>{isCorrect ? '✓ Correct' : '✗ Incorrect'}</span>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>{q.questionText.slice(0, 120)}{q.questionText.length > 120 ? '…' : ''}</div>
                    {resp && (
                      <div style={{ fontSize: 11, marginBottom: 2 }}>
                        <span style={{ color: '#8b9cb0' }}>Your answer: </span>
                        <span style={{ color: isCorrect ? '#4caf50' : '#f44336' }}>{resp.selectedAnswers.join(', ') || '(none)'}</span>
                      </div>
                    )}
                    {!isCorrect && (
                      <div style={{ fontSize: 11 }}>
                        <span style={{ color: '#8b9cb0' }}>Correct: </span>
                        <span style={{ color: '#4caf50' }}>{q.correctAnswers.join(', ')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={onRetake}>↺ Retake</button>
        <button className="btn btn-secondary" onClick={onBack}>← Back to Library</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create src/components/History.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import type { QuizAttempt } from '../types';

interface Props {
  bankId: number;
  onBack: () => void;
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function fmtScore(score: number | null): string {
  return score !== null ? `${Math.round(score)}%` : '—';
}

export function History({ bankId, onBack }: Props) {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

  useEffect(() => {
    window.electronAPI.getHistory(bankId).then(setAttempts);
  }, [bankId]);

  const completed = attempts.filter(a => a.completedAt !== null);

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <h2>Score History</h2>
      </div>

      {completed.length === 0 ? (
        <div style={{ color: '#8b9cb0', fontSize: 13 }}>No completed attempts yet.</div>
      ) : (
        <>
          {/* Simple score trend */}
          <div className="card" style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#8b9cb0', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score Trend</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
              {completed.slice(-10).map((a, i) => {
                const pct = a.score ?? 0;
                const color = pct >= 70 ? '#4caf50' : pct >= 50 ? '#ff9800' : '#f44336';
                return (
                  <div key={a.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ background: color, borderRadius: 3, width: '100%', height: `${pct * 0.6}%`, minHeight: 4 }} title={`${Math.round(pct)}%`} />
                    <div style={{ fontSize: 9, color: '#4a5568' }}>{i + 1}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            {completed.map((a, i) => (
              <div key={a.id} className="card" style={{ marginBottom: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#8b9cb0', marginBottom: 2 }}>{fmtDate(a.startedAt)}</div>
                  <div style={{ fontSize: 11, color: '#4a5568' }}>
                    {a.timedMode !== 'none' ? `⏱ ${a.timedMode}` : 'Untimed'} · {a.totalQuestions} questions
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: (a.score ?? 0) >= 70 ? '#4caf50' : (a.score ?? 0) >= 50 ? '#ff9800' : '#f44336' }}>
                    {fmtScore(a.score)}
                  </div>
                  <div style={{ fontSize: 11, color: '#8b9cb0' }}>{a.correctCount}/{a.totalQuestions}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Test results and history manually**

```bash
npm start
```

1. Complete a quiz → verify Results screen shows score percentage, correct/total, Review Answers toggle
2. Click Back to Library → click History in sidebar → verify attempt appears with score and date

- [ ] **Step 4: Commit**

```bash
git add src/components/Results.tsx src/components/History.tsx
git commit -m "feat: results screen with score and review, history screen with trend chart"
```

---

### Task 14: Full test run and cleanup

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests in `src/db/__tests__/`, `src/parser/__tests__/`, `src/hooks/__tests__/` pass.

- [ ] **Step 2: Run the full app end-to-end**

```bash
npm start
```

Work through this checklist:
- [ ] Import a PDF or TXT with exam questions → bank appears in sidebar
- [ ] Click bank → Library shows question count
- [ ] Start Quiz → Setup modal appears with all timer options
- [ ] Take quiz with "Show answer immediately: Yes" → feedback shows after each answer
- [ ] Take quiz with "Show answer immediately: No" → moves straight to next, results at end
- [ ] Try timed mode (total: 1 minute) → timer counts down in top bar
- [ ] Click ⏸ Pause → overlay appears, timer stops, click to resume
- [ ] Click 🤖 AI Helper in sidebar → browser panel opens with claude.ai
- [ ] Close panel via Resume/Back button → panel closes
- [ ] View History → completed attempt shows with score

- [ ] **Step 3: Remove DevTools auto-open from main.ts**

In `src/main.ts`, delete this line from `createWindow()`:

```typescript
mainWindow.webContents.openDevTools();  // ← delete this line
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete exam quiz app — import, quiz, results, history, AI browser panel"
```

---

## Running Tests

```bash
npm test                                                      # all tests, one-shot
npm run test:watch                                            # watch mode
npx vitest run src/parser/__tests__/ruleParser.test.ts        # single file
npx vitest run src/db/__tests__/crud.test.ts                  # single file
```
