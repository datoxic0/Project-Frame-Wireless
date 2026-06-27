// renderer.js — Frame Wireless Desktop
// CommonJS style (no module) to support require() in Electron renderer

const { ipcRenderer } = require('electron');
const fs   = require('fs');
const path = require('path');

// ── Refs ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const btnSelectFolder  = $('btn-select-folder');
const inputFolder      = $('shared-folder-path');
const btnToggle        = $('btn-toggle-server');
const inputPort        = $('server-port');
const statusDot        = document.querySelector('.status-dot');
const statusText       = document.querySelector('.status-text');
const serverInfo       = $('server-info');
const serverUrl        = $('server-url');
const appsGrid         = $('apps-grid');
const dropZone         = $('drop-zone');
const emptyState       = $('empty-state');
const btnAddApp        = $('btn-add-app');
const btnScanApps      = $('btn-scan-apps');
const btnAddAppEmpty   = $('btn-add-app-empty');
const modalAdd         = $('modal-add');
const modalMode        = $('modal-mode');
const btnCancelApp     = $('btn-cancel-app');
const btnSaveApp       = $('btn-save-app');
const btnCancelMode    = $('btn-cancel-mode');
const inputName        = $('app-name-input');
const inputAppPath     = $('app-path-input');
const pathLabel        = $('path-label');
const btnBrowseApp     = $('btn-browse-app');
const typeSelector     = $('type-selector');
const btnBroadcast     = $('btn-broadcast');
const ffmpegWarning    = $('ffmpeg-warning');
const broadcastUrlBox  = $('broadcast-url-box');
const broadcastUrlEl   = $('broadcast-url');
const bcQualitySel     = $('bc-quality-sel');

// ── State ─────────────────────────────────────────────────────────────────────
let isServerRunning   = false;
let isBroadcasting    = false;
let selectedType      = 'executable';
let bcQuality         = 'medium';
let serverIp          = '127.0.0.1';
let serverPort        = 5500;
let pendingLaunchApp  = null;

const APPS_FILE  = path.join(__dirname, 'apps.json');
const runningMap = new Map(); // appId → url
let savedApps    = loadApps();

// ── Persistence ───────────────────────────────────────────────────────────────
function loadApps() {
  try { if (fs.existsSync(APPS_FILE)) return JSON.parse(fs.readFileSync(APPS_FILE, 'utf-8')); }
  catch {}
  return [];
}
function saveApps(list) {
  try { fs.writeFileSync(APPS_FILE, JSON.stringify(list, null, 2), 'utf-8'); }
  catch (e) { console.error('Save apps:', e); }
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── Server controls ───────────────────────────────────────────────────────────
btnSelectFolder.addEventListener('click', async () => {
  const p = await ipcRenderer.invoke('dialog:openDirectory');
  if (p) inputFolder.value = p;
});

btnToggle.addEventListener('click', async () => {
  if (isServerRunning) {
    await ipcRenderer.invoke('server:stop');
    isServerRunning = false;
    applyServerUI();
    return;
  }
  serverPort = parseInt(inputPort.value, 10) || 5500;
  const folder = inputFolder.value;
  if (!folder) { alert('Please select a Shared Folder first.'); return; }

  btnToggle.textContent = 'Starting…'; btnToggle.disabled = true;
  const res = await ipcRenderer.invoke('server:start', serverPort, folder);
  btnToggle.disabled = false;

  if (res.success) {
    isServerRunning = true;
    serverIp        = res.ip;
    serverPort      = res.port;
    serverUrl.textContent = res.url;
    serverUrl.href        = res.url;
  } else {
    alert('Could not start server:\n' + res.error);
  }
  applyServerUI();
});

function applyServerUI() {
  if (isServerRunning) {
    btnToggle.textContent = 'Stop Server';
    btnToggle.classList.replace('btn-primary','btn-secondary');
    btnToggle.classList.remove('pulse-btn');
    statusDot.classList.add('active');
    statusText.textContent = 'Server Online';
    serverInfo.classList.remove('hidden');
    [inputFolder, btnSelectFolder, inputPort].forEach(e => e.disabled = true);
  } else {
    btnToggle.textContent = 'Start Server';
    btnToggle.classList.replace('btn-secondary','btn-primary');
    btnToggle.classList.add('pulse-btn');
    statusDot.classList.remove('active');
    statusText.textContent = 'Server Offline';
    serverInfo.classList.add('hidden');
    [inputFolder, btnSelectFolder, inputPort].forEach(e => e.disabled = false);
  }
}

ipcRenderer.on('server:died', () => {
  isServerRunning = false; applyServerUI();
  alert('⚠️ Network server stopped unexpectedly.');
});

// ── Broadcast ─────────────────────────────────────────────────────────────────
(async () => {
  const r = await ipcRenderer.invoke('broadcast:check');
  if (r.ffmpeg) {
    btnBroadcast.textContent = '📡 Start Broadcast';
    btnBroadcast.disabled    = false;
    ffmpegWarning.classList.add('hidden');
  } else {
    btnBroadcast.textContent = '📡 Start Broadcast';
    btnBroadcast.disabled    = false;
    ffmpegWarning.classList.remove('hidden');
  }
})();

bcQualitySel.querySelectorAll('.type-btn').forEach(b => {
  b.addEventListener('click', () => {
    bcQualitySel.querySelectorAll('.type-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    bcQuality = b.dataset.q;
  });
});

btnBroadcast.addEventListener('click', async () => {
  if (isBroadcasting) {
    await ipcRenderer.invoke('broadcast:stop');
    isBroadcasting = false;
    btnBroadcast.textContent = '📡 Start Broadcast';
    btnBroadcast.classList.replace('btn-secondary','btn-primary');
    broadcastUrlBox.classList.add('hidden');
    return;
  }

  if (!isServerRunning) { alert('Start the Network Server first.'); return; }

  btnBroadcast.textContent = '⏳ Starting…'; btnBroadcast.disabled = true;
  const res = await ipcRenderer.invoke('broadcast:start', { quality: bcQuality, serverIp, serverPort });
  btnBroadcast.disabled = false;

  if (res.success) {
    isBroadcasting = true;
    btnBroadcast.textContent = '⏹ Stop Broadcast';
    btnBroadcast.classList.replace('btn-primary','btn-secondary');
    broadcastUrlEl.textContent = res.watchUrl;
    broadcastUrlEl.href        = res.watchUrl;
    broadcastUrlBox.classList.remove('hidden');
    if (res.note) alert('Note: ' + res.note);
  } else {
    alert('Broadcast failed:\n' + res.error);
    btnBroadcast.textContent = '📡 Start Broadcast';
  }
});

ipcRenderer.on('broadcast:died', () => {
  isBroadcasting = false;
  btnBroadcast.textContent = '📡 Start Broadcast';
  btnBroadcast.classList.replace('btn-secondary','btn-primary');
  broadcastUrlBox.classList.add('hidden');
  alert('⚠️ Broadcast stopped unexpectedly.');
});

// ── Drag & Drop ───────────────────────────────────────────────────────────────
const appsPanel = appsGrid.parentElement;
appsPanel.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.remove('hidden'); });
appsPanel.addEventListener('dragleave', e => { if (!appsPanel.contains(e.relatedTarget)) dropZone.classList.add('hidden'); });
appsPanel.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.add('hidden');
  let added = 0;
  Array.from(e.dataTransfer.files).forEach(f => {
    const ext = path.extname(f.name).toLowerCase();
    if (['.exe','.bat','.lnk','.cmd'].includes(ext) && !savedApps.find(a => a.path === f.path)) {
      savedApps.push({ id: uid(), name: path.basename(f.name, ext), path: f.path, type: 'executable' });
      added++;
    }
  });
  if (added) { saveApps(savedApps); renderApps(); }
  else alert('Drop .exe, .bat, .lnk or .cmd files only.');
});

// ── Modal: Add App ────────────────────────────────────────────────────────────
const openModal  = () => { inputName.value = ''; inputAppPath.value = ''; selectType('executable'); modalAdd.classList.remove('hidden'); };
const closeModal = () => modalAdd.classList.add('hidden');

btnAddApp.addEventListener('click', openModal);
btnAddAppEmpty.addEventListener('click', openModal);
btnCancelApp.addEventListener('click', closeModal);

typeSelector.querySelectorAll('.type-btn').forEach(b => b.addEventListener('click', () => selectType(b.dataset.type)));

function selectType(t) {
  selectedType = t;
  typeSelector.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === t));
  if (t === 'executable') { pathLabel.textContent = 'Path to File'; inputAppPath.placeholder = 'Select executable…'; }
  else                    { pathLabel.textContent = 'Path to Folder'; inputAppPath.placeholder = 'Select project folder…'; }
}

btnBrowseApp.addEventListener('click', async () => {
  const r = selectedType === 'executable'
    ? await ipcRenderer.invoke('dialog:openFile')
    : await ipcRenderer.invoke('dialog:openDirectory');
  if (r) inputAppPath.value = r;
});

btnSaveApp.addEventListener('click', () => {
  const name = inputName.value.trim(), p = inputAppPath.value.trim();
  if (!name || !p) { alert('Fill in both fields.'); return; }
  savedApps.push({ id: uid(), name, path: p, type: selectedType });
  saveApps(savedApps); renderApps(); closeModal();
});

// ── Modal: Launch Mode ────────────────────────────────────────────────────────
btnCancelMode.addEventListener('click', () => { pendingLaunchApp = null; modalMode.classList.add('hidden'); });

document.querySelectorAll('.mode-btn').forEach(b => {
  b.addEventListener('click', async () => {
    if (!pendingLaunchApp) return;
    const mode = b.dataset.mode;
    modalMode.classList.add('hidden');
    await serveWebApp(pendingLaunchApp, mode);
    pendingLaunchApp = null;
  });
});

// ── Scan ──────────────────────────────────────────────────────────────────────
btnScanApps.addEventListener('click', async () => {
  const dir = await ipcRenderer.invoke('dialog:openDirectory');
  if (!dir) return;
  const orig = btnScanApps.innerHTML;
  btnScanApps.textContent = '⏳…'; btnScanApps.disabled = true;
  const res = await ipcRenderer.invoke('app:scan', dir);
  if (res.success) {
    const news = res.apps.filter(a => !savedApps.find(x => x.path === a.path));
    news.forEach(a => savedApps.push({ id: uid(), name: a.name, path: a.path, type: 'executable' }));
    saveApps(savedApps); renderApps();
    alert(news.length ? `Added ${news.length} app(s)!` : 'No new executables found.');
  } else {
    alert('Scan failed: ' + res.error);
  }
  btnScanApps.innerHTML = orig; btnScanApps.disabled = false;
});

// ── Web App Server ────────────────────────────────────────────────────────────
async function serveWebApp(app, mode) {
  const card = appsGrid.querySelector(`[data-id="${app.id}"]`);
  const btn  = card?.querySelector('.btn-launch');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  const res = await ipcRenderer.invoke('app:serve', { appId: app.id, appPath: app.path, type: app.type, mode });

  if (res.success) {
    runningMap.set(app.id, res.url);
    renderApps();
    if (res.warning) console.warn(res.warning);
  } else {
    alert('Failed: ' + res.error);
    if (btn) { btn.textContent = 'Serve'; btn.disabled = false; }
  }
}

ipcRenderer.on('app:stopped', (e, appId) => { runningMap.delete(appId); renderApps(); });

// ── Render Apps ───────────────────────────────────────────────────────────────
function renderApps() {
  appsGrid.querySelectorAll('.app-card').forEach(c => c.remove());
  emptyState.style.display = savedApps.length ? 'none' : '';

  savedApps.forEach(app => {
    const isRunning = runningMap.has(app.id);
    const isWeb     = app.type === 'static' || app.type === 'webapp';
    const icon      = { executable:'🎮', static:'📁', webapp:'⚡' }[app.type] || '⚡';

    const card = document.createElement('div');
    card.className   = 'app-card';
    card.dataset.id  = app.id;
    card.innerHTML = `
      <div class="app-info">
        <div class="app-icon">${icon}</div>
        <div class="app-details">
          <h4>${app.name}</h4>
          <p title="${app.path}">${app.path}</p>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        ${isRunning
          ? `<span class="badge-running">● Running</span>
             <button class="btn btn-secondary btn-sm btn-stop">Stop</button>`
          : `<button class="btn btn-primary btn-sm btn-launch">${isWeb ? 'Serve' : 'Launch'}</button>`
        }
        <button class="btn btn-icon btn-del" title="Remove">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
          </svg>
        </button>
      </div>`;

    card.querySelector('.btn-launch')?.addEventListener('click', async () => {
      if (app.type === 'executable') {
        const res = await ipcRenderer.invoke('app:launch', app.path);
        if (!res.success) alert('Launch failed: ' + res.error);
      } else if (app.type === 'static') {
        await serveWebApp(app, 'static');
      } else {
        pendingLaunchApp = app;
        $('mode-title').textContent = `Serve: ${app.name}`;
        modalMode.classList.remove('hidden');
      }
    });

    card.querySelector('.btn-stop')?.addEventListener('click', async () => {
      await ipcRenderer.invoke('app:stop-serve', app.id);
      runningMap.delete(app.id); renderApps();
    });

    card.querySelector('.btn-del').addEventListener('click', () => {
      savedApps = savedApps.filter(a => a.id !== app.id);
      saveApps(savedApps); renderApps();
    });

    appsGrid.appendChild(card);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
renderApps();
