import { BrowserWindow, WebContentsView } from 'electron';
import { DEFAULT_RATIO, clampRatio } from './ratio';

// panel and resizeListener are module-level singletons — correct for a single-window app.
// If multiple BrowserWindows are ever added (e.g., macOS multi-window), this must be
// refactored to a Map<BrowserWindow, WebContentsView> per-window state.

let panel: WebContentsView | null = null;
let resizeListener: (() => void) | null = null;
let panelRatio = DEFAULT_RATIO;

export function openPanel(mainWindow: BrowserWindow, url: string): void {
  if (!panel) {
    panel = new WebContentsView({
      webPreferences: { partition: 'persist:ai-panel', contextIsolation: true },
    });
    mainWindow.contentView.addChildView(panel);
  }
  sizePanelToWindow(mainWindow);
  panel.webContents.loadURL(url);

  if (!resizeListener) {
    resizeListener = () => sizePanelToWindow(mainWindow);
    mainWindow.on('resize', resizeListener);
  }
}

export function closePanel(mainWindow: BrowserWindow): void {
  if (!panel) return;
  panelRatio = DEFAULT_RATIO;
  if (resizeListener) {
    mainWindow.removeListener('resize', resizeListener);
    resizeListener = null;
  }
  mainWindow.contentView.removeChildView(panel);
  panel.webContents.destroy();
  panel = null;
}

export function isPanelOpen(): boolean {
  return panel !== null;
}

const TOOLBAR_HEIGHT = 44; // matches .panel-toolbar height in app.css
const STATUS_BAR_HEIGHT = 24; // matches .status-bar height in app.css

function sizePanelToWindow(win: BrowserWindow): void {
  if (!panel) return;
  const [w, h] = win.getContentSize();
  const panelW = Math.floor(w * panelRatio);
  panel.setBounds({ x: w - panelW, y: TOOLBAR_HEIGHT, width: panelW, height: h - TOOLBAR_HEIGHT - STATUS_BAR_HEIGHT });
}

export function setPanelRatio(mainWindow: BrowserWindow, ratio: number): void {
  panelRatio = clampRatio(ratio);
  sizePanelToWindow(mainWindow);
}
