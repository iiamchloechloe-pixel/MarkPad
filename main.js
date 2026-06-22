const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');

let mainWindow = null;
let pendingOpenPath = null;        // file queued before renderer is ready
const RECENT_FILE = () => path.join(app.getPath('userData'), 'recent.json');
const MAX_RECENT = 10;
let recent = [];

/* ---------- Recent files persistence ---------- */
function loadRecent() {
  try { recent = JSON.parse(fssync.readFileSync(RECENT_FILE(), 'utf-8')); }
  catch { recent = []; }
}
function saveRecent() {
  try { fssync.writeFileSync(RECENT_FILE(), JSON.stringify(recent)); } catch {}
}
function addRecent(p) {
  if (!p) return;
  recent = [p, ...recent.filter(x => x !== p)].slice(0, MAX_RECENT);
  saveRecent();
  buildMenu();
}

/* ---------- Window ---------- */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 780, minWidth: 720, minHeight: 460,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.MP_DEBUG) {
    mainWindow.webContents.on('console-message', (_e, level, message, line, src) => {
      console.log(`[renderer] ${message}  (${src}:${line})`);
    });
  }
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) { openPathInRenderer(pendingOpenPath); pendingOpenPath = null; }
  });
  mainWindow.webContents.on('found-in-page', (_e, result) => {
    mainWindow.webContents.send('found-in-page', result);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function openPathInRenderer(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    mainWindow.webContents.send('file-opened', { filePath, content });
    addRecent(filePath);
  } catch (err) {
    dialog.showErrorBox('打开失败', `${filePath}\n\n${err.message}`);
  }
}

/* ---------- OS-initiated open (double-click / CLI) ---------- */
function handleFileArg(argv) {
  const fileArg = argv.find(a => /\.(md|markdown|txt)$/i.test(a));
  if (fileArg) queueOpen(path.resolve(fileArg));
}
function queueOpen(filePath) {
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    openPathInRenderer(filePath);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else { pendingOpenPath = filePath; }
}
app.on('open-file', (event, filePath) => { event.preventDefault(); queueOpen(filePath); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (event, argv) => {
    handleFileArg(argv);
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(() => {
    // Force the running Dock icon (bypasses macOS' sticky icon cache)
    if (process.platform === 'darwin' && app.dock) {
      try { app.dock.setIcon(path.join(__dirname, 'icon.png')); } catch {}
    }
    loadRecent();
    createWindow();
    buildMenu();
    handleFileArg(process.argv);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ---------- Folder tree ---------- */
const MD_RE = /\.(md|markdown|txt)$/i;
const IGNORE = new Set(['node_modules', '.git', '.DS_Store', '.obsidian']);

async function readTree(dir, depth = 0) {
  if (depth > 6) return [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return []; }
  const dirs = [], files = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || IGNORE.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const children = await readTree(full, depth + 1);
      if (children.length) dirs.push({ type: 'dir', name: e.name, path: full, children });
    } else if (MD_RE.test(e.name)) {
      files.push({ type: 'file', name: e.name, path: full });
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

/* ---------- IPC: dialogs & disk I/O ---------- */
ipcMain.handle('dialog:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown / 文本', extensions: ['md', 'markdown', 'txt'] }],
  });
  if (canceled || !filePaths.length) return null;
  const filePath = filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  addRecent(filePath);
  return { filePath, content };
});

ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths.length) return null;
  const root = filePaths[0];
  return { root, name: path.basename(root), tree: await readTree(root) };
});

ipcMain.handle('folder:read', async (_e, root) => {
  return { root, name: path.basename(root), tree: await readTree(root) };
});

ipcMain.handle('file:read', async (_e, filePath) => {
  const content = await fs.readFile(filePath, 'utf-8');
  addRecent(filePath);
  return content;
});

ipcMain.handle('file:save', async (_e, { filePath, content }) => {
  await fs.writeFile(filePath, content, 'utf-8');
  addRecent(filePath);
  return { filePath };
});

ipcMain.handle('dialog:saveAs', async (_e, { content, suggestedName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedName || '未命名.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, content, 'utf-8');
  addRecent(filePath);
  return { filePath };
});

ipcMain.handle('dialog:confirmUnsaved', async (_e, name) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['保存', '不保存', '取消'],
    defaultId: 0, cancelId: 2,
    message: `“${name}” 有未保存的更改`, detail: '是否在继续前保存？',
  });
  return ['save', 'discard', 'cancel'][response];
});

/* Save a pasted/dropped image next to the document, in a .assets folder */
ipcMain.handle('image:save', async (_e, { docPath, dataBase64, ext }) => {
  const buf = Buffer.from(dataBase64, 'base64');
  const stamp = `image-${Date.now()}.${ext || 'png'}`;
  if (docPath) {
    const dir = path.join(path.dirname(docPath),
      path.basename(docPath).replace(/\.[^.]+$/, '') + '.assets');
    await fs.mkdir(dir, { recursive: true });
    const full = path.join(dir, stamp);
    await fs.writeFile(full, buf);
    return { relative: `${path.basename(dir)}/${stamp}` };
  }
  // No saved doc yet → write to a temp folder and return absolute file URL
  const tmp = path.join(app.getPath('temp'), 'markpad-images');
  await fs.mkdir(tmp, { recursive: true });
  const full = path.join(tmp, stamp);
  await fs.writeFile(full, buf);
  return { relative: 'file://' + full };
});

/* Export the rendered document to PDF via an offscreen window */
ipcMain.handle('export:pdf', async (_e, { html, suggestedName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: (suggestedName || 'document') + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;
  const off = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await off.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 250)); // let fonts/math settle
  const pdf = await off.webContents.printToPDF({
    printBackground: true, margins: { marginType: 'default' },
  });
  await fs.writeFile(filePath, pdf);
  off.destroy();
  return { filePath };
});

ipcMain.on('open-external', (_e, url) => { shell.openExternal(url); });
ipcMain.on('recent:add', (_e, p) => addRecent(p));

/* ---------- File tree operations ---------- */
ipcMain.handle('file:create', async (_e, { dir, name }) => {
  let base = name && name.trim() ? name.trim() : '未命名.md';
  if (!/\.[^.]+$/.test(base)) base += '.md';
  let full = path.join(dir, base);
  // avoid clobbering an existing file
  let i = 1;
  while (fssync.existsSync(full)) {
    full = path.join(dir, base.replace(/(\.[^.]+)$/, ` ${i++}$1`));
  }
  await fs.writeFile(full, '', 'utf-8');
  return { filePath: full };
});

ipcMain.handle('file:rename', async (_e, { oldPath, newName }) => {
  const name = newName.trim();
  if (!name) return { error: '名称不能为空' };
  const next = path.join(path.dirname(oldPath), name);
  if (next !== oldPath && fssync.existsSync(next)) return { error: '同名文件已存在' };
  await fs.rename(oldPath, next);
  return { filePath: next };
});

ipcMain.handle('file:trash', async (_e, target) => {
  await shell.trashItem(target);   // moves to Trash (recoverable)
  return { ok: true };
});

ipcMain.on('shell:reveal', (_e, target) => { shell.showItemInFolder(target); });

/* ---------- Find in page ---------- */
ipcMain.on('find:start', (_e, { text, options }) => {
  if (text) mainWindow.webContents.findInPage(text, options);
  else mainWindow.webContents.stopFindInPage('clearSelection');
});
ipcMain.on('find:stop', () => { mainWindow.webContents.stopFindInPage('clearSelection'); });

/* ---------- Native application menu ---------- */
function send(channel) { return () => mainWindow && mainWindow.webContents.send(channel); }

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const recentSubmenu = recent.length
    ? [
        ...recent.map(p => ({
          label: p.length > 60 ? '…' + p.slice(-58) : p,
          click: () => queueOpen(p),
        })),
        { type: 'separator' },
        { label: '清除最近文件', click: () => { recent = []; saveRecent(); buildMenu(); } },
      ]
    : [{ label: '（空）', enabled: false }];

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: send('menu:new') },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: send('menu:open') },
        { label: '打开文件夹…', accelerator: 'CmdOrCtrl+Shift+O', click: send('menu:openFolder') },
        { label: '打开最近文件', submenu: recentSubmenu },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('menu:save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: send('menu:saveAs') },
        { type: 'separator' },
        { label: '导出 PDF…', click: send('menu:exportPdf') },
        { label: '导出 HTML…', click: send('menu:exportHtml') },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
      ],
    },
    { role: 'editMenu', label: '编辑' },
    {
      label: '视图',
      submenu: [
        { label: '切换源码 / 所见即所得', accelerator: 'CmdOrCtrl+/', click: send('menu:mode') },
        { label: '查找 / 替换', accelerator: 'CmdOrCtrl+F', click: send('menu:find') },
        {
          label: '编辑器主题',
          submenu: [
            { label: '默认', click: () => mainWindow.webContents.send('menu:skin', 'default') },
            { label: '护眼', click: () => mainWindow.webContents.send('menu:skin', 'eyecare') },
            { label: '棕褐', click: () => mainWindow.webContents.send('menu:skin', 'sepia') },
            { label: '打字机', click: () => mainWindow.webContents.send('menu:skin', 'typewriter') },
            { label: '夜读', click: () => mainWindow.webContents.send('menu:skin', 'night') },
            { type: 'separator' },
            { label: '切换下一个主题', accelerator: 'CmdOrCtrl+Shift+P', click: send('menu:skin') },
          ],
        },
        { type: 'separator' },
        { label: '切换侧栏', accelerator: 'CmdOrCtrl+\\', click: send('menu:sidebar') },
        { label: '大纲', click: () => mainWindow.webContents.send('menu:sidebarTab', 'outline') },
        { label: '文件树', click: () => mainWindow.webContents.send('menu:sidebarTab', 'files') },
        { type: 'separator' },
        {
          label: '外观',
          submenu: [
            { label: '跟随系统', click: () => mainWindow.webContents.send('menu:appearance', 'system') },
            { label: '浅色', click: () => mainWindow.webContents.send('menu:appearance', 'light') },
            { label: '深色', click: () => mainWindow.webContents.send('menu:appearance', 'dark') },
            { type: 'separator' },
            { label: '循环切换', accelerator: 'CmdOrCtrl+D', click: send('menu:theme') },
          ],
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
      ],
    },
    { role: 'windowMenu', label: '窗口' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
