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

// Matches interactive question type markers.
// [\s.:~-]* handles variants like "HOTSPOT -" (trailing dash) or "HOTSPOT:"
const INTERACTIVE_MARKER_RE = /^(drag\s+and\s+drop|drag\s+drop|hotspot|hot\s+spot|simulation|simlet|interactive|build\s+list|reorder|mark\s+review)[\s.:~-]*$/i;

// [[IMG:N]] placeholder injected by extractFileContent for DOCX images
const IMG_PLACEHOLDER_RE = /^\[\[IMG:(\d+)\]\]$/;

function isOptionSetStart(lines: string[], idx: number): boolean {
  const m = lines[idx]?.match(OPTION_RE);
  if (!m || m[1] !== 'A') return false;
  const mNext = lines[idx + 1]?.match(OPTION_RE);
  return mNext !== null && mNext[1] === 'B';
}

export function parseExamDump(text: string, images: string[] = []): ParseResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const questions: ParsedQuestion[] = [];
  let optionSetsFound = 0;
  let idx = 0;

  while (idx < lines.length) {
    const preBoundaryLines: string[] = [];
    while (
      idx < lines.length &&
      !isOptionSetStart(lines, idx) &&
      !INTERACTIVE_MARKER_RE.test(lines[idx])
    ) {
      if (!QUESTION_HEADER_RE.test(lines[idx])) preBoundaryLines.push(lines[idx]);
      idx++;
    }

    if (idx >= lines.length) break;

    // — Interactive branch —
    if (INTERACTIVE_MARKER_RE.test(lines[idx])) {
      idx++; // consume the marker line
      const interactiveLines: string[] = [];
      while (
        idx < lines.length &&
        !isOptionSetStart(lines, idx) &&
        !QUESTION_HEADER_RE.test(lines[idx])
      ) {
        if (!INTERACTIVE_MARKER_RE.test(lines[idx])) interactiveLines.push(lines[idx]);
        idx++;
      }
      const { questionText, imageData } = extractInteractiveContent(
        [...preBoundaryLines, ...interactiveLines],
        images
      );
      if (questionText) {
        questions.push({
          question: questionText,
          type: 'interactive',
          options: [],
          correct_answers: [],
          explanation: null,
          links: null,
          imageData,
        });
      }
      continue;
    }

    // — Regular option-set branch —
    optionSetsFound++;
    const questionText = preBoundaryLines.join(' ').trim();

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
      while (idx < lines.length && !LINKS_HEADER_RE.test(lines[idx]) && !isOptionSetStart(lines, idx)) {
        explLines.push(lines[idx++]);
      }
      explanation = explLines.join('\n').trim() || null;
    }

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

    let type: QuestionType = 'multiple_choice';
    if (options.length === 2 && TRUE_RE.test(options[0].text) && FALSE_RE.test(options[1].text)) {
      type = 'true_false';
    } else if (correctAnswers.length > 1 || MULTI_SELECT_RE.test(questionText)) {
      type = 'multi_select';
    }

    questions.push({ question: questionText, type, options, correct_answers: correctAnswers, explanation, links: links.length > 0 ? links : null });
  }

  if (optionSetsFound === 0 && questions.length === 0) return parseByHeaders(text);

  const headerCount = (text.match(/^\s*(?:question\s*:?\s*\d+|q\s*:?\s*\d+(?![^\S\n]*[a-zA-Z]))/gim) ?? []).length;
  const interactiveCount = questions.filter(q => q.type === 'interactive').length;
  const expectedCount = Math.max(optionSetsFound + interactiveCount, headerCount);
  const scorableCount = questions.filter(q => q.type !== 'interactive').length;
  const confidence = optionSetsFound > 0 ? scorableCount / optionSetsFound : (questions.length > 0 ? 1 : 0);

  return { success: confidence >= 0.5, questions, confidence, expectedCount };
}

function extractInteractiveContent(rawLines: string[], images: string[]): { questionText: string; imageData: string | null } {
  let imageData: string | null = null;
  let done = false;
  const textLines: string[] = [];

  for (const l of rawLines) {
    if (done) continue;
    if (/^Answer:/i.test(l) || EXPLANATION_RE.test(l) || LINKS_HEADER_RE.test(l)) {
      done = true;
      continue;
    }
    const m = l.match(IMG_PLACEHOLDER_RE);
    if (m) {
      const imgIdx = parseInt(m[1]);
      if (!imageData && images[imgIdx]) imageData = images[imgIdx];
      continue;
    }
    textLines.push(l);
  }

  return { questionText: textLines.join(' ').trim(), imageData };
}

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
        } catch { /* skip malformed URL */ }
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
