# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**ExamDump** is an exam-prep / quiz app — study from question banks ("dumps"), take practice tests, and track scores. It ships as two products from one monorepo:

- **Desktop** (`apps/desktop`) — an Electron app. Runs fully offline; all question banks and results live in a local SQLite file on the user's machine.
- **Web** (`apps/web`) — a browser SPA. Also fully offline-first: data lives in the browser via an in-memory SQLite engine (sql.js) persisted to IndexedDB. No backend/accounts exist yet — that's a deliberately open seam for later, not a missing feature.

Both apps render the **same React UI and business logic**, which lives in `packages/shared` and is platform-agnostic.

**Stack:** React + TypeScript + Vite, npm workspaces monorepo. Desktop additionally uses Electron 42 (Electron Forge `vite-typescript` template) + better-sqlite3. Web additionally uses sql.js (WASM SQLite) + idb-keyval (IndexedDB) + pdfjs-dist/mammoth-browser for file parsing.

## Commands

Run from the repo root:

```bash
npm start            # launch the desktop app in dev mode (HMR on the renderer)
npm run start:web     # launch the web app dev server (Vite, http://localhost:5183)
npm run lint          # ESLint over .ts/.tsx across all workspaces
npm test              # vitest across all workspaces (packages/shared, apps/desktop, apps/web)
npm run package        # bundle the desktop app into a runnable app (no installer)
npm run make            # build desktop platform distributables / installers
```

Single-test invocation: `npx vitest run --project=<shared|desktop|web> -t "<test name>"`.

## Monorepo layout

```
packages/shared/    # platform-agnostic: React UI (App.tsx, components/, hooks/, games/),
                     # the SQL query layer (db/banks.ts, questions.ts, ...), parsing rules,
                     # AI-service list, util. Consumed by both apps via the `@shared` alias
                     # (resolved straight to source in every Vite/vitest config — no build step).
apps/desktop/        # Electron: main.ts, preload.ts, renderer.tsx, db/schema.ts (better-sqlite3),
                     # parser/fileExtractor.ts (pdf-parse/Node mammoth), browser/panel.ts
                     # (embedded AI-chat split-panel via WebContentsView), forge.config.ts.
apps/web/            # Vite SPA: db/schema-web.ts + db/webSqlite.ts (sql.js + IndexedDB),
                     # parser/webFileExtractor.ts (pdfjs-dist + mammoth browser build),
                     # api/webElectronApi.ts (browser-native implementation of ElectronAPI).
```

## Architecture

### The two cross-app contracts

Everything both apps share funnels through two TypeScript interfaces, both defined in `packages/shared/src`:

1. **`ElectronAPI`** (`types.ts`) — the entire surface the UI calls (`window.electronAPI.*`): bank/question CRUD, quiz attempts, file import/export, the AI helper, clipboard. Components in `packages/shared/src/components` and `App.tsx` call this directly — they have **no idea** which platform they're running on.
   - Desktop implements it in `apps/desktop/src/preload.ts`, forwarding every method over `ipcRenderer.invoke` to an `ipcMain.handle` in `apps/desktop/src/main.ts`.
   - Web implements it in `apps/web/src/api/webElectronApi.ts`, calling straight into the shared `db/*.ts` query modules in the same JS context — no IPC-equivalent needed.
   - **When adding a method:** add it to `ElectronAPI`, then implement it in both places. A missing implementation on one platform is a type error, not a silent runtime `undefined` — keep it that way.

2. **`SqliteLike`** (`db/context.ts`) — the minimal synchronous `prepare(sql).run/get/all(...)` + `exec`/`pragma`/`transaction` surface the shared `db/banks.ts`, `questions.ts`, `attempts.ts`, `responses.ts`, `waterfall.ts`, `flags.ts`, `games.ts` modules depend on. Neither storage engine is referenced directly by those modules.
   - Desktop's better-sqlite3 `Database` instance satisfies this shape natively (see `apps/desktop/src/db/schema.ts`, which calls the shared `setDb()` after opening the file).
   - Web's `apps/web/src/db/webSqlite.ts` wraps a sql.js `Database` to match it, adding debounced + checkpoint-triggered IndexedDB persistence (see the comments there for the durability model).
   - The DDL itself (`packages/shared/src/db/sql/schema.sql.ts`) is shared verbatim by both engines so the schema can never drift between them. Desktop wraps it in a hand-rolled migration dance to carry forward existing users' data; web just runs the fresh DDL once per new IndexedDB-backed database.

### Desktop: Electron's two-process model

- **Main process** (`apps/desktop/src/main.ts`) — Node.js. Owns the app lifecycle, native windows (`BrowserWindow`), and all privileged work: SQLite, filesystem access, IPC handlers, the embedded AI-chat split-panel (`browser/panel.ts`). `electron-squirrel-startup` handles Windows installer events here.
- **Renderer process** (`apps/desktop/src/renderer.tsx` + `index.html`) — Chromium, mounts the shared `App`. Has **no** direct Node/DB access. `contextIsolation` is on, `nodeIntegration` is off.
- **Preload script** (`apps/desktop/src/preload.ts`) — the only bridge, via `contextBridge`.

Vite uses three separate configs for the three entry points (`vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`) — keep them separate, they bundle under different Electron/browser targets.

### Web: single-thread Vite SPA

`apps/web/src/main.tsx` boots the app: initializes sql.js, loads any persisted database from IndexedDB (or runs the fresh DDL for a new one), installs the `webElectronApi` implementation on `window.electronAPI`, then mounts the shared `App` — same component tree as desktop, unmodified.

The AI helper is desktop-only as an *embedded* panel — most AI chat sites block iframe embedding via CSP anyway, so web opens the service in a new tab instead (`webElectronApi.openPanel`/`setAiService`). This is a deliberate, permanent platform difference, not a TODO: `App.tsx`'s panel UI (toolbar, divider, close button) only ever renders when `onPanelStateChanged`'s callback fires, and the web implementation never invokes it — so the panel simply never appears, no `App.tsx` changes needed.

## Key conventions

- Shared code (`packages/shared`) must stay platform-agnostic: no direct Node APIs, no direct Electron APIs, no direct browser-only APIs (`window.*` outside `window.electronAPI`, `document.*`, etc.) except inside the two apps' own platform-specific modules.
- All desktop DB and filesystem work stays in the main process — never add Node APIs to the desktop renderer.
- When adding a new feature the UI needs from the platform: add the method to `ElectronAPI` (`packages/shared/src/types.ts`), implement it in `apps/desktop` (IPC channel constant → `ipcMain.handle` → `preload.ts`) **and** in `apps/web/src/api/webElectronApi.ts`, then call it from shared UI code via `window.electronAPI`.
- When adding a new SQL query used by more than one platform, put it in `packages/shared/src/db/*.ts` against the `SqliteLike` interface (`db/context.ts`) — never import `better-sqlite3` or `sql.js` directly from shared code.
- Add SQLite (better-sqlite3) as a desktop-only production dependency (`apps/desktop/package.json`); its native module must be compiled for the Electron runtime — use `@electron-forge/plugin-auto-unpack-natives` (already in config) and rebuild via `electron-rebuild` after install. The root `pretest`/`posttest` scripts handle the Node ↔ Electron ABI rebuild dance around `npm test`.
