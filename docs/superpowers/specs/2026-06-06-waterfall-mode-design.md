# Waterfall Quiz Mode — Design Spec

**Date:** 2026-06-06  
**Status:** Approved

---

## Overview

Waterfall is a new quiz call mode where the user picks a daily question count (N). Each new day, N fresh questions are added to the session on top of every question introduced in all prior sessions — a full cumulative cascade. The app remembers where it left off per bank across app restarts.

---

## Behaviour Rules

| Situation | Result |
|---|---|
| First ever Waterfall session for a bank | Introduce first N questions. Show questions 0..N-1. |
| Same calendar day as last session | No advance. Repeat the same slice (0..introducedCount-1). |
| New calendar day | Advance: introducedCount += N (capped at totalQuestions). Show 0..new_introducedCount-1. |
| All questions introduced | No further advance. Every session shows the full bank ("daily full review"). |

- **N is flexible** — the user picks it fresh each session in QuizSetup. It is not stored; only `introduced_count` is persisted.
- **Question order within session** — re-test questions first (naturally: earlier order_index), new batch at the end.
- **Timer and show-answer-immediately** — unchanged; still configurable per session alongside the mode.

---

## Data Model

New SQLite table, added via the existing `runMigrations` function in `src/db/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS waterfall_progress (
  bank_id INTEGER PRIMARY KEY REFERENCES question_banks(id) ON DELETE CASCADE,
  introduced_count INTEGER NOT NULL,
  last_session_date TEXT NOT NULL   -- 'YYYY-MM-DD' local date
);
```

One row per bank that has started at least one Waterfall session. Cascades on bank delete.

---

## New Type

```ts
// src/types.ts
export interface WaterfallProgress {
  bankId: number;
  introducedCount: number;
  lastSessionDate: string; // 'YYYY-MM-DD'
}
```

---

## DB Layer — `src/db/waterfall.ts` (new file)

```ts
getWaterfallProgress(bankId: number): WaterfallProgress | null
advanceWaterfall(bankId: number, dailyCount: number, totalQuestions: number): WaterfallProgress
```

`advanceWaterfall` is the single write path. It handles all three cases (insert-on-first, same-day no-op, new-day advance) atomically so the renderer never performs date math.

**advanceWaterfall logic:**
1. Read today's date as `YYYY-MM-DD` (in main process, so timezone is the user's local machine).
2. Fetch existing row.
3. No row → insert `{ introduced_count: min(dailyCount, totalQuestions), last_session_date: today }`.
4. Row exists, `last_session_date == today` → return existing row unchanged.
5. Row exists, `last_session_date < today` → update `introduced_count = min(introduced_count + dailyCount, totalQuestions)`, `last_session_date = today`.
6. Return the final row.

---

## IPC

### New channels — `src/ipc/channels.ts`

```ts
GET_WATERFALL_PROGRESS: 'get-waterfall-progress',
ADVANCE_WATERFALL:      'advance-waterfall',
```

### New handlers — `src/main.ts`

```ts
ipcMain.handle(IPC.GET_WATERFALL_PROGRESS, (_, bankId: number) => getWaterfallProgress(bankId))
ipcMain.handle(IPC.ADVANCE_WATERFALL, (_, bankId: number, dailyCount: number, totalQuestions: number) =>
  advanceWaterfall(bankId, dailyCount, totalQuestions))
```

### New preload methods — `src/preload.ts`

```ts
getWaterfallProgress: (bankId) => ipcRenderer.invoke(IPC.GET_WATERFALL_PROGRESS, bankId),
advanceWaterfall: (bankId, dailyCount, totalQuestions) =>
  ipcRenderer.invoke(IPC.ADVANCE_WATERFALL, bankId, dailyCount, totalQuestions),
```

### New ElectronAPI entries — `src/types.ts`

```ts
getWaterfallProgress: (bankId: number) => Promise<WaterfallProgress | null>
advanceWaterfall: (bankId: number, dailyCount: number, totalQuestions: number) => Promise<WaterfallProgress>
```

---

## UI Changes

### `QuizSetup` — mode selector (new)

A **Call Mode** section is added at the top of the modal, above Timer:

- Radio: **Normal** (default) | **Waterfall**
- When Waterfall is selected:
  - Number input: **Daily questions** (min 1, default 10)
  - Progress line fetched from `getWaterfallProgress` on mount:
    - No record yet: _(nothing shown — first session)_
    - Progress exists, not complete: `30 of 150 introduced · last session Jun 5`
    - All introduced: `All questions introduced — daily full review`

### `QuizSetup` — `onStart` callback type change

```ts
// New discriminated union added to types.ts
type QuizModeConfig =
  | { mode: 'normal' }
  | { mode: 'waterfall'; dailyCount: number }

// QuizSetup.onStart now receives { quizMode: QuizModeConfig, timedMode, totalTimeLimit,
//   perQuestionTimeLimit, showAnswerImmediately } — the timer/feedback fields are unchanged
```

### `ActiveQuiz` — `handleStart` changes

```
if mode === 'normal':
  questions = await loadQuestions(bankId)          // unchanged

if mode === 'waterfall':
  allQuestions = await loadQuestions(bankId)
  progress = await advanceWaterfall(bankId, dailyCount, allQuestions.length)
  questions = allQuestions.slice(0, progress.introducedCount)

// Either path: createAttempt with totalQuestions = questions.length
// Then dispatch START as today
```

No changes to `reducer`, timers, `submitAnswer`, `finishQuiz`, or `Results`.

---

## Files Changed / Created

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `waterfall_progress` table to `runMigrations` |
| `src/db/waterfall.ts` | **New** — `getWaterfallProgress`, `advanceWaterfall` |
| `src/ipc/channels.ts` | Add `GET_WATERFALL_PROGRESS`, `ADVANCE_WATERFALL` |
| `src/main.ts` | Register two new `ipcMain.handle` calls |
| `src/preload.ts` | Expose two new methods via `contextBridge` |
| `src/types.ts` | Add `WaterfallProgress` interface; extend `ElectronAPI` |
| `src/components/QuizSetup.tsx` | Add Call Mode section; fetch progress on mount; pass mode config up |
| `src/components/ActiveQuiz.tsx` | `handleStart` branches on mode; slices question list for Waterfall |

---

## Out of Scope

- Resetting Waterfall progress (can be added later as a separate action in the UI).
- Per-question spaced repetition weighting (this is a simpler fixed-cascade model).
- Shuffle within the Waterfall slice (questions stay in order_index order).
