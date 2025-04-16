const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

const createWindow = function() {
  const win = new BrowserWindow({
    width: 1000,
    height: 600,
    webPreferences: {
      textAreasAreResizable: false,
      preload: path.join(__dirname, '../preload.js')
    }
  });

  win.loadFile('src/renderer/index.html');
  //win.webContents.openDevTools();

  return win;
};

Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  let mainWindow;

  require('./ipc/dialog-handlers')();
  require('./ipc/action-handlers')();
  require('./ipc/file-handlers')();
  require('./ipc/git-handlers')();

  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
