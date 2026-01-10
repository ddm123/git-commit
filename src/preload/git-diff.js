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
  diffChars: (oldStr, newStr) => ipcRenderer.sendSync('diff-chars', oldStr, newStr),
  getHeadFileBase64: (path, file) => ipcRenderer.invoke('git:getHeadFileBase64', path, file),
  closeWindow: () => ipcRenderer.send('close-diff-window'),
  toggleDevTools: () => ipcRenderer.send('toggle-dev-tools')
});
