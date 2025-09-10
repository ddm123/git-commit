const { contextBridge, ipcRenderer } = require('electron/renderer');

function getArgument(key)
{
  if(key===undefined) {
    const args = new Map();
    for(const argv of process.argv){
      const arr = argv.replace(/^--/, '').split('=');
      args.set(arr[0], arr[1] ?? true);
    }
    return args;
  }
  for(const argv of process.argv){
    if(argv.startsWith(`--${key}=`)){
      return argv.split('=')[1] ?? true;
    }
  }
  return undefined;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getArgument: (key) => getArgument(key) ?? '',
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
  diffFile: (path, file) => ipcRenderer.invoke('git:diffFile', path, file),
  showDiff: (file, diffChunks) => ipcRenderer.invoke('git:showDiff', file, diffChunks),
  onProgress: (eventName, closure) => ipcRenderer.on(eventName, closure),
  showPasteContextMenu: (path) => ipcRenderer.invoke('git:showPasteContextMenu', path)
});
