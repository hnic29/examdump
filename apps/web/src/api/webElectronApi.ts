import type {
  ElectronAPI, ParsedQuestion, CreateAttemptInput, SaveResponseInput, CompleteAttemptInput, UpdateQuestionInput,
} from '@shared/types';
import { getAllBanks, createBank, deleteBank, getBankStats } from '@shared/db/banks';
import { insertQuestions, getQuestionsForBank, updateQuestion } from '@shared/db/questions';
import { flagQuestion, unflagQuestion, getFlaggedForBank } from '@shared/db/flags';
import { saveGameScore, getBestScores } from '@shared/db/games';
import { createAttempt, completeAttempt, getAttemptsForBank, getActiveAttempt, deleteAttempt } from '@shared/db/attempts';
import { saveResponse, updateResponse, getResponsesForAttempt } from '@shared/db/responses';
import { getWaterfallProgress, advanceWaterfall } from '@shared/db/waterfall';
import { parseExamDump } from '@shared/parser/ruleParser';
import { generatePrompt } from '@shared/parser/promptGenerator';
import { toJsonFileName } from '@shared/util/filename';
import { AI_SERVICES, isAiService } from '@shared/browser/services';
import { extractFileContent } from '../parser/webFileExtractor';
import { getWebDbAdapter } from '../db/schema-web';

function requirePosInt(v: unknown, name: string): number {
  if (!Number.isInteger(v) || (v as number) < 1) {
    throw new Error(`Invalid ${name}: expected positive integer, got ${v}`);
  }
  return v as number;
}

/** See apps/web/src/db/webSqlite.ts — bypasses the debounce for writes that must never be lost. */
function flushSoon(): void {
  void getWebDbAdapter().flushNow();
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.doc,.txt,.json';
    input.style.display = 'none';
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const webElectronApi: ElectronAPI = {
  importFile: async () => {
    const file = await pickFile();
    if (!file) return null;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (ext === '.json') {
      return { text: await file.text(), fileName: file.name, isJson: true, images: [] };
    }
    const { text, images } = await extractFileContent(file);
    return { text, fileName: file.name, isJson: false, images };
  },

  parseFile: async (text, images) => parseExamDump(text, images ?? []),

  ingestJSON: async (json, name) => {
    let parsed: { questions: ParsedQuestion[] };
    try {
      parsed = JSON.parse(json) as { questions: ParsedQuestion[] };
    } catch {
      throw new Error('Invalid JSON: could not parse exam data. Make sure you copied the full JSON response from the AI.');
    }
    const bank = createBank(name, 'ai-parsed');
    const count = insertQuestions(bank.id, parsed.questions);
    flushSoon();
    return { id: bank.id, questionCount: count };
  },

  loadBanks: async () => getAllBanks().map(b => ({ ...b, ...getBankStats(b.id) })),

  loadQuestions: async (bankId) => getQuestionsForBank(requirePosInt(bankId, 'bankId')),

  deleteBank: async (bankId) => {
    deleteBank(requirePosInt(bankId, 'bankId'));
    flushSoon();
  },

  createAttempt: async (input: CreateAttemptInput) => {
    requirePosInt(input.bankId, 'bankId');
    return createAttempt(input);
  },

  saveResponse: async (input: SaveResponseInput) => {
    requirePosInt(input.attemptId, 'attemptId');
    requirePosInt(input.questionId, 'questionId');
    saveResponse(input);
  },

  updateResponse: async (input: SaveResponseInput) => {
    requirePosInt(input.attemptId, 'attemptId');
    requirePosInt(input.questionId, 'questionId');
    updateResponse(input);
  },

  completeAttempt: async (input: CompleteAttemptInput) => {
    requirePosInt(input.attemptId, 'attemptId');
    const score = Math.min(100, Math.max(0, Number.isFinite(input.score) ? input.score : 0));
    completeAttempt({ ...input, score });
    flushSoon();
  },

  getHistory: async (bankId) => getAttemptsForBank(requirePosInt(bankId, 'bankId')),

  getResponses: async (attemptId) => getResponsesForAttempt(requirePosInt(attemptId, 'attemptId')),

  exportBank: async (bankId) => {
    requirePosInt(bankId, 'bankId');
    const questions = getQuestionsForBank(bankId);
    const exported = {
      questions: questions.map(q => ({
        question: q.questionText,
        type: q.questionType,
        options: q.options,
        correct_answers: q.correctAnswers,
        explanation: q.explanation,
        links: q.links,
      })),
    };
    downloadJson(JSON.stringify(exported, null, 2), `examdump-bank-${bankId}.json`);
  },

  saveGeneratedJson: async (json, defaultName) => {
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
    downloadJson(json, toJsonFileName(defaultName));
  },

  getWaterfallProgress: async (bankId) => getWaterfallProgress(requirePosInt(bankId, 'bankId')),

  advanceWaterfall: async (bankId, dailyCount, totalQuestions) =>
    advanceWaterfall(
      requirePosInt(bankId, 'bankId'),
      requirePosInt(dailyCount, 'dailyCount'),
      requirePosInt(totalQuestions, 'totalQuestions')
    ),

  getActiveAttempt: async (bankId) => getActiveAttempt(requirePosInt(bankId, 'bankId')),

  deleteAttempt: async (attemptId) => {
    deleteAttempt(requirePosInt(attemptId, 'attemptId'));
    flushSoon();
  },

  updateQuestion: async (input: UpdateQuestionInput) => {
    requirePosInt(input.id, 'id');
    if (typeof input.questionText !== 'string' || !input.questionText.trim()) throw new Error('questionText is required');
    if (!Array.isArray(input.options) || input.options.length === 0) throw new Error('options must be a non-empty array');
    if (!Array.isArray(input.correctAnswers) || input.correctAnswers.length === 0) throw new Error('correctAnswers must be non-empty');
    updateQuestion(input.id, {
      questionText: input.questionText.trim(),
      options: input.options,
      correctAnswers: input.correctAnswers,
      explanation: input.explanation ?? null,
      imageData: input.imageData ?? null,
    });
    flushSoon();
  },

  flagQuestion: async (questionId) => flagQuestion(requirePosInt(questionId, 'questionId')),
  unflagQuestion: async (questionId) => unflagQuestion(requirePosInt(questionId, 'questionId')),
  getFlaggedQuestions: async (bankId) => getFlaggedForBank(requirePosInt(bankId, 'bankId')),

  getGameScores: async (bankId) => getBestScores(requirePosInt(bankId, 'bankId')),
  saveGameScore: async (bankId, gameType, score) => {
    requirePosInt(bankId, 'bankId');
    if (!Number.isFinite(score) || score < 0) throw new Error('Invalid score');
    saveGameScore(bankId, gameType, Math.floor(score));
    flushSoon();
  },

  generatePrompt: async (text) => generatePrompt(text),

  copyToClipboard: async (text) => {
    await navigator.clipboard.writeText(text);
  },

  // The AI helper is an embedded split-panel on desktop (WebContentsView); most AI chat
  // sites block iframe embedding via CSP anyway, so the web equivalent opens a new tab.
  // `panelOpen` in App.tsx is only ever set true by the onPanelStateChanged callback below,
  // which this implementation never invokes — so the panel UI simply never renders.
  openPanel: async (url) => {
    window.open(url, '_blank', 'noopener');
  },
  setAiService: async (service) => {
    if (!isAiService(service)) return;
    const def = AI_SERVICES.find(s => s.id === service);
    if (def) window.open(def.url, '_blank', 'noopener');
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- no embedded panel to close on web
  closePanel: async () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- no embedded panel to resize on web
  resizePanel: async () => {},
  // Never invoked (see the comment above openPanel) — no listener to store.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onPanelStateChanged: () => () => {},
};

export function installWebElectronApi(): void {
  window.electronAPI = webElectronApi;
}
