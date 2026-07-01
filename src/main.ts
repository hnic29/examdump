import { app, BrowserWindow, ipcMain, dialog, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import started from 'electron-squirrel-startup';
import { initDb } from './db/schema';
import { getAllBanks, createBank, deleteBank, getBankStats } from './db/banks';
import { insertQuestions, getQuestionsForBank, updateQuestion } from './db/questions';
import { flagQuestion, unflagQuestion, getFlaggedForBank } from './db/flags';
import { saveGameScore, getBestScores } from './db/games';
import { createAttempt, completeAttempt, getAttemptsForBank, getActiveAttempt, deleteAttempt } from './db/attempts';
import { saveResponse, updateResponse, getResponsesForAttempt } from './db/responses';
import { getWaterfallProgress, advanceWaterfall } from './db/waterfall';
import { extractFileContent } from './parser/fileExtractor';
import { parseExamDump } from './parser/ruleParser';
import { generatePrompt } from './parser/promptGenerator';
import { toJsonFileName } from './util/filename';
import { showReference, showAiService, closePanel, setPanelRatio } from './browser/panel';
import { isAiService } from './browser/services';
import { createSplashWindow } from './splash';
import { IPC } from './ipc/channels';
import type { ParsedQuestion, CreateAttemptInput, SaveResponseInput, CompleteAttemptInput, UpdateQuestionInput } from './types';

if (started) app.quit();

let mainWindow: BrowserWindow | null = null;
const SPLASH_MS = 5000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.on('ready', () => {
  initDb(path.join(app.getPath('userData'), 'examdump.db'));
  registerIpcHandlers();
  const splash = createSplashWindow();
  createWindow();
  setTimeout(() => {
    if (!splash.isDestroyed()) splash.close();
    mainWindow?.show();
  }, SPLASH_MS);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function registerIpcHandlers() {
  function requirePosInt(v: unknown, name: string): number {
    if (!Number.isInteger(v) || (v as number) < 1) {
      throw new Error(`Invalid ${name}: expected positive integer, got ${v}`);
    }
    return v as number;
  }

  ipcMain.handle(IPC.IMPORT_FILE, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Exam Files', extensions: ['pdf', 'docx', 'doc', 'txt', 'json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
      const text = await fs.readFile(filePath, 'utf-8');
      return { text, fileName, isJson: true, images: [] };
    }
    const { text, images } = await extractFileContent(filePath);
    return { text, fileName, isJson: false, images };
  });

  ipcMain.handle(IPC.PARSE_FILE, async (_e, text: string, images?: string[]) => {
    return parseExamDump(text, images ?? []);
  });

  ipcMain.handle(IPC.INGEST_JSON, async (_e, json: string, name: string) => {
    let parsed: { questions: ParsedQuestion[] };
    try {
      parsed = JSON.parse(json) as { questions: ParsedQuestion[] };
    } catch {
      throw new Error('Invalid JSON: could not parse exam data. Make sure you copied the full JSON response from the AI.');
    }
    const bank = createBank(name, 'ai-parsed');
    const count = insertQuestions(bank.id, parsed.questions);
    return { id: bank.id, questionCount: count };
  });

  ipcMain.handle(IPC.LOAD_BANKS, () => {
    return getAllBanks().map(b => ({ ...b, ...getBankStats(b.id) }));
  });

  ipcMain.handle(IPC.LOAD_QUESTIONS, (_e, bankId: number) => getQuestionsForBank(requirePosInt(bankId, 'bankId')));

  ipcMain.handle(IPC.DELETE_BANK, (_e, bankId: number) => deleteBank(requirePosInt(bankId, 'bankId')));

  ipcMain.handle(IPC.CREATE_ATTEMPT, (_e, input: CreateAttemptInput) => {
    requirePosInt(input.bankId, 'bankId');
    return createAttempt(input);
  });

  ipcMain.handle(IPC.SAVE_RESPONSE, (_e, input: SaveResponseInput) => {
    requirePosInt(input.attemptId, 'attemptId');
    requirePosInt(input.questionId, 'questionId');
    return saveResponse(input);
  });

  ipcMain.handle(IPC.UPDATE_RESPONSE, (_e, input: SaveResponseInput) => {
    requirePosInt(input.attemptId, 'attemptId');
    requirePosInt(input.questionId, 'questionId');
    return updateResponse(input);
  });

  ipcMain.handle(IPC.COMPLETE_ATTEMPT, (_e, input: CompleteAttemptInput) => {
    requirePosInt(input.attemptId, 'attemptId');
    const score = Math.min(100, Math.max(0, Number.isFinite(input.score) ? input.score : 0));
    return completeAttempt({ ...input, score });
  });

  ipcMain.handle(IPC.GET_HISTORY, (_e, bankId: number) => getAttemptsForBank(requirePosInt(bankId, 'bankId')));

  ipcMain.handle(IPC.GET_RESPONSES, (_e, attemptId: number) => getResponsesForAttempt(requirePosInt(attemptId, 'attemptId')));

  ipcMain.handle(IPC.EXPORT_BANK, async (_e, bankId: number) => {
    if (!mainWindow) return;
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
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `examdump-bank-${bankId}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return;
    await fs.writeFile(result.filePath, JSON.stringify(exported, null, 2), 'utf-8');
  });

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

  ipcMain.handle(IPC.OPEN_PANEL, (_e, url: string) => {
    if (!mainWindow) return;
    let parsed: URL;
    try { parsed = new URL(url); } catch { return; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    showReference(mainWindow, parsed.toString());
    mainWindow.webContents.send(IPC.PANEL_STATE_CHANGED, true);
  });

  ipcMain.handle(IPC.SET_AI_SERVICE, (_e, service: string) => {
    if (!mainWindow || !isAiService(service)) return;
    showAiService(mainWindow, service);
    mainWindow.webContents.send(IPC.PANEL_STATE_CHANGED, true);
  });

  ipcMain.handle(IPC.CLOSE_PANEL, () => {
    if (!mainWindow) return;
    closePanel(mainWindow);
    mainWindow.webContents.send(IPC.PANEL_STATE_CHANGED, false);
  });

  ipcMain.handle(IPC.GENERATE_PROMPT, (_e, text: string) => generatePrompt(text));

  ipcMain.handle(IPC.COPY_TO_CLIPBOARD, (_e, text: string) => clipboard.writeText(text));

  ipcMain.handle(IPC.GET_WATERFALL_PROGRESS, (_e, bankId: number) =>
    getWaterfallProgress(requirePosInt(bankId, 'bankId'))
  );

  ipcMain.handle(IPC.ADVANCE_WATERFALL, (_e, bankId: number, dailyCount: number, totalQuestions: number) =>
    advanceWaterfall(
      requirePosInt(bankId, 'bankId'),
      requirePosInt(dailyCount, 'dailyCount'),
      requirePosInt(totalQuestions, 'totalQuestions')
    )
  );

  ipcMain.handle(IPC.GET_ACTIVE_ATTEMPT, (_e, bankId: number) => getActiveAttempt(requirePosInt(bankId, 'bankId')));

  ipcMain.handle(IPC.DELETE_ATTEMPT, (_e, attemptId: number) => deleteAttempt(requirePosInt(attemptId, 'attemptId')));

  ipcMain.handle(IPC.UPDATE_QUESTION, (_e, input: UpdateQuestionInput) => {
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
  });

  ipcMain.handle(IPC.FLAG_QUESTION, (_e, questionId: number) => flagQuestion(requirePosInt(questionId, 'questionId')));
  ipcMain.handle(IPC.UNFLAG_QUESTION, (_e, questionId: number) => unflagQuestion(requirePosInt(questionId, 'questionId')));
  ipcMain.handle(IPC.GET_FLAGGED_QUESTIONS, (_e, bankId: number) => getFlaggedForBank(requirePosInt(bankId, 'bankId')));

  ipcMain.handle(IPC.GET_GAME_SCORES, (_e, bankId: number) => getBestScores(requirePosInt(bankId, 'bankId')));
  ipcMain.handle(IPC.SAVE_GAME_SCORE, (_e, bankId: number, gameType: string, score: number) => {
    requirePosInt(bankId, 'bankId');
    if (!Number.isFinite(score) || score < 0) throw new Error('Invalid score');
    saveGameScore(bankId, gameType as Parameters<typeof saveGameScore>[1], Math.floor(score));
  });

  ipcMain.handle(IPC.RESIZE_PANEL, (_e, ratio: number) => {
    if (mainWindow && Number.isFinite(ratio)) setPanelRatio(mainWindow, ratio);
  });
}
