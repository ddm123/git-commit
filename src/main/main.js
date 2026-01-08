const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const Store = require('../modules/electron-store.js');
const { addListener: bindWinClose } = require('../modules/main-win-onclose.js');

// const debounce = function(func, wait) {
//   let timeout;
//   return (...args) => {
//     clearTimeout(timeout);
//     timeout = setTimeout(() => func(...args), wait);
//   };
// };

const createWindow = function() {
  const windowBounds = Store.singleton;
  const win = new BrowserWindow({
    x: windowBounds.getIntValue('mainWin.x') || 183,
    y: windowBounds.getIntValue('mainWin.y') || 66,
    width: windowBounds.getIntValue('mainWin.width') || 1000,
    height: windowBounds.getIntValue('mainWin.height') || 600,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      textAreasAreResizable: false,
      preload: path.join(__dirname, '../preload/main.js'),
      additionalArguments: [
        '--app-version=' + app.getVersion(),
        '--is-packaged=' + (app.isPackaged ? 'true' : 'false')
      ]
    }
  });

  //监听事件
  bindWinClose(() => {
    if (!win.isDestroyed()) {
      const bounds = win.getBounds();
      if(win.isMaximized()){
        windowBounds.set('mainWin.isMaximized', true);
      }else{
        windowBounds.set('mainWin.isMaximized', false);
        if(!win.isMinimized()){
          windowBounds.set('mainWin.x', bounds.x);
          windowBounds.set('mainWin.y', bounds.y);
          windowBounds.set('mainWin.width', bounds.width);
          windowBounds.set('mainWin.height', bounds.height);
        }
      }
    }
  }, win);

  if(windowBounds.get('mainWin.isMaximized', false)){
    win.maximize();
  }

  win.loadFile('src/renderer/index.html');
  return win;
};

const registerWindowShortcut = function(win) {
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type==='keyUp' && input.key === 'F12') {
        if(win.webContents.isDevToolsOpened()){
          win.webContents.closeDevTools();
        }else{
          win.webContents.openDevTools({mode: 'undocked', title: 'Developer Tools', activate: true});
        }
        event.preventDefault();
      }
    });
  }
};

let mainWindow = null;
if (app.requestSingleInstanceLock({})) {
  Menu.setApplicationMenu(null);
  //console.log(app.isHardwareAccelerationEnabled());
  //app.disableHardwareAcceleration();

  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  app.whenReady().then(() => {
    mainWindow = createWindow();

    require('./ipc/store-handlers')();
    require('./ipc/dialog-handlers')();
    require('./ipc/action-handlers')();
    require('./ipc/file-handlers')(mainWindow);
    require('./ipc/git-handlers')();
    require('./ipc/archiver-handlers')();
    require('./ipc/ftp-handlers')();

    /**
     * @link https://www.electronjs.org/zh/docs/latest/tutorial/tutorial-first-app#如果没有窗口打开则打开一个窗口-macos
     */
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });

    registerWindowShortcut(mainWindow);
  });
} else {
  app.quit();
}