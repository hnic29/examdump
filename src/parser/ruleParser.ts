import type { ParsedQuestion, ParseResult, QuestionOption, QuestionLink, QuestionType } from '../types';

const OPTION_RE = /^([A-E])\.\s+(.+)/;
const ANSWER_RE = /^Answer:\s*([A-E](?:,\s*[A-E])*)/i;
const EXPLANATION_RE = /^Explanation:\s*/i;
const LINKS_HEADER_RE = /^Authoritative Links/i;
const URL_RE = /https?:\/\/[^\s]+/g;
const TRUE_RE = /^true\.?$/i;
const FALSE_RE = /^false\.?$/i;
const MULTI_SELECT_RE = /select\s+(all|two|three|\d+)|choose\s+(all|two|three|\d+)/i;

const QUESTION_HEADER_RE = /^Question:\s*\d+/i;

export function parseExamDump(text: string): ParseResult {
  const blocks = text.split(/(?=Question:\s*\d+)/i).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0) return { success: false, questions: [], confidence: 0, expectedCount: 0 };

  const questions: ParsedQuestion[] = [];
  let recognized = 0;

  for (const block of blocks) {
    const q = parseBlock(block);
    if (q) { questions.push(q); recognized++; }
  }

  // Count blocks that were clearly intended as questions, even if parsing failed
  // (e.g. a PDF whose option-letter prefixes were dropped during text extraction).
  const expectedCount = blocks.filter(b => QUESTION_HEADER_RE.test(b)).length;
  const confidence = recognized / blocks.length;
  return { success: confidence >= 0.5, questions, confidence, expectedCount };
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
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            const labelPart = lines[idx].replace(url, '').trim();
            links.push({ text: labelPart || url, url: parsed.toString() });
          }
        } catch { /* skip malformed URLs */ }
      }
    }
  }

  // Determine question type
  let type: QuestionType = 'multiple_choice';
  if (options.length === 2 &&
      TRUE_RE.test(options[0].text.trim()) &&
      FALSE_RE.test(options[1].text.trim())) {
    type = 'true_false';
  } else if (correctAnswers.length > 1 || MULTI_SELECT_RE.test(questionText)) {
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
