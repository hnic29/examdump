import { BrowserWindow, app } from 'electron';

export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    show: true,
    skipTaskbar: true,
    webPreferences: {},
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;font-family:Segoe UI,system-ui,sans-serif;
      background:#161b27;color:#e0e0e0;border-radius:12px;overflow:hidden;
      display:flex;flex-direction:column;align-items:center;justify-content:center;}
    .title{font-size:34px;font-weight:800;letter-spacing:1px;color:#2196f3;}
    .rule{width:120px;height:2px;background:#2d3a52;margin:14px 0;}
    .ver{font-size:13px;color:#8b9cb0;}
    .load{font-size:12px;color:#4a5568;margin-top:18px;}
  </style></head><body>
    <div class="title">ExamDump</div><div class="rule"></div>
    <div class="ver">v${app.getVersion()}</div>
    <div class="load">Loading your question banks…</div>
  </body></html>`;
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return splash;
}
