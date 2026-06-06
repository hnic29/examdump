# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**ExamDump** is a desktop exam-prep / quiz app — study from question banks ("dumps"), take practice tests, and track scores. It runs fully offline; all question banks and results live on the user's machine.

**Stack:** Electron 42 + React + TypeScript + Vite (Electron Forge `vite-typescript` template) + SQLite for local persistence.

## Commands

```bash
npm start            # launch the app in dev mode (HMR on the renderer)
npm run lint         # ESLint over .ts/.tsx
npm run package      # bundle into a runnable app (no installer)
npm run make         # build platform distributables / installers
```

No test runner is configured yet. When one is added, record the single-test invocation here.

## Architecture

The project follows Electron's **two-process** model — this is the central constraint:

- **Main process** (`src/main.ts`) — Node.js. Owns the app lifecycle, native windows (`BrowserWindow`), and all privileged work: **SQLite database**, filesystem access (importing/exporting question banks), and IPC handlers. `electron-squirrel-startup` handles Windows installer events here.
- **Renderer process** (`src/renderer.ts` + `index.html`) — Chromium. Runs the React UI. Has **no** direct Node/DB access. `contextIsolation` is on, `nodeIntegration` is off.
- **Preload script** (`src/preload.ts`) — the only bridge. Uses `contextBridge` to expose a narrow typed API to the renderer. Every new capability the UI needs crosses as: IPC handler in main → method in preload → call in renderer.

Vite uses **three separate configs** for the three entry points (`vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`). Keep them separate — they bundle under different Electron/browser targets and constraints.

## Key conventions

- All DB and filesystem work stays in the main process — never add Node APIs to the renderer.
- When adding a new feature that the renderer needs from main: define the IPC channel name as a typed constant, add the `ipcMain.handle` in main, expose it via `contextBridge` in preload, and call it from the renderer. Share the TypeScript type for the contract across all three files.
- Add SQLite (e.g. `better-sqlite3`) as a production dependency; its native module must be compiled for the Electron runtime — use `@electron-forge/plugin-auto-unpack-natives` (already in config) and rebuild via `electron-rebuild` after install.
