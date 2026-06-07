# Resume Attempts & Completion-Gated Waterfall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users resume an unfinished quiz attempt, and make Waterfall advance to the next day's questions only after the current day's batch is completed.

**Architecture:** No schema migration. The Waterfall gate is derived from a single query (does a completed attempt exist at the current introduced count?). Resume reuses the per-question responses already persisted plus the attempt's stored config; the session is rebuilt as a front-slice of the bank and re-entered at `responses.length`.

**Tech Stack:** better-sqlite3 (main-process DB), Vitest (`npx vitest run <file>` for a single file; `npm test` rebuilds the native module for node then back for Electron), React + TypeScript renderer, Electron IPC via contextBridge.

**Note on running tests:** Use `npx vitest run <file>` during tasks. If it fails with a better-sqlite3 `NODE_MODULE_VERSION` mismatch, the native module is currently built for Electron — run `npm rebuild better-sqlite3` first, and `npm run rebuild` afterward to restore it for the app.

---

### Task 1: Gate Waterfall advancement on batch completion

**Files:**
- Modify: `src/db/waterfall.ts`
- Modify: `src/db/__tests__/waterfall.test.ts`

- [ ] **Step 1: Update existing new-day tests and add gate tests**

In `src/db/__tests__/waterfall.test.ts`, add this import after the existing imports:

```ts
import { createAttempt, completeAttempt } from '../attempts';
```

Add this helper just below the imports (before the first `describe`):

```ts
function seedCompletedAttempt(bankId: number, totalQuestions: number): void {
  const id = createAttempt({ bankId, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions });
  completeAttempt({ attemptId: id, correctCount: totalQuestions, score: 100 });
}
```

Replace the existing test `'advances introducedCount on a new day'` with this version (it now seeds a completed batch so the gate allows the advance):

```ts
  it('advances introducedCount on a new day when the batch was completed', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    seedCompletedAttempt(bank.id, 10);
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(15);
  });
```

Replace the existing test `'caps at totalQuestions when advancing would exceed it'` with:

```ts
  it('caps at totalQuestions when advancing would exceed it', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 95, '2020-01-01');
    seedCompletedAttempt(bank.id, 95);
    const result = advanceWaterfall(bank.id, 10, 100);
    expect(result.introducedCount).toBe(100);
  });
```

Add these new gate tests inside the `describe('advanceWaterfall', ...)` block:

```ts
  it('does NOT advance on a new day when the batch was not completed', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(10);
    expect(result.lastSessionDate).not.toBe('2020-01-01'); // date still moves to today
  });

  it('does NOT advance when only an incomplete attempt exists at the introduced count', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions: 10 }); // not completed
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(10);
  });

  it('does NOT advance when a completed attempt has a different question count', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    getDb().prepare(
      'INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)'
    ).run(bank.id, 10, '2020-01-01');
    seedCompletedAttempt(bank.id, 7);
    const result = advanceWaterfall(bank.id, 5, 100);
    expect(result.introducedCount).toBe(10);
  });
```

- [ ] **Step 2: Run the tests to verify the new/updated ones fail**

```
npx vitest run src/db/__tests__/waterfall.test.ts
```

Expected: the `does NOT advance...` tests FAIL (current code always advances on a new day). If you hit a better-sqlite3 version error, run `npm rebuild better-sqlite3` and retry.

- [ ] **Step 3: Implement the gate in advanceWaterfall**

In `src/db/waterfall.ts`, replace the new-day branch (the final block of `advanceWaterfall`, currently):

```ts
  const newIntroduced = Math.min(existing.introduced_count + dailyCount, totalQuestions);
  db.prepare(
    'UPDATE waterfall_progress SET introduced_count = ?, last_session_date = ? WHERE bank_id = ?'
  ).run(newIntroduced, today, bankId);
  return { bankId, introducedCount: newIntroduced, lastSessionDate: today };
```

with:

```ts
  // New day: advance only if the current batch was completed. A completed
  // attempt at exactly introduced_count means the day's set was finished.
  const batchComplete = db.prepare(
    'SELECT 1 FROM quiz_attempts WHERE bank_id = ? AND completed_at IS NOT NULL AND total_questions = ? LIMIT 1'
  ).get(bankId, existing.introduced_count) !== undefined;

  const newIntroduced = batchComplete
    ? Math.min(existing.introduced_count + dailyCount, totalQuestions)
    : existing.introduced_count;

  db.prepare(
    'UPDATE waterfall_progress SET introduced_count = ?, last_session_date = ? WHERE bank_id = ?'
  ).run(newIntroduced, today, bankId);
  return { bankId, introducedCount: newIntroduced, lastSessionDate: today };
```

- [ ] **Step 4: Run the tests to verify they pass**

```
npx vitest run src/db/__tests__/waterfall.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```
git add src/db/waterfall.ts src/db/__tests__/waterfall.test.ts
git commit -m "feat: gate waterfall advancement on batch completion"
```

---

### Task 2: getActiveAttempt and deleteAttempt

**Files:**
- Modify: `src/db/attempts.ts`
- Modify: `src/db/__tests__/crud.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/db/__tests__/crud.test.ts`, update the attempts import to include the two new functions:

```ts
import { createAttempt, completeAttempt, getAttemptsForBank, getActiveAttempt, deleteAttempt } from '../attempts';
```

Add this `describe` block at the end of the file:

```ts
describe('active attempt', () => {
  it('returns the most recent incomplete attempt', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const a = createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions: 5 });
    const b = createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions: 5 });
    expect(getActiveAttempt(bank.id)!.id).toBe(b);
    completeAttempt({ attemptId: b, correctCount: 5, score: 100 });
    expect(getActiveAttempt(bank.id)!.id).toBe(a);
  });

  it('returns null when all attempts are completed', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    const a = createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions: 5 });
    completeAttempt({ attemptId: a, correctCount: 5, score: 100 });
    expect(getActiveAttempt(bank.id)).toBeNull();
  });

  it('deleteAttempt removes the attempt and its responses', () => {
    createBank('Test', 't.pdf');
    const [bank] = getAllBanks();
    insertQuestions(bank.id, [
      { question: 'Q', type: 'multiple_choice', options: [{ id: 'A', text: 'x' }], correct_answers: ['A'], explanation: null, links: null },
    ]);
    const [q] = getQuestionsForBank(bank.id);
    const id = createAttempt({ bankId: bank.id, timedMode: 'none', totalTimeLimit: null, perQuestionTimeLimit: null, showAnswerImmediately: true, totalQuestions: 1 });
    saveResponse({ attemptId: id, questionId: q.id, selectedAnswers: ['A'], isCorrect: true, timeTaken: 3 });
    deleteAttempt(id);
    expect(getAttemptsForBank(bank.id)).toHaveLength(0);
    expect(getResponsesForAttempt(id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
npx vitest run src/db/__tests__/crud.test.ts
```

Expected: FAIL — `getActiveAttempt`/`deleteAttempt` are not exported. (Run `npm rebuild better-sqlite3` first if you hit a version error.)

- [ ] **Step 3: Implement the two functions**

In `src/db/attempts.ts`, add at the end of the file:

```ts
export function getActiveAttempt(bankId: number): QuizAttempt | null {
  const row = getDb().prepare(
    'SELECT * FROM quiz_attempts WHERE bank_id = ? AND completed_at IS NULL ORDER BY started_at DESC, id DESC LIMIT 1'
  ).get(bankId) as AttemptRow | undefined;
  return row ? toAttempt(row) : null;
}

export function deleteAttempt(attemptId: number): void {
  getDb().prepare('DELETE FROM quiz_attempts WHERE id = ?').run(attemptId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```
npx vitest run src/db/__tests__/crud.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```
git add src/db/attempts.ts src/db/__tests__/crud.test.ts
git commit -m "feat: add getActiveAttempt and deleteAttempt DB functions"
```

---

### Task 3: IPC wiring for active attempt + delete

**Files:**
- Modify: `src/ipc/channels.ts`
- Modify: `src/main.ts`
- Modify: `src/types.ts`
- Modify: `src/preload.ts`

No unit tests — verified in the renderer (Task 5).

- [ ] **Step 1: Add channels**

In `src/ipc/channels.ts`, add inside the `IPC` object after `ADVANCE_WATERFALL`:

```ts
  GET_ACTIVE_ATTEMPT: 'get-active-attempt',
  DELETE_ATTEMPT: 'delete-attempt',
```

- [ ] **Step 2: Register handlers in main.ts**

In `src/main.ts`, update the attempts import (currently `import { createAttempt, completeAttempt, getAttemptsForBank } from './db/attempts';`) to:

```ts
import { createAttempt, completeAttempt, getAttemptsForBank, getActiveAttempt, deleteAttempt } from './db/attempts';
```

Add these handlers at the end of `registerIpcHandlers()`, before the closing `}`:

```ts
  ipcMain.handle(IPC.GET_ACTIVE_ATTEMPT, (_e, bankId: number) => getActiveAttempt(requirePosInt(bankId, 'bankId')));

  ipcMain.handle(IPC.DELETE_ATTEMPT, (_e, attemptId: number) => deleteAttempt(requirePosInt(attemptId, 'attemptId')));
```

- [ ] **Step 3: Extend ElectronAPI in types.ts**

In `src/types.ts`, add to the `ElectronAPI` interface after the `advanceWaterfall` entry:

```ts
  getActiveAttempt: (bankId: number) => Promise<QuizAttempt | null>;
  deleteAttempt: (attemptId: number) => Promise<void>;
```

- [ ] **Step 4: Expose in preload.ts**

In `src/preload.ts`, add to the `api` object after the `advanceWaterfall` entry:

```ts
  getActiveAttempt: (bankId) => ipcRenderer.invoke(IPC.GET_ACTIVE_ATTEMPT, bankId),
  deleteAttempt: (attemptId) => ipcRenderer.invoke(IPC.DELETE_ATTEMPT, attemptId),
```

- [ ] **Step 5: Verify lint is clean**

```
npm run lint
```

Expected: no new errors (pre-existing errors in `src/parser/fileExtractor.ts` are unrelated).

- [ ] **Step 6: Commit**

```
git add src/ipc/channels.ts src/main.ts src/types.ts src/preload.ts
git commit -m "feat: wire getActiveAttempt / deleteAttempt IPC"
```

---

### Task 4: resumePosition helper + RESUME reducer action

**Files:**
- Modify: `src/components/ActiveQuiz.tsx`
- Modify: `src/components/__tests__/activeQuizReducer.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/components/__tests__/activeQuizReducer.test.ts`, update the import to include `resumePosition`:

```ts
import { reducer, resumePosition } from '../ActiveQuiz';
```

Add these tests at the end of the file (inside the top-level `describe` or as a new `describe`):

```ts
describe('resumePosition', () => {
  it('returns the next unanswered index mid-quiz', () => {
    expect(resumePosition(10, 4)).toEqual({ currentIndex: 4, complete: false });
  });
  it('marks complete when all questions answered', () => {
    expect(resumePosition(10, 10)).toEqual({ currentIndex: 10, complete: true });
  });
  it('marks complete when response count exceeds total', () => {
    expect(resumePosition(10, 11)).toEqual({ currentIndex: 10, complete: true });
  });
});

describe('RESUME action', () => {
  it('enters active phase with the provided index and responses', () => {
    const responses = [{ questionId: 1, selectedAnswers: ['A'], isCorrect: true, timeTaken: 5 }];
    const next = reducer(baseState, { type: 'RESUME', questions: [], attemptId: 7, config: baseConfig, responses, currentIndex: 1 });
    expect(next.phase).toBe('active');
    expect(next.currentIndex).toBe(1);
    expect(next.attemptId).toBe(7);
    expect(next.responses).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
npx vitest run src/components/__tests__/activeQuizReducer.test.ts
```

Expected: FAIL — `resumePosition` is not exported and `RESUME` is not handled.

- [ ] **Step 3: Add the helper and the RESUME action**

In `src/components/ActiveQuiz.tsx`, add the `RESUME` variant to the `QuizAction` union (after the `START` line):

```ts
  | { type: 'RESUME'; questions: Question[]; attemptId: number; config: QuizConfig; responses: StoredResponse[]; currentIndex: number }
```

Add the `RESUME` case to the `reducer` switch (right after the `START` case):

```ts
    case 'RESUME':
      return { ...state, phase: 'active', questions: action.questions, currentIndex: action.currentIndex, selectedAnswers: [], paused: false, attemptId: action.attemptId, config: action.config, responses: action.responses, lastResponse: null, questionStartTime: Date.now() };
```

Add the exported helper at the very bottom of the file (after the `arraysMatchSorted` helper):

```ts
export function resumePosition(totalQuestions: number, responseCount: number): { currentIndex: number; complete: boolean } {
  if (responseCount >= totalQuestions) return { currentIndex: totalQuestions, complete: true };
  return { currentIndex: responseCount, complete: false };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```
npx vitest run src/components/__tests__/activeQuizReducer.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```
git add src/components/ActiveQuiz.tsx src/components/__tests__/activeQuizReducer.test.ts
git commit -m "feat: add resumePosition helper and RESUME reducer action"
```

---

### Task 5: ActiveQuiz resume flow (prompt + reconstruction)

**Files:**
- Modify: `src/components/ActiveQuiz.tsx`

No new unit tests (renderer/Electron integration). Verified manually below.

- [ ] **Step 1: Import the QuizAttempt type**

In `src/components/ActiveQuiz.tsx`, change line 5:

```ts
import type { Question, QuizStartConfig, TimedMode } from '../types';
```

to:

```ts
import type { Question, QuizStartConfig, TimedMode, QuizAttempt } from '../types';
```

- [ ] **Step 2: Add resume state**

In the `ActiveQuiz` component, just after the `const [questionCount, setQuestionCount] = useState(0);` line, add:

```ts
  const [checkingResume, setCheckingResume] = useState(true);
  const [resumeAttempt, setResumeAttempt] = useState<QuizAttempt | null>(null);
  const [resumeAnswered, setResumeAnswered] = useState(0);
```

- [ ] **Step 3: Check for an active attempt on mount**

Replace the existing mount effect:

```ts
  useEffect(() => {
    window.electronAPI.loadQuestions(bankId).then(qs => setQuestionCount(qs.length));
  }, [bankId]);
```

with:

```ts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qs = await window.electronAPI.loadQuestions(bankId);
      if (!cancelled) setQuestionCount(qs.length);
      const active = await window.electronAPI.getActiveAttempt(bankId);
      if (cancelled) return;
      if (active) {
        const saved = await window.electronAPI.getResponses(active.id);
        if (cancelled) return;
        setResumeAttempt(active);
        setResumeAnswered(saved.length);
      }
      setCheckingResume(false);
    })();
    return () => { cancelled = true; };
  }, [bankId]);
```

- [ ] **Step 4: Add Continue and Start New handlers**

In the `ActiveQuiz` component, add these handlers just above `handleStart`:

```ts
  const handleContinue = async () => {
    if (!resumeAttempt) return;
    const all = await window.electronAPI.loadQuestions(bankId);
    const questions = all.slice(0, resumeAttempt.totalQuestions);
    const saved = await window.electronAPI.getResponses(resumeAttempt.id);
    const responses: StoredResponse[] = saved.map(r => ({
      questionId: r.questionId,
      selectedAnswers: r.selectedAnswers,
      isCorrect: r.isCorrect,
      timeTaken: r.timeTaken,
    }));
    const { currentIndex, complete } = resumePosition(questions.length, responses.length);
    const config: QuizConfig = {
      timedMode: resumeAttempt.timedMode,
      totalTimeLimit: resumeAttempt.totalTimeLimit,
      perQuestionTimeLimit: resumeAttempt.perQuestionTimeLimit,
      showAnswerImmediately: resumeAttempt.showAnswerImmediately,
    };
    if (complete) {
      finishQuiz(resumeAttempt.id, responses, questions);
      return;
    }
    dispatch({ type: 'RESUME', questions, attemptId: resumeAttempt.id, config, responses, currentIndex });
    if (config.totalTimeLimit) { totalTimer.reset(config.totalTimeLimit); totalTimer.start(); }
  };

  const handleStartNew = async () => {
    if (resumeAttempt) await window.electronAPI.deleteAttempt(resumeAttempt.id);
    setResumeAttempt(null);
  };
```

- [ ] **Step 5: Render the resume prompt before setup**

In `src/components/ActiveQuiz.tsx`, find the render branch:

```ts
  if (state.phase === 'setup') {
    return <QuizSetup bankId={bankId} questionCount={questionCount} onStart={handleStart} onCancel={onCancel} />;
  }
```

and insert this immediately ABOVE it:

```ts
  if (checkingResume) {
    return <div style={{ color: '#8b9cb0' }}>Loading…</div>;
  }

  if (state.phase === 'setup' && resumeAttempt) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h2>Unfinished quiz</h2>
          <p style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 20 }}>
            You answered {resumeAnswered} of {resumeAttempt.totalQuestions} questions. Pick up where you left off?
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleContinue}>▶ Continue</button>
            <button className="btn btn-secondary" onClick={handleStartNew}>↻ Start New</button>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 6: Run the full test suite and lint**

```
npm test
npm run lint
```

Expected: all tests PASS; no new lint errors. (`npm test` rebuilds the native module for node and back for Electron automatically.)

- [ ] **Step 7: Manual smoke test — resume**

Run `npm start`. Import or open a bank, start a Normal quiz, answer 2–3 questions, then close the quiz (Cancel/back to library). Start the quiz again on that bank. Verify:
- The "Unfinished quiz" prompt appears showing "You answered N of M questions."
- **Continue** resumes at the next unanswered question, with the prior correct-count preserved.
- Finishing it lands on the Results screen.

- [ ] **Step 8: Manual smoke test — Start New discards**

Start a quiz, answer 1 question, go back. Start again → on the prompt click **Start New**. Verify:
- Quiz Setup appears (fresh start).
- After this, going back and starting again does NOT offer to resume the discarded attempt (it was deleted).

- [ ] **Step 9: Manual smoke test — Waterfall start-over**

On a bank, start a **Waterfall** session (daily 5), answer only 2, go back. Without completing, simulate the next day by editing the row's date: not required for the smoke test — instead verify the prompt offers Continue/Start New, and that **Continue** finishes the same 5-question batch. (The date-gated advance is covered by the Task 1 unit tests.)

- [ ] **Step 10: Commit**

```
git add src/components/ActiveQuiz.tsx
git commit -m "feat: resume-prompt flow with continue/start-new/reconstruction"
```
