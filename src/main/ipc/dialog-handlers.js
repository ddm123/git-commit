const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

async function handleDirectoryOpen(event, defaultPath) {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: '请选择项目路径',
    properties: ['openDirectory'],
    modal: true,
    defaultPath: defaultPath || app.getPath('documents')
  });

  return result.canceled ? null : result.filePaths[0];
}

async function handleShowSaveDialog(event, options) {
  if(!options.defaultPath){
    options.defaultPath = app.getPath('documents');
  }

  const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
    title: '保存文件',
    properties: ['createDirectory'],
    ...options
  });

  return result.canceled ? null : result.filePath;
}

module.exports = function setupDialogHandlers() {
  ipcMain.handle('dialog:openDirectory', handleDirectoryOpen);
  ipcMain.handle('dialog:showSaveDialog', handleShowSaveDialog);
  ipcMain.handle('shell:showItemInFolder', (event, fullPath) => shell.showItemInFolder(fullPath));
};