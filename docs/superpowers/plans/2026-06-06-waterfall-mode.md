# Waterfall Quiz Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Waterfall quiz mode that introduces N new questions per day on top of a full cumulative re-test of all previously introduced questions, with progress persisted per bank in SQLite.

**Architecture:** A new `waterfall_progress` SQLite table (one row per bank) tracks how many questions have been introduced and the last session date. Two new IPC calls thread this state from the main process to the renderer. `QuizSetup` gains a Call Mode selector; `ActiveQuiz.handleStart` slices the question list for Waterfall sessions. Normal mode is completely unaffected.

**Tech Stack:** better-sqlite3 (main process DB), Vitest (unit tests — run with `npm test`), React + TypeScript (renderer), Electron IPC via contextBridge (already in place).

---

### Task 1: Schema — add `waterfall_progress` table

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe('createDb', ...)` in `src/db/__tests__/schema.test.ts`:

```ts
it('creates waterfall_progress table', () => {
  const db = createDb(':memory:');
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all() as { name: string }[];
  expect(tables.map(t => t.name)).toContain('waterfall_progress');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
npx vitest run src/db/__tests__/schema.test.ts
```

Expected: FAIL — `expect(received).toContain('waterfall_progress')`

- [ ] **Step 3: Add the table to runMigrations**

In `src/db/schema.ts`, inside the `db.exec(`` ` `` ... `` ` ``)` template string in `runMigrations`, append this block after the `question_responses` table definition (before the closing backtick):

```sql
    CREATE TABLE IF NOT EXISTS waterfall_progress (
      bank_id INTEGER PRIMARY KEY REFERENCES question_banks(id) ON DELETE CASCADE,
      introduced_count INTEGER NOT NULL,
      last_session_date TEXT NOT NULL
    );
```

- [ ] **Step 4: Run the tests to verify they pass**

```
npx vitest run src/db/__tests__/schema.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```
git add src/db/schema.ts src/db/__tests__/schema.test.ts
git commit -m "feat: add waterfall_progress table to schema"
```

---

### Task 2: Types — WaterfallProgress, QuizModeConfig, QuizStartConfig

**Files:**
- Modify: `src/types.ts`

No unit tests — pure TypeScript type declarations. Do NOT add the `ElectronAPI` extension here; that comes in Task 4 alongside the preload changes so every commit stays TypeScript-clean.

- [ ] **Step 1: Add WaterfallProgress**

In `src/types.ts`, after the `CompleteAttemptInput` interface (around line 98), add:

```ts
export interface WaterfallProgress {
  bankId: number;
  introducedCount: number;
  lastSessionDate: string; // 'YYYY-MM-DD'
}
```

- [ ] **Step 2: Add QuizModeConfig and QuizStartConfig**

Immediately after `WaterfallProgress`, add:

```ts
export type QuizModeConfig =
  | { mode: 'normal' }
  | { mode: 'waterfall'; dailyCount: number };

export type QuizStartConfig = Omit<CreateAttemptInput, 'bankId' | 'totalQuestions'> & {
  quizMode: QuizModeConfig;
};
```

- [ ] **Step 3: Verify lint is clean**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/types.ts
git commit -m "feat: add WaterfallProgress, QuizModeConfig, QuizStartConfig types"
```

---

### Task 3: DB module — src/db/waterfall.ts

**Files:**
- Create: `src/db/waterfall.ts`
- Create: `src/db/__tests__/waterfall.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/db/__tests__/waterfall.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getDb } from '../schema';
import { createBank, getAllBanks } from '../banks';
import { getWaterfallProgress, advanceWaterfall } from '../waterfall';

beforeEach(() => { initDb(':memory:'); });

describe('getWaterfallProgress', () => {
  it('returns null when no record exists', () => {
    expect(getWaterfallProgress(999)).toBeNull();
  });

  it('returns the stored progress when a record exists', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 20, '2026-01-01');
    const p = getWaterfallProgress(bank.id);
    expect(p).not.toBeNull();
    expect(p!.introducedCount).toBe(20);
    expect(p!.lastSessionDate).toBe('2026-01-01');
    expect(p!.bankId).toBe(bank.id);
  });
});

describe('advanceWaterfall', () => {
  it('inserts a new record on first call', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const result = advanceWaterfall(bank.id, 10, 100);
    expect(result.introducedCount).toBe(10);
    expect(result.bankId).toBe(bank.id);
    expect(typeof result.lastSessionDate).toBe('string');
  });

  it('caps introducedCount at totalQuestions on first call', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const result = advanceWaterfall(bank.id, 50, 30);
    expect(result.introducedCount).toBe(30);
  });

  it('returns unchanged record when called twice on the same day', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const first = advanceWaterfall(bank.id, 10, 100);
    const second = advanceWaterfall(bank.id, 10, 100);
    expect(second.introducedCount).toBe(first.introducedCount);
    expect(second.lastSessionDate).toBe(first.lastSessionDate);
  });

  it('advances introducedCount on a new day', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(15);
  });

  it('caps at totalQuestions when advancing would exceed it', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 95, '2020-01-01');
    const result = advanceWaterfall(bank.id, 10, 100);
    expect(result.introducedCount).toBe(100);
  });

  it('stays at totalQuestions when all questions already introduced', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 100, '2020-01-01');
    const result = advanceWaterfall(bank.id, 10, 100);
    expect(result.introducedCount).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
npx vitest run src/db/__tests__/waterfall.test.ts
```

Expected: FAIL — `Cannot find module '../waterfall'`

- [ ] **Step 3: Implement src/db/waterfall.ts**

Create `src/db/waterfall.ts`:

```ts
import type { WaterfallProgress } from '../types';
import { getDb } from './schema';

interface WaterfallRow {
  bank_id: number;
  introduced_count: number;
  last_session_date: string;
}

function toProgress(r: WaterfallRow): WaterfallProgress {
  return {
    bankId: r.bank_id,
    introducedCount: r.introduced_count,
    lastSessionDate: r.last_session_date,
  };
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getWaterfallProgress(bankId: number): WaterfallProgress | null {
  const row = getDb()
    .prepare('SELECT * FROM waterfall_progress WHERE bank_id = ?')
    .get(bankId) as WaterfallRow | undefined;
  return row ? toProgress(row) : null;
}

export function advanceWaterfall(bankId: number, dailyCount: number, totalQuestions: number): WaterfallProgress {
  const today = todayISO();
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM waterfall_progress WHERE bank_id = ?')
    .get(bankId) as WaterfallRow | undefined;

  if (!existing) {
    const introducedCount = Math.min(dailyCount, totalQuestions);
    db.prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bankId, introducedCount, today);
    return { bankId, introducedCount, lastSessionDate: today };
  }

  if (existing.last_session_date === today) {
    return toProgress(existing);
  }

  const newIntroduced = Math.min(existing.introduced_count + dailyCount, totalQuestions);
  db.prepare(
    'UPDATE waterfall_progress SET introduced_count = ?, last_session_date = ? WHERE bank_id = ?'
  ).run(newIntroduced, today, bankId);
  return { bankId, introducedCount: newIntroduced, lastSessionDate: today };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```
npx vitest run src/db/__tests__/waterfall.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```
git add src/db/waterfall.ts src/db/__tests__/waterfall.test.ts
git commit -m "feat: add waterfall DB module (getWaterfallProgress, advanceWaterfall)"
```

---

### Task 4: IPC wiring — channels, main, preload, ElectronAPI

**Files:**
- Modify: `src/ipc/channels.ts`
- Modify: `src/main.ts`
- Modify: `src/preload.ts`
- Modify: `src/types.ts` (ElectronAPI extension — added here so preload compiles cleanly)

No unit tests — IPC wiring is verified by running the app in Task 6.

- [ ] **Step 1: Add channels**

In `src/ipc/channels.ts`, add inside the `IPC` object after `RESIZE_PANEL`:

```ts
  GET_WATERFALL_PROGRESS: 'get-waterfall-progress',
  ADVANCE_WATERFALL: 'advance-waterfall',
```

- [ ] **Step 2: Register handlers in main.ts**

Add the import on line 9 (after the existing `responses` import):

```ts
import { getWaterfallProgress, advanceWaterfall } from './db/waterfall';
```

Add these two handlers at the end of `registerIpcHandlers()`, before the closing `}`:

```ts
  ipcMain.handle(IPC.GET_WATERFALL_PROGRESS, (_e, bankId: number) =>
    getWaterfallProgress(requirePosInt(bankId, 'bankId'))
  );

  ipcMain.handle(IPC.ADVANCE_WATERFALL, (_e, bankId: number, dailyCount: number, totalQuestions: number) =>
    advanceWaterfall(
      requirePosInt(bankId, 'bankId'),
      requirePosInt(dailyCount, 'dailyCount'),
      requirePosInt(totalQuestions, 'totalQuestions')
    )
  );
```

- [ ] **Step 3: Extend ElectronAPI in types.ts**

In `src/types.ts`, add these two entries to the `ElectronAPI` interface after `exportBank`:

```ts
  getWaterfallProgress: (bankId: number) => Promise<WaterfallProgress | null>;
  advanceWaterfall: (bankId: number, dailyCount: number, totalQuestions: number) => Promise<WaterfallProgress>;
```

- [ ] **Step 4: Expose in preload.ts**

In `src/preload.ts`, add these two entries to the `api` object after `exportBank`:

```ts
  getWaterfallProgress: (bankId) => ipcRenderer.invoke(IPC.GET_WATERFALL_PROGRESS, bankId),
  advanceWaterfall: (bankId, dailyCount, totalQuestions) =>
    ipcRenderer.invoke(IPC.ADVANCE_WATERFALL, bankId, dailyCount, totalQuestions),
```

- [ ] **Step 5: Verify lint is clean**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add src/ipc/channels.ts src/main.ts src/preload.ts src/types.ts
git commit -m "feat: wire Waterfall IPC (get-waterfall-progress, advance-waterfall)"
```

---

### Task 5: QuizSetup UI — Call Mode selector

**Files:**
- Modify: `src/components/QuizSetup.tsx`

No new unit tests (this component interacts with Electron IPC; the existing pattern only tests pure reducers). Verified manually in Task 6.

- [ ] **Step 1: Replace the import and Props/state block**

Replace lines 1–16 of `src/components/QuizSetup.tsx` (the import through the opening of the function body) with:

```tsx
import React, { useState, useEffect } from 'react';
import type { TimedMode, QuizStartConfig, WaterfallProgress } from '../types';

interface Props {
  bankId: number;
  questionCount: number;
  onStart: (config: QuizStartConfig) => void;
  onCancel: () => void;
}

export function QuizSetup({ bankId, questionCount, onStart, onCancel }: Props) {
  const [callMode, setCallMode] = useState<'normal' | 'waterfall'>('normal');
  const [dailyCount, setDailyCount] = useState('10');
  const [waterfallProgress, setWaterfallProgress] = useState<WaterfallProgress | null>(null);
  const [timedMode, setTimedMode] = useState<TimedMode>('none');
  const [totalMinutes, setTotalMinutes] = useState('90');
  const [perQuestionSeconds, setPerQuestionSeconds] = useState('60');
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(true);

  useEffect(() => {
    window.electronAPI.getWaterfallProgress(bankId).then(setWaterfallProgress);
  }, [bankId]);
```

- [ ] **Step 2: Replace handleStart**

Replace the existing `handleStart` function (lines 17–30) with:

```tsx
  const handleStart = () => {
    const totalLimit = (timedMode === 'total' || timedMode === 'both')
      ? parseInt(totalMinutes, 10) * 60 : null;
    const perQLimit = (timedMode === 'per_question' || timedMode === 'both')
      ? parseInt(perQuestionSeconds, 10) : null;

    if (totalLimit !== null && !Number.isFinite(totalLimit)) return;
    if (perQLimit !== null && !Number.isFinite(perQLimit)) return;

    const quizMode: QuizStartConfig['quizMode'] = callMode === 'waterfall'
      ? { mode: 'waterfall', dailyCount: Math.max(1, parseInt(dailyCount, 10) || 10) }
      : { mode: 'normal' };

    onStart({ timedMode, totalTimeLimit: totalLimit, perQuestionTimeLimit: perQLimit, showAnswerImmediately, quizMode });
  };
```

- [ ] **Step 3: Add the Call Mode section to the JSX**

In the `return (...)`, immediately after the `<p style=...>{questionCount} questions</p>` line, insert:

```tsx
        <div className="form-row">
          <label className="form-label">Call Mode</label>
          <div className="radio-group">
            {(['normal', 'waterfall'] as const).map(val => (
              <div
                key={val}
                className={`radio-option${callMode === val ? ' selected' : ''}`}
                onClick={() => setCallMode(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${callMode === val ? '#2196f3' : '#4a5568'}`,
                  background: callMode === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {val === 'normal' ? 'Normal' : 'Waterfall'}
              </div>
            ))}
          </div>
        </div>

        {callMode === 'waterfall' && (
          <div className="form-row">
            <label className="form-label">Daily questions</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max={questionCount}
              value={dailyCount}
              onChange={e => setDailyCount(e.target.value)}
            />
            {waterfallProgress && waterfallProgress.introducedCount < questionCount && (
              <p style={{ color: '#8b9cb0', fontSize: 11, marginTop: 6 }}>
                {waterfallProgress.introducedCount} of {questionCount} introduced &nbsp;·&nbsp; last session {formatDate(waterfallProgress.lastSessionDate)}
              </p>
            )}
            {waterfallProgress && waterfallProgress.introducedCount >= questionCount && (
              <p style={{ color: '#8b9cb0', fontSize: 11, marginTop: 6 }}>
                All questions introduced — daily full review
              </p>
            )}
          </div>
        )}
```

- [ ] **Step 4: Add the formatDate helper at the bottom of the file**

After the closing `}` of `QuizSetup`, add:

```tsx
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 5: Verify lint is clean**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add src/components/QuizSetup.tsx
git commit -m "feat: add Call Mode (Normal/Waterfall) selector to QuizSetup"
```

---

### Task 6: ActiveQuiz — branch handleStart on quiz mode

**Files:**
- Modify: `src/components/ActiveQuiz.tsx`

- [ ] **Step 1: Update the import line**

In `src/components/ActiveQuiz.tsx`, replace line 5:

```ts
import type { Question, QuestionResponse, CreateAttemptInput, TimedMode } from '../types';
```

with:

```ts
import type { Question, QuestionResponse, QuizStartConfig } from '../types';
```

- [ ] **Step 2: Replace handleStart**

Replace the existing `handleStart` function (lines 125–131):

```ts
  const handleStart = async (cfg: QuizStartConfig) => {
    const allQuestions = await window.electronAPI.loadQuestions(bankId);
    let questions: Question[];

    if (cfg.quizMode.mode === 'waterfall') {
      const progress = await window.electronAPI.advanceWaterfall(
        bankId,
        cfg.quizMode.dailyCount,
        allQuestions.length
      );
      questions = allQuestions.slice(0, progress.introducedCount);
    } else {
      questions = allQuestions;
    }

    const attemptId = await window.electronAPI.createAttempt({
      bankId,
      totalQuestions: questions.length,
      timedMode: cfg.timedMode,
      totalTimeLimit: cfg.totalTimeLimit,
      perQuestionTimeLimit: cfg.perQuestionTimeLimit,
      showAnswerImmediately: cfg.showAnswerImmediately,
    });

    dispatch({ type: 'START', questions, attemptId, config: {
      timedMode: cfg.timedMode,
      totalTimeLimit: cfg.totalTimeLimit,
      perQuestionTimeLimit: cfg.perQuestionTimeLimit,
      showAnswerImmediately: cfg.showAnswerImmediately,
    }});

    if (cfg.totalTimeLimit) { totalTimer.reset(cfg.totalTimeLimit); totalTimer.start(); }
  };
```

- [ ] **Step 3: Run the full test suite**

```
npm test
```

Expected: all tests PASS (schema, crud, waterfall, reducer, parser tests).

- [ ] **Step 4: Run lint**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test — Normal mode unchanged**

Run `npm start`. Open any bank. Click "Start Quiz". Verify:
- "Call Mode" section appears at the top with Normal selected by default.
- Starting in Normal mode launches all questions exactly as before.
- Score and Results screen work normally.

- [ ] **Step 6: Manual smoke test — Waterfall first session**

With the app running:
- Open QuizSetup, select Waterfall, set Daily questions to 5.
- No progress line appears (no prior session for this bank).
- Click Start → only 5 questions load (not the full bank).
- Complete the quiz — Results shows 5 total questions and a score out of 5.

- [ ] **Step 7: Manual smoke test — Waterfall same-day repeat**

- Open QuizSetup again for the same bank, select Waterfall.
- Progress line shows: `5 of N introduced · last session [today's date]`.
- Click Start → still 5 questions (same-day, no advance).

- [ ] **Step 8: Commit**

```
git add src/components/ActiveQuiz.tsx
git commit -m "feat: branch ActiveQuiz handleStart on quiz mode for Waterfall slicing"
```
