import { app, BrowserWindow, ipcMain, dialog, clipboard } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { initDb } from './db/schema';
import { getAllBanks, createBank, deleteBank, getBankStats } from './db/banks';
import { insertQuestions, getQuestionsForBank } from './db/questions';
import { createAttempt, completeAttempt, getAttemptsForBank } from './db/attempts';
import { saveResponse, getResponsesForAttempt } from './db/responses';
import { extractText } from './parser/fileExtractor';
import { parseExamDump } from './parser/ruleParser';
import { generatePrompt } from './parser/promptGenerator';
import { openPanel, closePanel } from './browser/panel';
import { IPC } from './ipc/channels';
import type { ParsedQuestion, CreateAttemptInput, SaveResponseInput, CompleteAttemptInput } from './types';

if (started) app.quit();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
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
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function registerIpcHandlers() {
  ipcMain.handle(IPC.IMPORT_FILE, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Exam Files', extensions: ['pdf', 'docx', 'doc', 'txt'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const text = await extractText(filePath);
    return { text, fileName: path.basename(filePath) };
  });

  ipcMain.handle(IPC.PARSE_FILE, async (_e, text: string) => {
    return parseExamDump(text);
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

  ipcMain.handle(IPC.LOAD_QUESTIONS, (_e, bankId: number) => getQuestionsForBank(bankId));

  ipcMain.handle(IPC.DELETE_BANK, (_e, bankId: number) => deleteBank(bankId));

  ipcMain.handle(IPC.CREATE_ATTEMPT, (_e, input: CreateAttemptInput) => createAttempt(input));

  ipcMain.handle(IPC.SAVE_RESPONSE, (_e, input: SaveResponseInput) => saveResponse(input));

  ipcMain.handle(IPC.COMPLETE_ATTEMPT, (_e, input: CompleteAttemptInput) => completeAttempt(input));

  ipcMain.handle(IPC.GET_HISTORY, (_e, bankId: number) => getAttemptsForBank(bankId));

  ipcMain.handle(IPC.GET_RESPONSES, (_e, attemptId: number) => getResponsesForAttempt(attemptId));

  ipcMain.handle(IPC.OPEN_PANEL, (_e, url: string) => {
    if (!mainWindow) return;
    openPanel(mainWindow, url);
    mainWindow.webContents.send(IPC.PANEL_STATE_CHANGED, true);
  });

  ipcMain.handle(IPC.CLOSE_PANEL, () => {
    if (!mainWindow) return;
    closePanel(mainWindow);
    mainWindow.webContents.send(IPC.PANEL_STATE_CHANGED, false);
  });

  ipcMain.handle(IPC.GENERATE_PROMPT, (_e, text: string) => generatePrompt(text));

  ipcMain.handle(IPC.COPY_TO_CLIPBOARD, (_e, text: string) => clipboard.writeText(text));
}
