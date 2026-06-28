import type { ParsedQuestion, ParseResult, QuestionOption, QuestionLink, QuestionType } from '../types';

const OPTION_RE = /^([A-E])[.)]\s+(.+)/;
const CORRECT_MARKER_RE = /\s*(?:\[correct\]|✓)\s*$/i;
const ANSWER_RE = /^(?:correct\s+)?answer(?:\(s\)|s)?:\s*([A-E](?:\s*,\s*[A-E])*)/i;
const EXPLANATION_RE = /^Explanation\b:?\s*/i;
const LINKS_HEADER_RE = /^Authoritative Links/i;
const URL_RE = /https?:\/\/[^\s]+/g;
const TRUE_RE = /^true\.?$/i;
const FALSE_RE = /^false\.?$/i;
const MULTI_SELECT_RE = /select\s+(all|two|three|\d+)|choose\s+(all|two|three|\d+)/i;
const QUESTION_HEADER_RE = /^(?:question|q)\s*:?\s*\d+/i;

// True when lines[idx] is "A. [text]" immediately followed by "B. [text]".
// This distinguishes a real option set from "A. ..." references inside explanation
// prose, which are separated from "B. ..." by continuation lines rather than
// an immediate next line.
function isOptionSetStart(lines: string[], idx: number): boolean {
  const m = lines[idx]?.match(OPTION_RE);
  if (!m || m[1] !== 'A') return false;
  const mNext = lines[idx + 1]?.match(OPTION_RE);
  return mNext !== null && mNext[1] === 'B';
}

// Primary parser: detects question boundaries via option sets (A. immediately
// followed by B.) rather than "Question N" headers. This handles both headed
// formats and headerless CompTIA-style dumps where questions begin with raw
// question text and no explicit question number.
export function parseExamDump(text: string): ParseResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const questions: ParsedQuestion[] = [];
  let optionSetsFound = 0;
  let idx = 0;

  while (idx < lines.length) {
    // Collect question-text lines until the next real option-set boundary
    const qTextLines: string[] = [];
    while (idx < lines.length && !isOptionSetStart(lines, idx)) {
      if (!QUESTION_HEADER_RE.test(lines[idx])) qTextLines.push(lines[idx]);
      idx++;
    }
    if (idx >= lines.length) break;

    optionSetsFound++;
    const questionText = qTextLines.join(' ').trim();

    // Options
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

    if (options.length < 2 || !questionText) continue;

    // Answer line
    let correctAnswers: string[] = [];
    if (idx < lines.length && ANSWER_RE.test(lines[idx])) {
      const m = lines[idx++].match(ANSWER_RE)!;
      correctAnswers = m[1].split(',').map(a => a.trim());
    }
    if (correctAnswers.length === 0 && inlineCorrect.length > 0) correctAnswers = inlineCorrect;

    // Explanation — stop at Authoritative Links header or the next option set
    let explanation: string | null = null;
    const links: QuestionLink[] = [];

    if (idx < lines.length && EXPLANATION_RE.test(lines[idx])) {
      idx++;
      const explLines: string[] = [];
      while (idx < lines.length && !LINKS_HEADER_RE.test(lines[idx]) && !isOptionSetStart(lines, idx)) {
        explLines.push(lines[idx++]);
      }
      explanation = explLines.join('\n').trim() || null;
    }

    // Links — stop at first non-URL line so the next question's text is not
    // consumed by this section (the next question starts right after the last URL).
    if (idx < lines.length && LINKS_HEADER_RE.test(lines[idx])) {
      idx++;
      while (idx < lines.length && !isOptionSetStart(lines, idx)) {
        const urlMatches = lines[idx].match(URL_RE);
        if (!urlMatches) break;
        const url = urlMatches[0];
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            links.push({ text: lines[idx].replace(url, '').trim() || url, url: parsed.toString() });
          }
        } catch { /* skip malformed URLs */ }
        idx++;
      }
    }

    // Question type
    let type: QuestionType = 'multiple_choice';
    if (options.length === 2 && TRUE_RE.test(options[0].text) && FALSE_RE.test(options[1].text)) {
      type = 'true_false';
    } else if (correctAnswers.length > 1 || MULTI_SELECT_RE.test(questionText)) {
      type = 'multi_select';
    }

    questions.push({ question: questionText, type, options, correct_answers: correctAnswers, explanation, links: links.length > 0 ? links : null });
  }

  // Fall back to header-based splitting for formats without labeled options
  // (e.g. a pure Q&A text with no A./B./C./D. lines at all).
  if (optionSetsFound === 0) return parseByHeaders(text);

  // Use the max of option-sets found and explicit "Question N" header count so
  // that a partial parse (header present but options stripped by bad PDF extraction)
  // still registers the full intended question count in expectedCount.
  const headerCount = (text.match(/^\s*(?:question\s*:?\s*\d+|q\s*:?\s*\d+(?![^\S\n]*[a-zA-Z]))/gim) ?? []).length;
  const expectedCount = Math.max(optionSetsFound, headerCount);
  const confidence = questions.length / optionSetsFound;

  return { success: confidence >= 0.5, questions, confidence, expectedCount };
}

// Fallback: split on "Question N" / "Q N" headers and parse each block.
// Used when the primary option-set scanner finds nothing.
function parseByHeaders(text: string): ParseResult {
  const blocks = text
    .split(/(?=^\s*(?:question\s*:?\s*\d+|q\s*:?\s*\d+(?![^\S\n]*[a-zA-Z])))/im)
    .map(b => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return { success: false, questions: [], confidence: 0, expectedCount: 0 };

  const questions: ParsedQuestion[] = [];
  let recognized = 0;
  for (const block of blocks) {
    const q = parseBlock(block);
    if (q) { questions.push(q); recognized++; }
  }

  const expectedCount = blocks.filter(b => QUESTION_HEADER_RE.test(b)).length;
  const confidence = recognized / blocks.length;
  return { success: confidence >= 0.5, questions, confidence, expectedCount };
}

function parseBlock(block: string): ParsedQuestion | null {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  let idx = 0;
  if (QUESTION_HEADER_RE.test(lines[idx])) idx++;

  const qLines: string[] = [];
  while (idx < lines.length && !OPTION_RE.test(lines[idx])) qLines.push(lines[idx++]);
  const questionText = qLines.join(' ').trim();
  if (!questionText) return null;

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

  let correctAnswers: string[] = [];
  if (idx < lines.length && ANSWER_RE.test(lines[idx])) {
    const m = lines[idx++].match(ANSWER_RE)!;
    correctAnswers = m[1].split(',').map(a => a.trim());
  }
  if (correctAnswers.length === 0 && inlineCorrect.length > 0) correctAnswers = inlineCorrect;

  let explanation: string | null = null;
  const links: QuestionLink[] = [];

  if (idx < lines.length && EXPLANATION_RE.test(lines[idx])) {
    idx++;
    const explLines: string[] = [];
    while (idx < lines.length && !LINKS_HEADER_RE.test(lines[idx])) explLines.push(lines[idx++]);
    explanation = explLines.join('\n').trim() || null;
  }

  if (idx < lines.length && LINKS_HEADER_RE.test(lines[idx])) {
    idx++;
    for (; idx < lines.length; idx++) {
      const urlMatches = lines[idx].match(URL_RE);
      if (urlMatches) {
        const url = urlMatches[0];
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            links.push({ text: lines[idx].replace(url, '').trim() || url, url: parsed.toString() });
          }
        } catch { }
      }
    }
  }

  let type: QuestionType = 'multiple_choice';
  if (options.length === 2 && TRUE_RE.test(options[0].text) && FALSE_RE.test(options[1].text)) {
    type = 'true_false';
  } else if (correctAnswers.length > 1 || MULTI_SELECT_RE.test(questionText)) {
    type = 'multi_select';
  }

  return { question: questionText, type, options, correct_answers: correctAnswers, explanation, links: links.length > 0 ? links : null };
}
