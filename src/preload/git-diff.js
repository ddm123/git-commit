const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, func) => ipcRenderer.on(channel, func),
  diffChars: (oldStr, newStr) => ipcRenderer.sendSync('diff-chars', oldStr, newStr),
  closeWindow: () => ipcRenderer.send('close-diff-window')
});
