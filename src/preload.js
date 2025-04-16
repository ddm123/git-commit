const { contextBridge, ipcRenderer } = require('electron/renderer');
//const { ipcMain } = require('electron/main');

contextBridge.exposeInMainWorld('electronAPI', {
  icpSend: (...args) => ipcRenderer.invoke(...args),
  openDirectory: (def) => ipcRenderer.invoke('dialog:openDirectory', def),
  getFileStat: (path, file) => ipcRenderer.invoke('fs:getFileStat', path, file),
  showPathContextMenu: (relative, absolute) => ipcRenderer.invoke('show-path-context-menu', relative, absolute),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read-text')
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
  onProgress: (eventName, closure) => ipcRenderer.on(eventName, closure)
});
