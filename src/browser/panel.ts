import { BrowserWindow, WebContentsView } from 'electron';

let panel: WebContentsView | null = null;
let resizeListener: (() => void) | null = null;

export function openPanel(mainWindow: BrowserWindow, url: string): void {
  if (!panel) {
    panel = new WebContentsView();
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

function sizePanelToWindow(win: BrowserWindow): void {
  if (!panel) return;
  const [w, h] = win.getContentSize();
  const panelW = Math.floor(w * 0.6);
  panel.setBounds({ x: w - panelW, y: 0, width: panelW, height: h });
}
