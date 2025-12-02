const { contextBridge, ipcRenderer } = require('electron/renderer');

const argumentsMap = new Map();
for (const argv of process.argv) {
  const arr = argv.replace(/^--/, '').split('=');
  argumentsMap.set(arr[0], arr[1] ?? true);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getArgument: (key) => key === undefined ? argumentsMap : argumentsMap.get(key),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  receive: (channel, func) => ipcRenderer.on(channel, func),
  openDirectory: (def = null) => ipcRenderer.invoke('dialog:openDirectory', def),
  closeWindow: () => ipcRenderer.send('close-manage-projects-window')
});
