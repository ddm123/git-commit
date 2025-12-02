const { contextBridge, ipcRenderer } = require('electron/renderer');

const argumentsMap = new Map();
for (const argv of process.argv) {
  const arr = argv.replace(/^--/, '').split('=');
  argumentsMap.set(arr[0], arr[1] ?? true);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getArgument: (key) => key === undefined ? argumentsMap : argumentsMap.get(key),
  ipcInvoke: (...args) => ipcRenderer.invoke(...args),
  receive: (channel, func) => ipcRenderer.on(channel, func),
  openDirectory: (def) => ipcRenderer.invoke('dialog:openDirectory', def),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showProjectsDialog: (...paths) => ipcRenderer.invoke('dialog:showProjectsDialog', ...paths),
  getFileStat: (path, file) => ipcRenderer.invoke('fs:getFileStat', path, file),
  getFileStatSync: (path, file) => ipcRenderer.sendSync('fs:getFileStatSync', path, file),
  showPathContextMenu: (menus) => ipcRenderer.invoke('show-copy-context-menu', menus),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read-text'),
  onMenuClick: (handlerName, closure) => ipcRenderer.on(handlerName, closure),
  onPaste: (closure) => ipcRenderer.on('clipboard:readText', closure),
  createArchiver: (zipFile, filesPath, files, options) => ipcRenderer.invoke('archiver:create', zipFile, filesPath, files, options),
  ftpUploadFile: (projectPath, files, progressChannel) => ipcRenderer.invoke('ftp:upload', projectPath, files, progressChannel),
  startSyncFiles: (projectPath, progressChannel) => ipcRenderer.invoke('fs:startSyncFiles', projectPath, progressChannel),
  stopSyncFiles: () => ipcRenderer.invoke('fs:stopSyncFiles')
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
  diffFile: (path, file) => ipcRenderer.invoke('git:diffFile', path, file),
  showDiff: (path, file, diffChunks) => ipcRenderer.invoke('git:showDiff', path, file, diffChunks),
  onProgress: (eventName, closure) => ipcRenderer.on(eventName, closure),
  showPasteContextMenu: (path) => ipcRenderer.invoke('git:showPasteContextMenu', path)
});
contextBridge.exposeInMainWorld('electronStore', {
  get: (key, defaultValue = undefined) => ipcRenderer.sendSync('store:get', key, defaultValue),
  set: (key, value) => ipcRenderer.invoke('store:set', key, value),
  getIntValue: (key, defaultValue = undefined) => ipcRenderer.sendSync('store:getIntValue', key, defaultValue),
  setIntValue: (key, value) => ipcRenderer.invoke('store:setIntValue', key, value),
  getFloatValue: (key, defaultValue = undefined) => ipcRenderer.sendSync('store:getFloatValue', key, defaultValue),
  setFloatValue: (key, value) => ipcRenderer.invoke('store:setFloatValue', key, value),
  setJSON: (key, value) => ipcRenderer.invoke('store:setJSON', key, value),
  delete: (key) => ipcRenderer.invoke('store:delete', key)
});