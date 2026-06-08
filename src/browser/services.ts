// AI helper services available in the side panel. This module is intentionally
// free of any Electron/Node imports so it can be shared by both the main process
// (panel.ts) and the renderer (App.tsx / Sidebar.tsx).

export type AiService = 'claude' | 'chatgpt' | 'arena';

export interface AiServiceDef {
  id: AiService;
  label: string;
  url: string;
}

export const AI_SERVICES: AiServiceDef[] = [
  { id: 'claude', label: 'Claude', url: 'https://claude.ai' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com' },
  // The AI model "arena" — change this URL if you meant a different site.
  { id: 'arena', label: 'Arena', url: 'https://lmarena.ai' },
];

export function isAiService(value: unknown): value is AiService {
  return AI_SERVICES.some(s => s.id === value);
}
