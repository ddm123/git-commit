const { contextBridge, ipcRenderer } = require('electron/renderer');

const argumentsMap = new Map();
for (const argv of process.argv) {
  const arr = argv.replace(/^--/, '').split('=');
  argumentsMap.set(arr[0], arr[1] ?? true);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getArgument: (key) => key === undefined ? argumentsMap : argumentsMap.get(key),
  isDevelopment: () => argumentsMap.get('is-packaged') === 'false',
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, func) => ipcRenderer.on(channel, func),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  closeWindow: () => ipcRenderer.send('close-window'),
  toggleDevTools: () => ipcRenderer.send('toggle-dev-tools'),
  showContextMenu: (menus) => ipcRenderer.invoke('show-copy-context-menu', menus),
  onMenuClick: (handlerName, closure) => ipcRenderer.on(handlerName, closure),
  logs: (path, options) => ipcRenderer.invoke('git:logs.graph', path, options),
  gitShow: (path, options) => ipcRenderer.invoke('git:show', path, options),
  showDiff: (path, file, diffChunks) => ipcRenderer.invoke('git:showDiff', path, file, diffChunks)
});
