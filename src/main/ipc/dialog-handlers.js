const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const { addListener: bindWinClose } = require('../../modules/main-win-onclose.js');

async function handleDirectoryOpen(event, defaultPath) {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
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

  const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
    title: '保存文件',
    properties: ['createDirectory'],
    ...options
  });

  return result.canceled ? null : result.filePath;
}

function handleShowProjectsDialog(event, ...paths) {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    center: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: BrowserWindow.fromWebContents(event.sender),
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/manage-projects.js')
    }
  });

  bindWinClose(() => {
    if (!win.isDestroyed()) {
      win.webContents.send('parentWin.closed', null);
      win.close();
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  })

  win.loadFile('src/renderer/manage-projects.html');
  win.setTitle('管理项目路径');
  win.webContents.on('did-finish-load', () => {
    //win.webContents.openDevTools();
    win.webContents.send('project.paths', paths);
  });
}

function handleSendProjectPaths(event, ...paths) {
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender)?.getParentWindow();

    if (parentWin && !parentWin.isDestroyed()) {
      parentWin.webContents.send('manage-projects.closed', ...paths);
    }
  } catch (e) {
    console.error('Failed to forward manage-projects.closed:', e);
  }
}

module.exports = function setupDialogHandlers() {
  ipcMain.handle('dialog:openDirectory', handleDirectoryOpen);
  ipcMain.handle('dialog:showSaveDialog', handleShowSaveDialog);
  ipcMain.handle('dialog:showProjectsDialog', handleShowProjectsDialog);
  ipcMain.handle('shell:showItemInFolder', (event, fullPath) => shell.showItemInFolder(fullPath));
  ipcMain.handle('shell:openExternal', (event, url) => shell.openExternal(url));
  ipcMain.on('manage-projects.closed', handleSendProjectPaths);
};