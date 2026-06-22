const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Dialogs + disk I/O
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  readFolder: (root) => ipcRenderer.invoke('folder:read', root),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
  saveAsDialog: (content, suggestedName) =>
    ipcRenderer.invoke('dialog:saveAs', { content, suggestedName }),
  confirmUnsaved: (name) => ipcRenderer.invoke('dialog:confirmUnsaved', name),
  saveImage: (docPath, dataBase64, ext) =>
    ipcRenderer.invoke('image:save', { docPath, dataBase64, ext }),
  exportPdf: (html, suggestedName) =>
    ipcRenderer.invoke('export:pdf', { html, suggestedName }),

  openExternal: (url) => ipcRenderer.send('open-external', url),
  addRecent: (p) => ipcRenderer.send('recent:add', p),

  // File tree operations
  createFile: (dir, name) => ipcRenderer.invoke('file:create', { dir, name }),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('file:rename', { oldPath, newName }),
  trashFile: (target) => ipcRenderer.invoke('file:trash', target),
  revealInFinder: (target) => ipcRenderer.send('shell:reveal', target),

  // Find in page
  findInPage: (text, options) => ipcRenderer.send('find:start', { text, options }),
  stopFind: () => ipcRenderer.send('find:stop'),
  onFound: (cb) => ipcRenderer.on('found-in-page', (_e, result) => cb(result)),

  // OS-initiated open
  onFileOpened: (cb) => ipcRenderer.on('file-opened', (_e, data) => cb(data)),
  // Native menu commands
  onMenu: (channel, cb) => ipcRenderer.on('menu:' + channel, (_e, arg) => cb(arg)),
});
