# Robust Braindump Import + Generated-JSON Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make consistent braindump-style PDF/DOC/TXT files parse reliably into the app's JSON contract, and let the user download the JSON the app generates (on the preview screen and after saving) whenever the source was not a user-supplied `.json`.

**Architecture:** Extend the existing deterministic `ruleParser` recognizers (no rewrite) to accept braindump header/answer/option/explanation variants, keeping the manual AI helper as the fallback. Add one new IPC channel (`SAVE_GENERATED_JSON`) for downloading generated JSON pre-save, and reuse the existing `EXPORT_BANK` for the post-save download. All file IO/parsing stays in the Electron main process; the renderer reaches it through preload.

**Tech Stack:** Electron 42, React 19 + TypeScript, Vite, Vitest, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-06-08-robust-import-and-json-download-design.md`

---

## File Structure

- `src/parser/ruleParser.ts` — MODIFY: recognizer regexes + inline-correct cross-check (Tasks 1–3)
- `src/parser/__tests__/ruleParser.test.ts` — MODIFY: new braindump fixtures (Tasks 1–3)
- `src/util/filename.ts` — CREATE: `toJsonFileName` pure helper (Task 4)
- `src/util/__tests__/filename.test.ts` — CREATE: helper tests (Task 4)
- `src/ipc/channels.ts` — MODIFY: add `SAVE_GENERATED_JSON` (Task 5)
- `src/main.ts` — MODIFY: add handler (Task 5)
- `src/preload.ts` — MODIFY: expose method (Task 5)
- `src/types.ts` — MODIFY: `ElectronAPI.saveGeneratedJson` (Task 5)
- `src/components/ImportFlow.tsx` — MODIFY: `sourceWasJson` + preview download (Task 6); `saved` step + post-save download (Task 7)

---

## Task 1: Parser — flexible question header & answer-line recognition

**Files:**
- Modify: `src/parser/ruleParser.ts`
- Test: `src/parser/__tests__/ruleParser.test.ts`

- [ ] **Step 1: Write the failing test**

Append these tests inside the `describe('parseExamDump', …)` block in `src/parser/__tests__/ruleParser.test.ts`:

```ts
it('parses "Question N" headers without a colon', () => {
  const text = `Question 1   (source: page 2)
Which protocol is connection-oriented?
A. UDP
B. TCP
Correct Answer: B`;
  const result = parseExamDump(text);
  expect(result.questions).toHaveLength(1);
  expect(result.questions[0].question).toBe('Which protocol is connection-oriented?');
  expect(result.questions[0].correct_answers).toEqual(['B']);
});

it('recognizes "Correct Answer:" and "Answer(s):" answer lines', () => {
  const text = `Question 1 |
Pick one.
A. Foo
B. Bar
Correct Answer: A

Question 2 |
Pick two. (Choose two.)
A. Foo
B. Bar
C. Baz
Answer(s): A, C`;
  const result = parseExamDump(text);
  expect(result.questions[0].correct_answers).toEqual(['A']);
  expect(result.questions[1].correct_answers).toEqual(['A', 'C']);
  expect(result.questions[1].type).toBe('multi_select');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/parser/__tests__/ruleParser.test.ts`
Expected: FAIL — the no-colon header block is not split/recognized, and `Correct Answer:` / `Answer(s):` are not matched (`correct_answers` come back `[]`).

- [ ] **Step 3: Update the recognizers in `src/parser/ruleParser.ts`**

Replace the top-of-file constants and the block split. Change these exact lines:

```ts
const ANSWER_RE = /^Answer:\s*([A-E](?:,\s*[A-E])*)/i;
```
to:
```ts
// Accepts: "Answer: B", "Answer: A, B", "Correct Answer: D",
// "Correct Answers: A, D", "Answer(s): A,D"
const ANSWER_RE = /^(?:correct\s+)?answer(?:\(s\)|s)?:\s*([A-E](?:\s*,\s*[A-E])*)/i;
```

Change:
```ts
const QUESTION_HEADER_RE = /^Question:\s*\d+/i;
```
to:
```ts
// Accepts: "Question: 1", "Question 1", "QUESTION: 1", "Q1"
const QUESTION_HEADER_RE = /^(?:question|q)\s*:?\s*\d+/i;
```

Change the block split in `parseExamDump`:
```ts
const blocks = text.split(/(?=Question:\s*\d+)/i).map(b => b.trim()).filter(Boolean);
```
to (anchor the header to a line start so stray "Q1" inside prose can't cause a mid-paragraph split):
```ts
const blocks = text.split(/(?=^(?:question|q)\s*:?\s*\d+)/im).map(b => b.trim()).filter(Boolean);
```

Change the header-skip line inside `parseBlock`:
```ts
if (/^Question:\s*\d+/i.test(lines[idx])) idx++;
```
to (the whole header line — including any trailing "(source: page 3)" noise — is skipped, so no separate stripping is needed):
```ts
if (QUESTION_HEADER_RE.test(lines[idx])) idx++;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/parser/__tests__/ruleParser.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/parser/ruleParser.ts src/parser/__tests__/ruleParser.test.ts
git commit -m "feat(parser): accept Question-N and Correct-Answer braindump headers"
```

---

## Task 2: Parser — option delimiters, inline [Correct] marker, dual-source cross-check

**Files:**
- Modify: `src/parser/ruleParser.ts`
- Test: `src/parser/__tests__/ruleParser.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe` block:

```ts
it('accepts "A)" option delimiters', () => {
  const text = `Question 1 |
Pick one.
A) Foo
B) Bar
Correct Answer: B`;
  const result = parseExamDump(text);
  expect(result.questions[0].options).toEqual([
    { id: 'A', text: 'Foo' },
    { id: 'B', text: 'Bar' },
  ]);
  expect(result.questions[0].correct_answers).toEqual(['B']);
});

it('strips a trailing [Correct] marker and uses it when no answer line', () => {
  const text = `Question 1 |
Pick one.
A. Foo
B. Bar [Correct]
C. Baz`;
  const result = parseExamDump(text);
  // marker text removed from the option
  expect(result.questions[0].options[1]).toEqual({ id: 'B', text: 'Bar' });
  // marker used as the correct answer because there is no answer line
  expect(result.questions[0].correct_answers).toEqual(['B']);
});

it('prefers the answer line over inline markers when they disagree', () => {
  const text = `Question 1 |
Pick one.
A. Foo [Correct]
B. Bar
Correct Answer: B`;
  const result = parseExamDump(text);
  expect(result.questions[0].correct_answers).toEqual(['B']);
  expect(result.questions[0].options[0]).toEqual({ id: 'A', text: 'Foo' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/parser/__tests__/ruleParser.test.ts`
Expected: FAIL — `A)` options aren't matched, and `[Correct]` is neither stripped nor used.

- [ ] **Step 3: Update `src/parser/ruleParser.ts`**

Change the option regex:
```ts
const OPTION_RE = /^([A-E])\.\s+(.+)/;
```
to:
```ts
const OPTION_RE = /^([A-E])[.)]\s+(.+)/;
```

Add this constant near the other regexes:
```ts
// Trailing inline correctness marker, e.g. "Bar [Correct]" or "Bar ✓"
const CORRECT_MARKER_RE = /\s*(?:\[correct\]|✓)\s*$/i;
```

In `parseBlock`, replace the option-collection loop:
```ts
const options: QuestionOption[] = [];
while (idx < lines.length && OPTION_RE.test(lines[idx])) {
  const m = lines[idx++].match(OPTION_RE)!;
  options.push({ id: m[1], text: m[2].trim() });
}
if (options.length < 2) return null;
```
with:
```ts
const options: QuestionOption[] = [];
const inlineCorrect: string[] = [];
while (idx < lines.length && OPTION_RE.test(lines[idx])) {
  const m = lines[idx++].match(OPTION_RE)!;
  let text = m[2].trim();
  if (CORRECT_MARKER_RE.test(text)) {
    text = text.replace(CORRECT_MARKER_RE, '').trim();
    inlineCorrect.push(m[1]);
  }
  options.push({ id: m[1], text });
}
if (options.length < 2) return null;
```

Then, right after the existing answer-line block that sets `correctAnswers`:
```ts
let correctAnswers: string[] = [];
if (idx < lines.length && ANSWER_RE.test(lines[idx])) {
  const m = lines[idx++].match(ANSWER_RE)!;
  correctAnswers = m[1].split(',').map(a => a.trim());
}
```
add this fallback (answer line wins; inline markers used only when no answer line was found):
```ts
// Dual-source: when no explicit answer line is present, fall back to the
// inline [Correct] markers collected from the options.
if (correctAnswers.length === 0 && inlineCorrect.length > 0) {
  correctAnswers = inlineCorrect;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/parser/__tests__/ruleParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser/ruleParser.ts src/parser/__tests__/ruleParser.test.ts
git commit -m "feat(parser): support A) options and inline [Correct] markers with answer-line cross-check"
```

---

## Task 3: Parser — explanation without colon + full braindump fixture

**Files:**
- Modify: `src/parser/ruleParser.ts`
- Test: `src/parser/__tests__/ruleParser.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe` block:

```ts
it('parses an "Explanation" header without a colon', () => {
  const text = `Question 1 |
Pick one.
A. Foo
B. Bar
Correct Answer: B
Explanation
Bar is correct because of reasons.`;
  const result = parseExamDump(text);
  expect(result.questions[0].explanation).toBe('Bar is correct because of reasons.');
});

it('parses a full app-generated braindump block end to end', () => {
  const text = `Question 1   (source: page 2)
Which of the following job roles develops a model from business use cases?
A. Platform architect
B. AI risk analyst
C. MLOps engineer
D. Data scientist [Correct]
Correct Answer: D
Explanation
A data scientist translates business use cases into ML solutions.`;
  const result = parseExamDump(text);
  expect(result.success).toBe(true);
  expect(result.questions).toHaveLength(1);
  const q = result.questions[0];
  expect(q.question).toBe('Which of the following job roles develops a model from business use cases?');
  expect(q.options).toHaveLength(4);
  expect(q.options[3]).toEqual({ id: 'D', text: 'Data scientist' });
  expect(q.correct_answers).toEqual(['D']);
  expect(q.type).toBe('multiple_choice');
  expect(q.explanation).toContain('translates business use cases');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/parser/__tests__/ruleParser.test.ts`
Expected: FAIL — `Explanation` (no colon) is not recognized, so `explanation` is `null`.

- [ ] **Step 3: Update `src/parser/ruleParser.ts`**

Change:
```ts
const EXPLANATION_RE = /^Explanation:\s*/i;
```
to:
```ts
const EXPLANATION_RE = /^Explanation:?\s*/i;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/parser/__tests__/ruleParser.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/parser/ruleParser.ts src/parser/__tests__/ruleParser.test.ts
git commit -m "feat(parser): accept Explanation header without colon"
```

---

## Task 4: Filename sanitizer helper

**Files:**
- Create: `src/util/filename.ts`
- Test: `src/util/__tests__/filename.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/util/__tests__/filename.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toJsonFileName } from '../filename';

describe('toJsonFileName', () => {
  it('appends .json to a plain name', () => {
    expect(toJsonFileName('CY0-001')).toBe('CY0-001.json');
  });

  it('replaces an existing extension with .json', () => {
    expect(toJsonFileName('CY0-001.pdf')).toBe('CY0-001.json');
  });

  it('falls back to a default for empty input', () => {
    expect(toJsonFileName('')).toBe('examdump-questions.json');
    expect(toJsonFileName('   ')).toBe('examdump-questions.json');
  });

  it('replaces filesystem-unsafe characters', () => {
    expect(toJsonFileName('a/b:c*?')).toBe('a_b_c__.json');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/util/__tests__/filename.test.ts`
Expected: FAIL — `Cannot find module '../filename'`.

- [ ] **Step 3: Create `src/util/filename.ts`**

```ts
/**
 * Turn an arbitrary bank/file name into a safe ".json" download filename.
 * Strips any existing extension, replaces filesystem-unsafe characters with
 * "_", caps length, and falls back to a default when the result is empty.
 */
export function toJsonFileName(name: string): string {
  const base = (name ?? '').replace(/\.[^.]+$/, '').trim();
  if (!base) return 'examdump-questions.json';
  // Replace only filesystem-reserved characters; keep hyphens/spaces intact
  // so names like "CY0-001" survive unchanged.
  const safe = base.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
  return `${safe}.json`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/util/__tests__/filename.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/util/filename.ts src/util/__tests__/filename.test.ts
git commit -m "feat(util): add toJsonFileName download-name sanitizer"
```

---

## Task 5: IPC wiring for SAVE_GENERATED_JSON

**Files:**
- Modify: `src/ipc/channels.ts`
- Modify: `src/main.ts`
- Modify: `src/preload.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add the channel constant**

In `src/ipc/channels.ts`, add this line inside the `IPC` object (after `EXPORT_BANK`):
```ts
  SAVE_GENERATED_JSON: 'save-generated-json',
```

- [ ] **Step 2: Add the type to `ElectronAPI`**

In `src/types.ts`, inside `interface ElectronAPI`, add after `exportBank`:
```ts
  saveGeneratedJson: (json: string, defaultName: string) => Promise<void>;
```

- [ ] **Step 3: Expose the method in preload**

In `src/preload.ts`, add to the `api` object after the `exportBank` line:
```ts
  saveGeneratedJson: (json, defaultName) => ipcRenderer.invoke(IPC.SAVE_GENERATED_JSON, json, defaultName),
```

- [ ] **Step 4: Add the main-process handler**

In `src/main.ts`, add the import near the other parser/util imports at the top:
```ts
import { toJsonFileName } from './util/filename';
```

Then register the handler inside `registerIpcHandlers()` (place it right after the `EXPORT_BANK` handler):
```ts
  ipcMain.handle(IPC.SAVE_GENERATED_JSON, async (_e, json: string, defaultName: string) => {
    if (!mainWindow) return;
    if (typeof json !== 'string') throw new Error('Invalid JSON payload.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('Invalid JSON: could not serialize the generated questions.');
    }
    const obj = parsed as { questions?: unknown };
    if (!obj || !Array.isArray(obj.questions) || obj.questions.length === 0) {
      throw new Error('Generated JSON has no questions to download.');
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: toJsonFileName(defaultName),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return;
    await fs.writeFile(result.filePath, json, 'utf-8');
  });
```

- [ ] **Step 5: Verify it typechecks and lints**

Run: `npm run lint`
Expected: no new errors in the four edited files.

- [ ] **Step 6: Commit**

```bash
git add src/ipc/channels.ts src/main.ts src/preload.ts src/types.ts
git commit -m "feat(ipc): add saveGeneratedJson channel for downloading generated JSON"
```

---

## Task 6: ImportFlow — track source + preview Download JSON button

**Files:**
- Modify: `src/components/ImportFlow.tsx`

- [ ] **Step 1: Add `sourceWasJson` state and set it on file pick**

In `src/components/ImportFlow.tsx`, add a state declaration after the `expectedCount` state:
```tsx
  const [sourceWasJson, setSourceWasJson] = useState(false);
```

In `handlePickFile`, right after `setExtractedText(result.text);`, add:
```tsx
      setSourceWasJson(result.isJson);
```

- [ ] **Step 2: Add the download handler**

Add this function alongside the other handlers (e.g. after `handleSave`):
```tsx
  const handleDownloadGenerated = async () => {
    const json = JSON.stringify({ questions: parsedQuestions }, null, 2);
    await window.electronAPI.saveGeneratedJson(json, bankName || fileName);
  };
```

- [ ] **Step 3: Render the button on the preview/naming screen**

In the `if (step === 'preview' || step === 'naming')` block, change the button row:
```tsx
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSave}>💾 Save to Library</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
```
to:
```tsx
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSave}>💾 Save to Library</button>
          {!sourceWasJson && (
            <button className="btn btn-secondary" onClick={handleDownloadGenerated}>⬇️ Download JSON</button>
          )}
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
```

- [ ] **Step 4: Manually verify in the running app**

Run: `npm start`
Then:
1. Import the app-generated `CY0-001_Questions_and_Answers.pdf` → on the preview screen, confirm a **Download JSON** button appears next to Save; click it, choose a path, and confirm a `.json` file is written.
2. Re-import that downloaded `.json` file → confirm the preview shows the questions and the **Download JSON** button is **hidden** (source was JSON).

Expected: button visible for the PDF import, hidden for the JSON import, and the downloaded file contains a `{ "questions": [...] }` array.

- [ ] **Step 5: Commit**

```bash
git add src/components/ImportFlow.tsx
git commit -m "feat(import): download generated JSON from the preview screen"
```

---

## Task 7: ImportFlow — saved step with after-save download

**Files:**
- Modify: `src/components/ImportFlow.tsx`

- [ ] **Step 1: Extend the step union and add saved-bank state**

Change:
```tsx
type ImportStep = 'idle' | 'parsing' | 'partial' | 'preview' | 'ai-fallback' | 'naming' | 'saving';
```
to:
```tsx
type ImportStep = 'idle' | 'parsing' | 'partial' | 'preview' | 'ai-fallback' | 'naming' | 'saving' | 'saved';
```

Add state after `sourceWasJson`:
```tsx
  const [savedBankId, setSavedBankId] = useState<number | null>(null);
```

- [ ] **Step 2: Stop on the saved step instead of completing immediately**

Replace `handleSave`'s body:
```tsx
  const handleSave = async () => {
    if (!bankName.trim()) { setError('Please enter a name for this question bank.'); return; }
    setStep('saving');
    try {
      await window.electronAPI.ingestJSON(JSON.stringify({ questions: parsedQuestions }), bankName.trim());
      onComplete();
    } catch (e) {
      setError('Failed to save question bank. Please try again.');
      setStep('naming');
    }
  };
```
with:
```tsx
  const handleSave = async () => {
    if (!bankName.trim()) { setError('Please enter a name for this question bank.'); return; }
    setStep('saving');
    try {
      const res = await window.electronAPI.ingestJSON(JSON.stringify({ questions: parsedQuestions }), bankName.trim());
      setSavedBankId(res.id);
      setStep('saved');
    } catch (e) {
      setError('Failed to save question bank. Please try again.');
      setStep('naming');
    }
  };
```

- [ ] **Step 3: Render the saved step**

Add this block right before the final `return <div style={{ color: '#8b9cb0' }}>Saving…</div>;`:
```tsx
  if (step === 'saved') {
    return (
      <div style={{ maxWidth: 500 }}>
        <h2 style={{ marginBottom: 8 }}>Saved ✓</h2>
        <p style={{ color: '#c9d4e8', fontSize: 13, marginBottom: 20 }}>
          {parsedQuestions.length} questions saved to “{bankName}”.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {!sourceWasJson && savedBankId != null && (
            <button className="btn btn-secondary" onClick={() => window.electronAPI.exportBank(savedBankId)}>
              ⬇️ Download JSON
            </button>
          )}
          <button className="btn btn-primary" onClick={onComplete}>Done</button>
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Manually verify in the running app**

Run: `npm start`
Then:
1. Import the app-generated PDF → name it → **Save to Library** → confirm a **Saved ✓** screen appears with a **Download JSON** button and a **Done** button. Click Download JSON → confirm a valid `.json` is written (same shape as Library → Export). Click Done → confirm it returns to the library with the new bank listed.
2. Import a `.json` bank → Save → confirm the Saved screen shows **only Done** (no Download JSON).

Expected: post-save download present for PDF source, hidden for JSON source; Done refreshes the library.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all suites, including the new parser and filename tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ImportFlow.tsx
git commit -m "feat(import): saved confirmation step with after-save JSON download"
```

---

## Self-Review

**Spec coverage:**
- Part A robust parsing → Tasks 1–3 (headers, answer lines, options, inline marker cross-check, explanation; full braindump fixture). ✓
- Part B1 preview download (new `SAVE_GENERATED_JSON`) → Tasks 4–6. ✓
- Part B2 after-save download (reuse `exportBank`) → Task 7. ✓
- `sourceWasJson` gating (hidden for user-supplied JSON) → Tasks 6 & 7. ✓
- Default filename = bank name → `toJsonFileName(bankName || fileName)` (Task 6) + `toJsonFileName(defaultName)` (Task 5). ✓
- Data contract unchanged (`{ questions: [...] }`) → Tasks 6/7 serialize that shape; round-trip verified manually in Task 6. ✓
- AI helper unchanged as fallback → no task touches the `ai-fallback` path. ✓
- Error handling (validate JSON, silent cancel) → Task 5 handler. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `saveGeneratedJson(json: string, defaultName: string) => Promise<void>` is identical in `types.ts` (Task 5 Step 2), `preload.ts` (Step 3), and the call sites (Tasks 6/7). `toJsonFileName` signature matches between Task 4 and its use in Task 5. `ingestJSON` returns `{ id, questionCount }` — Task 7 reads `res.id`, consistent with `main.ts`. New `ImportStep` value `'saved'` defined in Task 7 Step 1 before use in Step 3. ✓
