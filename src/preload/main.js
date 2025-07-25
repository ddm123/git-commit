const { contextBridge, ipcRenderer } = require('electron/renderer');
//const { ipcMain } = require('electron/main');

contextBridge.exposeInMainWorld('electronAPI', {
  appVersion: '1.2.2',
  icpSend: (...args) => ipcRenderer.invoke(...args),
  openDirectory: (def) => ipcRenderer.invoke('dialog:openDirectory', def),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  getFileStat: (path, file) => ipcRenderer.invoke('fs:getFileStat', path, file),
  getStoreValue: (key) => ipcRenderer.invoke('store:get', key),
  setStoreValue: (key, value) => ipcRenderer.invoke('store:set', key, value),
  showPathContextMenu: (menus) => ipcRenderer.invoke('show-copy-context-menu', menus),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read-text'),
  onMenuClick: (handlerName, closure) => ipcRenderer.on(handlerName, closure),
  onPaste: (closure) => ipcRenderer.on('clipboard:readText', closure),
  createArchiver: (zipFile, filesPath, files, options) => ipcRenderer.invoke('archiver:create', zipFile, filesPath, files, options)
});
contextBridge.exposeInMainWorld('gitAPI', {
  getRootPath: (path) => ipcRenderer.invoke('git:getRootPath', path),
  getBranches: (path) => ipcRenderer.invoke('git:getBranches', path),
  getStatus: (path) => ipcRenderer.invoke('git:getStatus', path),
  switchBranch: (path, branch) => ipcRenderer.invoke('git:switchBranch', path, branch),
  pull: (path) => ipcRenderer.invoke('git:pull', path),
  add: (path, files) => ipcRenderer.invoke('git:add', path, files),
  commit: (path, message) => ipcRenderer.invoke('git:commit', path, message),
  push: (path) => ipcRenderer.invoke('git:push', path),
  reset: (path, parameters) => ipcRenderer.invoke('git:reset', path, parameters),
  checkout: (path, ...files) => ipcRenderer.invoke('git:checkout', path, ...files),
  diff: (path, options) => ipcRenderer.invoke('git:diff', path, options),
  showDiff: (file, diffChunks) => ipcRenderer.invoke('git:showDiff', file, diffChunks),
  onProgress: (eventName, closure) => ipcRenderer.on(eventName, closure),
  showPasteContextMenu: (path) => ipcRenderer.invoke('git:showPasteContextMenu', path)
});
