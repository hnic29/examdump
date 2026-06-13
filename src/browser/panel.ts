import { BrowserWindow, WebContentsView, shell, type WebContents } from 'electron';
import { DEFAULT_RATIO, clampRatio } from './ratio';
import { AI_SERVICES, type AiService } from './services';

// We keep ONE live WebContentsView per service (plus one for ad-hoc reference
// links). Switching between services only toggles which view is visible, so each
// page keeps its full live state — the in-progress conversation and scroll
// position — instead of reloading. That's what lets the user bounce between
// Claude / ChatGPT / Arena and land back exactly where they left off.
//
// These are module-level singletons — correct for a single-window app. If
// multiple BrowserWindows are ever added (e.g. macOS multi-window), this must be
// refactored to per-window state.

const REFERENCE_KEY = 'reference';

interface PanelView {
  view: WebContentsView;
  loaded: boolean;
}

const views = new Map<string, PanelView>();
let activeKey: string | null = null;
let resizeListener: (() => void) | null = null;
let panelRatio = DEFAULT_RATIO;

function ensureResizeListener(mainWindow: BrowserWindow): void {
  if (!resizeListener) {
    resizeListener = () => sizePanelToWindow(mainWindow);
    mainWindow.on('resize', resizeListener);
  }
}

// These panels load untrusted external content (the AI services and arbitrary
// reference URLs from a question). Harden each view: popups (target=_blank,
// window.open) go to the OS browser instead of spawning an Electron window with
// default privileges, and top-level navigation is restricted to http(s) so a
// page can't redirect the view to file:// or another local scheme. In-page
// http(s) navigation is left alone so the AI services work normally.
function hardenWebContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      event.preventDefault();
      return;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') event.preventDefault();
  });
}

function getOrCreateView(mainWindow: BrowserWindow, key: string, partition: string): PanelView {
  let entry = views.get(key);
  if (!entry) {
    const view = new WebContentsView({
      webPreferences: { partition, contextIsolation: true },
    });
    hardenWebContents(view.webContents);
    mainWindow.contentView.addChildView(view);
    view.setVisible(false);
    entry = { view, loaded: false };
    views.set(key, entry);
  }
  return entry;
}

function setActive(key: string): void {
  for (const [k, entry] of views) {
    entry.view.setVisible(k === key);
  }
  activeKey = key;
}

// Open / switch to one of the named AI services. Each service has its own
// persistent partition (so logins persist independently) and its view is loaded
// only once — subsequent switches just reveal the existing live page.
export function showAiService(mainWindow: BrowserWindow, service: AiService): void {
  const def = AI_SERVICES.find(s => s.id === service);
  if (!def) return;
  ensureResizeListener(mainWindow);
  const entry = getOrCreateView(mainWindow, service, `persist:ai-${service}`);
  if (!entry.loaded) {
    entry.view.webContents.loadURL(def.url);
    entry.loaded = true;
  }
  setActive(service);
  sizePanelToWindow(mainWindow);
}

// Open an arbitrary reference URL (e.g. a question's reference link) in a
// dedicated view so it never clobbers an AI conversation.
export function showReference(mainWindow: BrowserWindow, url: string): void {
  ensureResizeListener(mainWindow);
  const entry = getOrCreateView(mainWindow, REFERENCE_KEY, 'persist:ai-reference');
  entry.view.webContents.loadURL(url);
  entry.loaded = true;
  setActive(REFERENCE_KEY);
  sizePanelToWindow(mainWindow);
}

export function closePanel(mainWindow: BrowserWindow): void {
  if (views.size === 0) return;
  panelRatio = DEFAULT_RATIO;
  if (resizeListener) {
    mainWindow.removeListener('resize', resizeListener);
    resizeListener = null;
  }
  for (const entry of views.values()) {
    mainWindow.contentView.removeChildView(entry.view);
    entry.view.webContents.destroy();
  }
  views.clear();
  activeKey = null;
}

export function isPanelOpen(): boolean {
  return views.size > 0;
}

const TOOLBAR_HEIGHT = 44; // matches .panel-toolbar height in app.css
const STATUS_BAR_HEIGHT = 24; // matches .status-bar height in app.css

function sizePanelToWindow(win: BrowserWindow): void {
  const active = activeKey ? views.get(activeKey) : null;
  if (!active) return;
  const [w, h] = win.getContentSize();
  const panelW = Math.floor(w * panelRatio);
  active.view.setBounds({ x: w - panelW, y: TOOLBAR_HEIGHT, width: panelW, height: h - TOOLBAR_HEIGHT - STATUS_BAR_HEIGHT });
}

export function setPanelRatio(mainWindow: BrowserWindow, ratio: number): void {
  panelRatio = clampRatio(ratio);
  sizePanelToWindow(mainWindow);
}
