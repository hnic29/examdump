import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipc/channels';
import type { ElectronAPI, CreateAttemptInput, SaveResponseInput, CompleteAttemptInput } from './types';

const api: ElectronAPI = {
  importFile: () => ipcRenderer.invoke(IPC.IMPORT_FILE),
  parseFile: (text) => ipcRenderer.invoke(IPC.PARSE_FILE, text),
  ingestJSON: (json, name) => ipcRenderer.invoke(IPC.INGEST_JSON, json, name),
  loadBanks: () => ipcRenderer.invoke(IPC.LOAD_BANKS),
  loadQuestions: (bankId) => ipcRenderer.invoke(IPC.LOAD_QUESTIONS, bankId),
  deleteBank: (bankId) => ipcRenderer.invoke(IPC.DELETE_BANK, bankId),
  createAttempt: (input: CreateAttemptInput) => ipcRenderer.invoke(IPC.CREATE_ATTEMPT, input),
  saveResponse: (input: SaveResponseInput) => ipcRenderer.invoke(IPC.SAVE_RESPONSE, input),
  completeAttempt: (input: CompleteAttemptInput) => ipcRenderer.invoke(IPC.COMPLETE_ATTEMPT, input),
  getHistory: (bankId) => ipcRenderer.invoke(IPC.GET_HISTORY, bankId),
  getResponses: (attemptId) => ipcRenderer.invoke(IPC.GET_RESPONSES, attemptId),
  openPanel: (url) => ipcRenderer.invoke(IPC.OPEN_PANEL, url),
  closePanel: () => ipcRenderer.invoke(IPC.CLOSE_PANEL),
  generatePrompt: (text) => ipcRenderer.invoke(IPC.GENERATE_PROMPT, text),
  copyToClipboard: (text) => ipcRenderer.invoke(IPC.COPY_TO_CLIPBOARD, text),
  exportBank: (bankId) => ipcRenderer.invoke(IPC.EXPORT_BANK, bankId),
  getWaterfallProgress: (bankId) => ipcRenderer.invoke(IPC.GET_WATERFALL_PROGRESS, bankId),
  advanceWaterfall: (bankId, dailyCount, totalQuestions) =>
    ipcRenderer.invoke(IPC.ADVANCE_WATERFALL, bankId, dailyCount, totalQuestions),
  onPanelStateChanged: (cb) => {
    const handler = (_: unknown, open: boolean) => cb(open);
    ipcRenderer.on(IPC.PANEL_STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.PANEL_STATE_CHANGED, handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
