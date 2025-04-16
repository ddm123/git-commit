const { app, BrowserWindow, ipcMain, dialog } = require('electron');

async function handleDirectoryOpen(event, defaultPath) {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: '请选择项目路径',
    properties: ['openDirectory'],
    modal: true,
    defaultPath: defaultPath || app.getPath('documents')
  });

  return result.canceled ? null : result.filePaths[0];
}

module.exports = function setupDialogHandlers() {
  ipcMain.handle('dialog:openDirectory', handleDirectoryOpen);
};