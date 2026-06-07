# Resume Attempts & Completion-Gated Waterfall — Design Spec

**Date:** 2026-06-07
**Status:** Approved

---

## Overview

Two related features for ExamDump's quiz flow:

1. **Resume an in-progress attempt** — when a bank has an unfinished quiz attempt, the app detects it and offers to continue where you left off, instead of always starting fresh. Applies to all modes, any day.
2. **Completion-gated waterfall advancement** — a waterfall bank advances to the next day's new questions only if the previous day's batch was actually *completed*. If a batch wasn't finished, the next day re-presents the same batch ("start over") until it's completed. Gaps between days are fine; it resumes at the introduced position.

Both features reuse data already persisted today (per-question responses, and `quiz_attempts.completed_at`). **No schema migration is required.**

---

## Behaviour Rules

### Resume

| Situation | Result |
|---|---|
| Start Quiz, no unfinished attempt for bank | Go straight to Quiz Setup (current behaviour). |
| Start Quiz, unfinished attempt exists | Show resume prompt: **Continue** / **Start New** / **Cancel**. |
| Continue | Rebuild the session from the attempt and jump to the next unanswered question. |
| Start New | Discard the unfinished attempt (and its responses), then go to Quiz Setup. |
| Cancel | Return to library; the unfinished attempt is left intact (resumable later). |

- "Completed" means: answered through to the end of the session's question set, regardless of score.
- On resume, timers **restart fresh** from the attempt's stored limits (no elapsed-time persistence).
- If multiple unfinished attempts somehow exist, the **most recent** (highest `started_at`) is used.

### Waterfall advancement

| Situation | Result |
|---|---|
| First ever waterfall session | Introduce `min(dailyCount, total)`; set date = today. |
| Same calendar day as last | No change; continue today's batch. |
| New day, current batch **was completed** | Advance: `introduced = min(introduced + dailyCount, total)`; date = today. |
| New day, current batch **not completed** | `introduced` unchanged ("start over"); date = today. |
| All questions introduced (cap) | Stays at cap; re-presents full bank daily. |

---

## Data Model

**No schema changes.** Existing tables provide everything:

- `quiz_attempts.completed_at` — `NULL` = in progress; non-null = completed.
- `quiz_attempts.total_questions` — the size of that session's question set (a front-slice of the bank).
- `quiz_attempts` config columns — `timed_mode`, `total_time_limit`, `per_question_time_limit`, `show_answer_immediately`.
- `question_responses` — saved per-question during the quiz; `ON DELETE CASCADE` from `quiz_attempts` already in place.

**Completion signal (derived):** a waterfall batch is "completed" iff a completed attempt exists for the bank whose `total_questions` equals the current `introduced_count`. Normal-mode quizzes always span the full bank, so their count only equals `introduced_count` at the cap — where advancement is moot — so there are no false positives.

---

## DB Layer

### `src/db/waterfall.ts` — gate `advanceWaterfall`

```ts
export function advanceWaterfall(bankId: number, dailyCount: number, totalQuestions: number): WaterfallProgress {
  const today = todayISO();
  const db = getDb();
  const existing = db.prepare('SELECT * FROM waterfall_progress WHERE bank_id = ?').get(bankId) as WaterfallRow | undefined;

  if (!existing) {
    const introducedCount = Math.min(dailyCount, totalQuestions);
    db.prepare('INSERT INTO waterfall_progress (bank_id, introduced_count, last_session_date) VALUES (?, ?, ?)')
      .run(bankId, introducedCount, today);
    return { bankId, introducedCount, lastSessionDate: today };
  }

  if (existing.last_session_date === today) {
    return toProgress(existing);
  }

  // New day: advance only if the current batch was completed.
  const batchComplete = db.prepare(
    'SELECT 1 FROM quiz_attempts WHERE bank_id = ? AND completed_at IS NOT NULL AND total_questions = ? LIMIT 1'
  ).get(bankId, existing.introduced_count) !== undefined;

  const newIntroduced = batchComplete
    ? Math.min(existing.introduced_count + dailyCount, totalQuestions)
    : existing.introduced_count;

  db.prepare('UPDATE waterfall_progress SET introduced_count = ?, last_session_date = ? WHERE bank_id = ?')
    .run(newIntroduced, today, bankId);
  return { bankId, introducedCount: newIntroduced, lastSessionDate: today };
}
```

### `src/db/attempts.ts` — two new functions

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

---

## IPC

### New channels — `src/ipc/channels.ts`

```ts
GET_ACTIVE_ATTEMPT: 'get-active-attempt',
DELETE_ATTEMPT:     'delete-attempt',
```

### Handlers — `src/main.ts`

```ts
ipcMain.handle(IPC.GET_ACTIVE_ATTEMPT, (_e, bankId: number) => getActiveAttempt(requirePosInt(bankId, 'bankId')));
ipcMain.handle(IPC.DELETE_ATTEMPT, (_e, attemptId: number) => deleteAttempt(requirePosInt(attemptId, 'attemptId')));
```

### Preload — `src/preload.ts`

```ts
getActiveAttempt: (bankId) => ipcRenderer.invoke(IPC.GET_ACTIVE_ATTEMPT, bankId),
deleteAttempt: (attemptId) => ipcRenderer.invoke(IPC.DELETE_ATTEMPT, attemptId),
```

### ElectronAPI — `src/types.ts`

```ts
getActiveAttempt: (bankId: number) => Promise<QuizAttempt | null>;
deleteAttempt: (attemptId: number) => Promise<void>;
```

No new data types are introduced; `getActiveAttempt` returns the existing `QuizAttempt`.

---

## Resume Reconstruction (renderer)

A small **pure helper** (unit-testable without Electron, mirroring the existing reducer test pattern) computes the resume entry point:

```ts
// Given the attempt's questions (front-slice) and its saved responses,
// returns the index of the next unanswered question and the prior responses.
export function resumePosition(totalQuestions: number, responseCount: number): { currentIndex: number; complete: boolean } {
  if (responseCount >= totalQuestions) return { currentIndex: totalQuestions, complete: true };
  return { currentIndex: responseCount, complete: false };
}
```

**Reconstruction steps when Continue is chosen:**
1. Load all bank questions (ordered by `order_index`); `questions = all.slice(0, attempt.totalQuestions)`.
2. Load responses via `getResponses(attempt.id)`; map to the reducer's `StoredResponse[]`.
3. `currentIndex = responses.length` (next unanswered); rebuild "correct so far" from `isCorrect` flags.
4. Config comes from the attempt row (`timedMode`, limits, `showAnswerImmediately`).
5. Restart timers fresh from those limits.
6. Dispatch a `RESUME` action into the existing reducer with `{ questions, attemptId, config, responses, currentIndex }`.
7. If `resumePosition(...).complete` is true, finalize immediately via the existing `completeAttempt` path.

The resumed session writes responses into the **same** attempt and finishes via the existing `completeAttempt`, which is exactly the signal the waterfall gate queries.

---

## UI Flow — `src/components/ActiveQuiz.tsx`

A new phase `resume-prompt` runs before `setup`:

- On mount, call `getActiveAttempt(bankId)`.
  - **null** → phase `setup` (unchanged).
  - **found** → phase `resume-prompt`, showing:

    > **Unfinished quiz** — You answered **{answered} of {total}** questions. Pick up where you left off?
    > **[▶ Continue]** **[↻ Start New]** **[Cancel]**

  where `answered` = response count for the active attempt, `total` = its `total_questions`.

- **Continue** → run reconstruction → dispatch `RESUME` → phase `active`.
- **Start New** → `deleteAttempt(activeId)` → phase `setup`.
- **Cancel** → `onCancel()` (back to library; attempt left intact).

The existing `START` action path (fresh attempts) and the waterfall slicing in `handleStart` are unchanged. The new `RESUME` reducer action sets `phase: 'active'` with the reconstructed state.

---

## Testing

**`src/db/__tests__/waterfall.test.ts`** (extend):
- New day with a completed attempt at the introduced count → advances.
- New day with only an *incomplete* attempt at the introduced count → does **not** advance (stays, "start over").
- New day with a completed attempt at a *different* count → does not advance.
- Same-day call is unchanged regardless of completion.

**`src/db/__tests__/crud.test.ts`** (extend):
- `getActiveAttempt` returns the most recent incomplete attempt; returns null when all are completed; ignores completed attempts.
- `deleteAttempt` removes the attempt and cascade-deletes its `question_responses`.

**Resume helper test** (new, e.g. alongside the reducer test):
- `resumePosition(10, 4)` → `{ currentIndex: 4, complete: false }`.
- `resumePosition(10, 10)` → `{ currentIndex: 10, complete: true }`.
- `resumePosition(10, 11)` → `{ currentIndex: 10, complete: true }`.

---

## Files Changed / Created

| File | Change |
|---|---|
| `src/db/waterfall.ts` | Gate `advanceWaterfall` on batch completion |
| `src/db/attempts.ts` | Add `getActiveAttempt`, `deleteAttempt` |
| `src/ipc/channels.ts` | Add `GET_ACTIVE_ATTEMPT`, `DELETE_ATTEMPT` |
| `src/main.ts` | Register two handlers (validated) |
| `src/preload.ts` | Expose two methods |
| `src/types.ts` | Extend `ElectronAPI` |
| `src/components/ActiveQuiz.tsx` | `resume-prompt` phase, `RESUME` action, reconstruction, `resumePosition` helper |
| `src/db/__tests__/waterfall.test.ts` | Gate tests |
| `src/db/__tests__/crud.test.ts` | `getActiveAttempt` / `deleteAttempt` tests |
| `src/components/__tests__/*` | `resumePosition` helper tests |

---

## Out of Scope

- Persisting elapsed timer state across resume (timers restart fresh by design).
- Keeping abandoned attempts in History (they are discarded on Start New).
- Shuffling within a session (sessions remain deterministic front-slices, which is what makes reconstruction reliable).
- A `quiz_mode` column on attempts (the completion gate is derived; not needed).
