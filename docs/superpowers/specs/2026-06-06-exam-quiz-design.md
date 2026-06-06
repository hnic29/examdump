# ExamDump — Exam Quiz App Design Spec

**Date:** 2026-06-06  
**Status:** Approved

---

## Overview

ExamDump is a desktop exam-prep and quiz application. Users import exam dump files (PDF, DOCX, TXT), the app extracts and structures the questions, and users take timed or untimed practice tests. Results and history are persisted locally. The app runs fully offline except when the user voluntarily opens the embedded AI browser panel.

---

## Architecture

Electron's three-process model is the central constraint. All privileged work stays in the main process.

**Main process (`src/main.ts`)**
- File ingestion: reads uploaded files from disk, extracts plain text (`pdf-parse` for PDFs, `mammoth` for DOCX, native for TXT)
- Rule-based parser: detects the structured exam dump format and extracts questions without AI
- SQLite via `better-sqlite3`: all reads and writes
- `WebContentsView` management: spawns, positions, shows/hides, and navigates the embedded browser panel
- All IPC handlers

**Preload (`src/preload.ts`)**
Exposes a typed `contextBridge` API to the renderer:
`importFile`, `parseFile`, `ingestJSON`, `loadBanks`, `loadQuestions`, `saveBankName`, `deleteBank`, `saveAttempt`, `saveResponse`, `getHistory`, `openBrowserPanel`, `closeBrowserPanel`, `navigateBrowserPanel`, `generatePrompt`

**Renderer (`src/renderer.tsx`)**
React app. Calls preload methods, manages all UI state (current question, timer countdown, selected answers, pause state, panel visibility). No Node access.

**Embedded browser panel**
A `WebContentsView` attached to the main `BrowserWindow`. Slides in from the right, covering ~60% of window width. Used for two purposes:
1. AI parsing helper (claude.ai / chatgpt.com / gemini.google.com)
2. Reference link viewer (authoritative links from explanations)

The panel header (rendered in the main renderer overlay) always shows a **"Resume Quiz" / "Back"** button when the quiz is active and the panel is open.

---

## File Parsing

### Rule-based fast-path

Detects the standard exam dump format and parses without AI. Pattern:

```
Question: N [exam-code] |
[question text, may be multi-line]
A. [option text]
B. [option text]
C. [option text]
D. [option text]
Answer: X
Explanation:
[optional multi-paragraph explanation]
Authoritative Links for Further Research:
[optional links]
```

Extraction logic:
- Split document on `Question:` boundaries
- For each block: extract question text, options (letter + period pattern), `Answer:` value, `Explanation:` body, and any URLs after `Authoritative Links`
- Links parsed into `{text, url}` pairs

If the fast-path detects < 50% of blocks have recognizable structure, it falls back and offers the AI browser.

### AI browser fallback

When the fast-path fails or the user chooses it manually:
1. App extracts raw text from the file
2. App generates a structured prompt (see below) and copies it to clipboard
3. User opens the AI panel, picks Claude / ChatGPT / Gemini, pastes prompt, receives JSON
4. User copies JSON and clicks **"Paste & Import"** in app
5. Main process validates JSON against schema, then saves to SQLite

**Generated prompt template:**
```
Parse the following exam document into this exact JSON format and return ONLY the JSON, no other text:

{
  "questions": [
    {
      "question": "Question text",
      "type": "multiple_choice",
      "options": [{"id": "A", "text": "..."}],
      "correct_answers": ["A"],
      "explanation": "Why correct, or null",
      "links": [{"text": "Link label", "url": "https://..."}]
    }
  ]
}

Types: "multiple_choice" (one correct), "multi_select" (multiple correct), "true_false"
For true_false: options are [{"id":"A","text":"True"},{"id":"B","text":"False"}]

--- DOCUMENT START ---
[extracted file text]
--- DOCUMENT END ---
```

---

## Data Model

Four SQLite tables.

### `question_banks`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | user-assigned name |
| source_file | TEXT | original filename |
| created_at | INTEGER | unix timestamp |
| question_count | INTEGER | cached |

### `questions`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| bank_id | INTEGER FK | → question_banks.id |
| question_text | TEXT | |
| question_type | TEXT | `multiple_choice` \| `true_false` \| `multi_select` |
| options | TEXT | JSON: `[{id, text}]` |
| correct_answers | TEXT | JSON: `["A"]` or `["A","C"]` |
| explanation | TEXT | nullable |
| links | TEXT | JSON: `[{text, url}]`, nullable |
| order_index | INTEGER | |

### `quiz_attempts`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| bank_id | INTEGER FK | |
| started_at | INTEGER | unix timestamp |
| completed_at | INTEGER | nullable |
| timed_mode | TEXT | `none` \| `total` \| `per_question` \| `both` |
| total_time_limit | INTEGER | seconds, nullable |
| per_question_time_limit | INTEGER | seconds, nullable |
| show_answer_immediately | INTEGER | boolean (0/1) |
| score | REAL | percentage, set on completion |
| total_questions | INTEGER | |
| correct_count | INTEGER | |

### `question_responses`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| attempt_id | INTEGER FK | |
| question_id | INTEGER FK | |
| selected_answers | TEXT | JSON array of option ids |
| is_correct | INTEGER | boolean |
| time_taken | INTEGER | seconds |

---

## Screen Flow

### Sidebar (always visible)
- List of saved question banks (click to open)
- Import button
- History link
- 🤖 AI Helper button

### Library (default main view)
Shows selected bank: name, question count, best score, last taken. **Start Quiz** button.

### Import flow
1. Drag-and-drop or file picker (PDF / DOCX / TXT)
2. Main process extracts text, runs rule-based parser
3. **If recognized:** show preview of parsed questions → user names the bank → save
4. **If unrecognized:** show "Parse with AI" prompt screen with generated prompt + Copy button → user opens AI panel, pastes, returns JSON → Paste & Import → preview → name → save

### Quiz Setup modal
Before every quiz, prompt:
1. Timer mode: None / Total time / Per-question / Both
2. If total: enter total minutes
3. If per-question: enter seconds per question
4. Show correct answer immediately after each question? Yes / No
5. **Start Quiz**

### Active Quiz screen
- Top bar: question counter (`12 / 50`), total timer (if enabled, `⏱ 47:22`)
- Per-question timer bar below top bar (if enabled): countdown bar + seconds remaining
- Progress bar (fill = questions answered / total)
- Question type badge, question text, answer options
- For `multiple_choice` and `true_false`: selecting an option deselects the previous one (radio behavior)
- For `multi_select`: options toggle independently; a hint label reads "Select all that apply"
- **⏸ Pause** button always visible
- **Submit** button (enabled once at least one answer is selected)

**Pause behavior:** timer stops, question and options dim, overlay shows "Paused — tap to resume". Quiz resumes on tap. Pause also triggers automatically when the reference browser panel opens.

### Answer Feedback (if `show_answer_immediately = true`)
Shown immediately after Submit, before moving on:
- Green banner (✅ Correct!) or red banner (❌ Incorrect)
- If incorrect: user's wrong answer highlighted red, correct answer highlighted green
- Explanation text (scrollable if long)
- Authoritative links as clickable buttons at the bottom — clicking opens the reference browser panel and pauses the quiz
- **Next Question →** button

**If `show_answer_immediately = false`:** Submit moves immediately to the next question with no feedback. Correct/incorrect is recorded silently. All feedback (answers, explanations) is deferred to the **Review Answers** view on the Results screen.

### Results screen
- Final score percentage (large)
- Correct / Total count, time taken
- **Review Answers** — scrollable list of all questions with your answer vs correct answer
- **Retake** — goes back to Quiz Setup modal
- **Back to Library**

### History (main view)
- Per-bank list of all attempts: date, score, time taken, timed mode
- Score trend (simple line showing score over attempts)

---

## Timer System

All timer state is in the React renderer (not persisted mid-quiz). On completion or explicit save, total elapsed time is derived from `started_at` → `completed_at`.

- **Total timer:** counts down from `total_time_limit`. Reaching zero ends the quiz and navigates to Results.
- **Per-question timer:** resets each question. Reaching zero auto-submits the current selection (or submits blank if nothing selected, marked incorrect).
- **Both:** both timers run simultaneously.
- **Pause:** both timers freeze. Resume restarts both from where they stopped.

---

## UI Layout

**Sidebar + Main Panel** layout (Approach B).

- Left sidebar: ~220px fixed width, dark background, bank list + nav
- Main panel: remaining width, changes based on active screen
- Embedded browser panel: `WebContentsView` overlaid on the right ~60% of window, z-order above the renderer, with a thin rendered overlay strip on the left edge showing the Resume/Back button

Window minimum size: 900 × 600px.

---

## Tech Stack

| Concern | Library |
|---|---|
| Desktop shell | Electron 42 (Forge vite-typescript) |
| UI | React + TypeScript |
| Bundler | Vite |
| Local DB | `better-sqlite3` |
| PDF text extraction | `pdf-parse` |
| DOCX text extraction | `mammoth` |
| Embedded browser | `WebContentsView` (Electron 28+) |
| State management | React `useState` / `useReducer` (no external library) |
