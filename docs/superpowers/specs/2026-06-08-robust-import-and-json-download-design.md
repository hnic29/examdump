# Design: Robust Braindump Import + Generated-JSON Download

**Date:** 2026-06-08
**Status:** Approved (pending spec review)

## Problem

Two issues with the current PDF/DOC/TXT import path:

1. **Real braindump-style files don't parse.** The deterministic `ruleParser` only
   recognizes a strict layout (`Question: N` with a colon, `Answer: X`). The actual
   files the user imports — numbered questions, A/B/C/D options, a `Correct Answer:`
   line, optional explanation — miss the block-splitter and answer-matcher, so
   questions get dropped and import constantly falls back to the manual AI helper.
   The CY0-001 PDF the app itself generates is an example that currently fails.

2. **No way to download the JSON the app generates.** When a PDF/DOC/TXT is converted
   to JSON internally, the user cannot save that JSON for reuse or editing. Export only
   exists for already-saved banks (`EXPORT_BANK`).

## Goals

- Parse consistent braindump-style PDF/DOC/TXT reliably into the existing JSON contract
  and apply (save) it correctly — without needing the AI helper for these files.
- Let the user download the generated JSON **when the source was not a user-supplied
  `.json` file** — both on the preview screen (before/without saving) and after saving.
- Keep everything offline and deterministic. The manual AI helper remains as the
  fallback for files the rule parser can't handle confidently.

## Non-goals

- No built-in LLM API / cloud calls (preserves the offline design).
- No general-purpose "parse anything" heuristic engine. Scope is braindump-style files.
- No change to the DB schema, the quiz flow, or the existing `EXPORT_BANK` behavior.

## Constraints / context

- Electron two-process model. All file IO and parsing stay in the **main** process;
  the renderer reaches them only through preload-exposed IPC.
- Data contract is unchanged:
  `{ "questions": [{ question, type, options:[{id,text}], correct_answers:[...],
  explanation, links }] }` — identical to the export format, so downloaded JSON
  round-trips back into import.

---

## Part A — Robust braindump parsing

**File:** `src/parser/ruleParser.ts` (logic), `src/parser/__tests__/ruleParser.test.ts` (tests).

Extend the existing parser's recognizers. No structural rewrite — same block-based
flow, same `ParseResult`/confidence/`expectedCount` outputs, same `partial` UI behavior.

### Recognizer changes

1. **Question header / block split.** Accept `Question`, `QUESTION`, or `Q`, an optional
   colon, and a number: matches `Question 1`, `Question: 1`, `QUESTION: 1`, `Q1`.
   Strip trailing parenthetical noise on the header line such as `(source: page 3)`.
   - Block-split regex and `QUESTION_HEADER_RE` both updated to the new pattern.
   - The split must remain a lookahead so header text is retained in each block.

2. **Answer line.** Accept `Answer`, `Answer(s)`, `Correct Answer`, `Correct Answers`,
   `Correct Answer(s)`, case-insensitive, followed by `:` and a letter list
   (`D`, `A,D`, `A, D`). Captured letters normalized (trim, uppercase).

3. **Options.** Accept `A.` or `A)` as the delimiter. Strip a trailing inline
   correctness marker — `[Correct]` (case-insensitive) or a `✓` — from the option text.
   When such markers are present, collect them as a **secondary** set of correct ids.

4. **Answer cross-check (dual source).** If both an answer line and inline `[Correct]`
   markers exist:
   - If they agree, use them.
   - If they disagree, prefer the explicit answer line and record the discrepancy
     (the question still parses; we do not silently drop it). Disagreement does not
     fail the block.
   If only one source exists, use it. If neither exists, `correct_answers` is `[]`
   (unchanged from today — such a question is still valid for parsing but has no key).

5. **Explanation header.** Accept `Explanation` with or without a trailing colon.

### Unchanged

- `multiple_choice` / `multi_select` / `true_false` type inference.
- Authoritative-links parsing.
- Confidence = recognized / blocks; `success` at >= 0.5; `expectedCount` drives the
  `partial` screen.

### Tests

Add fixtures to `ruleParser.test.ts` covering: `Question N` without colon; `Correct
Answer:` and `Answer(s):` lines; `A)` option delimiter; trailing `[Correct]` marker
stripping + cross-check (agree and disagree cases); `Explanation` without colon; a
full braindump block matching the app's own generated PDF text. Assert option text is
clean (no `[Correct]` residue) and `correct_answers` is correct.

---

## Part B — Download generated JSON

The download is offered only when the import source was **not** a user-supplied `.json`
file. The renderer already receives `isJson` from `importFile()`; thread it into
`ImportFlow` state as `sourceWasJson` and gate the buttons on `!sourceWasJson`.

### B1 — Preview-screen download (before/without saving)

- **UI:** `src/components/ImportFlow.tsx` — on the `preview`/`naming` step, add a
  `Download JSON` button next to `Save to Library`, rendered only when `!sourceWasJson`.
- **Behavior:** serialize the current `parsedQuestions` as
  `JSON.stringify({ questions: parsedQuestions }, null, 2)` and call a new IPC method
  `saveGeneratedJson(json, defaultName)`.
- **Default filename:** the current bank-name field value (falling back to the source
  file's base name), e.g. `CY0-001.json`.

### B2 — After-save download

- After a successful save, `ImportFlow` transitions to a new `saved` step that shows a
  confirmation message and a `Download JSON` button, the latter shown only when
  `!sourceWasJson`. (Previously `handleSave` called `onComplete()` immediately; now it
  sets `step = 'saved'` and stores the returned `bankId`.)
- **Behavior:** reuse the existing `exportBank(bankId)` IPC — `ingestJSON` already
  returns `{ id, questionCount }`, so `ImportFlow` has the new `bankId`. No new
  serialization logic for this path.
- `onComplete()` still fires to refresh the library; the confirmation includes a
  `Done` button that calls `onComplete()`.

### IPC / preload / main wiring (new channel)

Following the project convention (channel constant → `ipcMain.handle` → preload
method → typed `ElectronAPI`):

- **`src/ipc/channels.ts`:** add `SAVE_GENERATED_JSON: 'save-generated-json'`.
- **`src/main.ts`:** add `ipcMain.handle(IPC.SAVE_GENERATED_JSON, async (_e, json, defaultName) => …)`:
  - Validate `json` is a string that `JSON.parse`s into an object with a non-empty
    `questions` array; throw a descriptive error otherwise.
  - `dialog.showSaveDialog` with `defaultPath: sanitize(defaultName) + '.json'` (strip
    any existing extension; fall back to `examdump-questions.json`), filter
    `{ name: 'JSON', extensions: ['json'] }`.
  - On confirm, `fs.writeFile(filePath, json, 'utf-8')`. On cancel, no-op.
- **`src/preload.ts`:** expose
  `saveGeneratedJson: (json: string, defaultName: string) => ipcRenderer.invoke(IPC.SAVE_GENERATED_JSON, json, defaultName)`.
- **`src/types.ts`:** add to `ElectronAPI`:
  `saveGeneratedJson: (json: string, defaultName: string) => Promise<void>;`

---

## Data flow (end to end)

```
Pick file ─ importFile() ──► { text, fileName, isJson }
   │                               │
   │ isJson=true                   │ isJson=false (pdf/docx/txt)
   ▼                               ▼
preview (no download)        extractText ► parseExamDump (robust)
   │                               │
   │                     recognized? ──no──► AI helper (unchanged) ─► paste JSON
   ▼                               │ yes/partial                         │
Save to Library              preview/partial (Download JSON shown) ◄─────┘
                                   │
                          Save ► ingestJSON ► {id}
                                   │
                          saved confirmation (Download JSON via exportBank)
```

## Error handling

- `saveGeneratedJson` validates input and surfaces a clear error string to the renderer;
  `ImportFlow` shows it in the existing error area. Save-dialog cancel is a silent no-op.
- Answer cross-check disagreements never fail a block; they are tolerated (answer line wins).
- Existing import errors (unsupported type, oversized file, invalid JSON) are unchanged.

## Testing

- **Unit (Vitest):** `ruleParser.test.ts` braindump fixtures (Part A). A small unit test
  for the filename sanitizer if it is extracted as a pure helper.
- **Manual:** import the app-generated CY0-001 PDF → expect all questions parsed,
  `Download JSON` present on preview, downloaded file re-imports cleanly; import a `.json`
  bank → `Download JSON` hidden; save a parsed bank → after-save download writes a valid
  file matching `EXPORT_BANK` output.

## Files touched

- `src/parser/ruleParser.ts` — recognizer changes (Part A)
- `src/parser/__tests__/ruleParser.test.ts` — new fixtures
- `src/components/ImportFlow.tsx` — `sourceWasJson` state, download buttons, saved step
- `src/ipc/channels.ts` — new channel
- `src/main.ts` — `SAVE_GENERATED_JSON` handler
- `src/preload.ts` — expose method
- `src/types.ts` — `ElectronAPI.saveGeneratedJson`
