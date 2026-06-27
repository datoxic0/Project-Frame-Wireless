const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let pythonServer   = null;
let broadcasterProc = null;
const webServers   = new Map(); // appId → { proc, url }
const broadcastDir = path.join(__dirname, 'public', 'broadcast');

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160, height: 780,
    minWidth: 860, minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f172a', symbolColor: '#e2e8f0', height: 40 },
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    backgroundColor: '#0f172a',
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  fs.mkdirSync(broadcastDir, { recursive: true });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { killAll(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', killAll);

function killAll() {
  stopPythonServer();
  stopBroadcast();
  webServers.forEach(({ proc }) => { try { proc.kill(); } catch {} });
  webServers.clear();
}

// ── Python file server ────────────────────────────────────────────────────────
function stopPythonServer() {
  if (pythonServer) { try { pythonServer.kill(); } catch {} pythonServer = null; }
}

ipcMain.handle('server:start', (event, port, sharedFolder) => {
  return new Promise((resolve) => {
    if (pythonServer) { resolve({ success: false, error: 'Already running.' }); return; }

    const script = path.join(__dirname, 'backend', 'server.py');
    pythonServer = spawn('python', [script, String(port), sharedFolder || 'C:\\'], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let done = false;
    const guard = setTimeout(() => {
      if (!done) { done = true; stopPythonServer(); resolve({ success: false, error: 'Startup timeout.' }); }
    }, 8000);

    pythonServer.stdout.on('data', (d) => {
      d.toString().split('\n').forEach(line => {
        line = line.trim();
        if (!line || done) return;
        try {
          const r = JSON.parse(line);
          if (r.status === 'started') {
            done = true; clearTimeout(guard);
            resolve({ success: true, port: r.port, url: `http://${r.ip}:${r.port}`, ip: r.ip });
          } else if (r.error) {
            done = true; clearTimeout(guard);
            stopPythonServer(); resolve({ success: false, error: r.error });
          }
        } catch {}
      });
    });

    // Python logs requests to stderr — redirect quietly
    pythonServer.stderr.on('data', (d) => console.debug('[py]', d.toString().trim().slice(0, 120)));

    pythonServer.on('close', () => {
      pythonServer = null;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('server:died');
    });
  });
});

ipcMain.handle('server:stop', () => { stopPythonServer(); return { success: true }; });

// ── Dialogs ───────────────────────────────────────────────────────────────────
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'lnk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return canceled ? null : filePaths[0];
});

// ── Direct executable launch ──────────────────────────────────────────────────
ipcMain.handle('app:launch', (event, execPath) => {
  try {
    const child = spawn(execPath, [], { detached: true, stdio: 'ignore', shell: true });
    child.unref();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Web app serving ───────────────────────────────────────────────────────────
/**
 * Detect the dev server port from package.json / vite.config.
 * Returns a number. If unknown, returns 3000.
 */
function detectPort(projectPath) {
  try {
    const pkgRaw = fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8');
    const pkg    = JSON.parse(pkgRaw);
    const deps   = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['vite'])          return 5173;
    if (deps['@vitejs/plugin-react']) return 5173;
    if (deps['react-scripts']) return 3000;
    if (deps['next'])          return 3000;
    if (deps['nuxt'])          return 3000;
    if (deps['@angular/core']) return 4200;
    if (deps['svelte'])        return 5173;

    // Check vite.config for custom port
    for (const cfgName of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']) {
      const cfgPath = path.join(projectPath, cfgName);
      if (fs.existsSync(cfgPath)) {
        const content  = fs.readFileSync(cfgPath, 'utf-8');
        const portMatch = content.match(/port\s*:\s*(\d+)/);
        if (portMatch) return parseInt(portMatch[1]);
        return 5173;
      }
    }
  } catch {}
  return 3000;
}

/**
 * Poll a URL until it responds (server is ready).
 */
async function waitForUrl(url, maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.status < 500) return true;
    } catch {}
    await new Promise(res => setTimeout(res, 600));
  }
  return false;
}

ipcMain.handle('app:serve', async (event, { appId, appPath, type, mode }) => {
  if (webServers.has(appId)) {
    const s = webServers.get(appId);
    shell.openExternal(s.url);
    return { success: true, url: s.url, alreadyRunning: true };
  }

  // ── Static SPA server ──────────────────────────────────────────────────────
  if (type === 'static') {
    const port   = Math.floor(Math.random() * 2000) + 7000;
    const script = path.join(__dirname, 'backend', 'static_server.py');
    const proc   = spawn('python', [script, String(port), appPath], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let started = false;
    return new Promise((resolve) => {
      proc.stdout.on('data', (d) => {
        if (started) return;
        try {
          const r = JSON.parse(d.toString().trim());
          if (r.status === 'started' && r.url) {
            started = true;
            webServers.set(appId, { proc, url: r.url });
            shell.openExternal(r.url);
            resolve({ success: true, url: r.url });
          }
        } catch {}
      });
      proc.on('close', () => {
        webServers.delete(appId);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:stopped', appId);
      });
      setTimeout(() => {
        if (!started) { started = true; resolve({ success: false, error: 'Static server timeout.' }); }
      }, 6000);
    });
  }

  // ── npm / npx web app ──────────────────────────────────────────────────────
  if (type === 'webapp') {
    const detectedPort = detectPort(appPath);
    const url          = `http://localhost:${detectedPort}`;

    const npmArgs = {
      dev:           ['run', 'dev'],
      preview:       ['run', 'preview'],
      start:         ['start'],
      build_preview: ['run', 'build'],
    }[mode] || ['run', 'dev'];

    const proc = spawn('npm', npmArgs, { cwd: appPath, shell: true });
    webServers.set(appId, { proc, url });

    proc.on('close', (code) => {
      if (mode === 'build_preview' && code === 0) {
        // Chain: after build completes, start preview
        const previewProc = spawn('npm', ['run', 'preview'], { cwd: appPath, shell: true });
        webServers.set(appId, { proc: previewProc, url });
        previewProc.on('close', () => {
          webServers.delete(appId);
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:stopped', appId);
        });
        // Wait for preview server then open browser
        waitForUrl(url).then(ok => {
          if (ok) shell.openExternal(url);
        });
        return;
      }
      webServers.delete(appId);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:stopped', appId);
    });

    // Poll until dev server is ready (much more reliable than stdout parsing)
    const ready = await waitForUrl(url);
    if (ready) {
      shell.openExternal(url);
      return { success: true, url };
    } else {
      // Server didn't come up — try opening anyway with fallback port
      shell.openExternal(url);
      return { success: true, url, warning: `Server may still be starting on port ${detectedPort}` };
    }
  }

  return { success: false, error: 'Unknown app type: ' + type };
});

ipcMain.handle('app:stop-serve', (event, appId) => {
  if (webServers.has(appId)) {
    try { webServers.get(appId).proc.kill(); } catch {}
    webServers.delete(appId);
  }
  return { success: true };
});

// ── Scanner ───────────────────────────────────────────────────────────────────
ipcMain.handle('app:scan', (event, dir) => {
  return new Promise((resolve) => {
    const script = path.join(__dirname, 'backend', 'scanner.py');
    const proc   = spawn('python', [script, dir]);
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', () => {
      try {
        const r = JSON.parse(out.trim());
        resolve(r.error ? { success: false, error: r.error } : { success: true, apps: r.apps });
      } catch { resolve({ success: false, error: 'Scan failed.' }); }
    });
  });
});

// ── Broadcast ─────────────────────────────────────────────────────────────────
function stopBroadcast() {
  if (broadcasterProc) {
    try { broadcasterProc.kill(); } catch {}
    broadcasterProc = null;
  }
}

ipcMain.handle('broadcast:check', async () => {
  return new Promise((resolve) => {
    const script = path.join(__dirname, 'backend', 'broadcaster.py');
    const proc   = spawn('python', [script, 'check']);
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', () => {
      try { resolve(JSON.parse(out.trim())); }
      catch { resolve({ ffmpeg: false }); }
    });
    setTimeout(() => resolve({ ffmpeg: false }), 4000);
  });
});

ipcMain.handle('broadcast:start', (event, { quality, serverIp, serverPort }) => {
  return new Promise((resolve) => {
    if (broadcasterProc) { resolve({ success: false, error: 'Already broadcasting.' }); return; }

    const script = path.join(__dirname, 'backend', 'broadcaster.py');
    broadcasterProc = spawn('python',
      [script, 'start', quality, broadcastDir],
      { env: { ...process.env, PYTHONUNBUFFERED: '1' } }
    );

    let done = false;
    const guard = setTimeout(() => {
      if (!done) {
        done = true; stopBroadcast();
        resolve({ success: false, error: 'Broadcaster startup timeout.' });
      }
    }, 12000);

    broadcasterProc.stdout.on('data', (d) => {
      d.toString().split('\n').forEach(line => {
        line = line.trim();
        if (!line || done) return;
        try {
          const r = JSON.parse(line);
          if (r.success) {
            done = true; clearTimeout(guard);
            const watchUrl = `http://${serverIp}:${serverPort}/broadcast/stream.m3u8`;
            resolve({ success: true, watchUrl, audio: r.audio, note: r.note });
          } else if (r.error) {
            done = true; clearTimeout(guard);
            stopBroadcast(); resolve({ success: false, error: r.error });
          } else if (r.died) {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('broadcast:died');
          }
        } catch {}
      });
    });

    broadcasterProc.stderr.on('data', d => console.debug('[bc]', d.toString().slice(0, 80)));
    broadcasterProc.on('close', () => {
      broadcasterProc = null;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('broadcast:died');
    });
  });
});

ipcMain.handle('broadcast:stop', () => { stopBroadcast(); return { success: true }; });
