const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const Store = require('electron-store');

// const debounce = function(func, wait) {
//   let timeout;
//   return (...args) => {
//     clearTimeout(timeout);
//     timeout = setTimeout(() => func(...args), wait);
//   };
// };

const createWindow = function() {
  const windowBounds = new Store({schema: {
    x: {type: 'number', default: 183, minimum: 0},
    y: {type: 'number', default: 66, minimum: 10},
    width: {type: 'number', default: 1000, minimum: 600},
    height: {type: 'number', default: 600, minimum: 300},
    isMaximized: {type: 'boolean', default: false}
  }});
  const win = new BrowserWindow({
    x: windowBounds.get('x'),
    y: windowBounds.get('y'),
    width: windowBounds.get('width'),
    height: windowBounds.get('height'),
    webPreferences: {
      textAreasAreResizable: false,
      preload: path.join(__dirname, '../preload/main.js'),
      additionalArguments: [
        '--app-version=' + app.getVersion()
      ]
    }
  });

  //监听事件
  win.on('close', (event) => {
    if (!win.isDestroyed()) {
      const bounds = win.getBounds();
      if(win.isMaximized()){
        windowBounds.set('isMaximized', true);
      }else{
        windowBounds.set('isMaximized', false);
        if(!win.isMinimized()){
          windowBounds.set('x', bounds.x);
          windowBounds.set('y', bounds.y);
          windowBounds.set('width', bounds.width);
          windowBounds.set('height', bounds.height);
        }
      }
    }
  });

  if(windowBounds.get('isMaximized')){
    win.maximize();
  }

  win.loadFile('src/renderer/index.html');
  return win;
};

const registerWindowShortcut = function(win) {
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
};

Menu.setApplicationMenu(null);
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  let mainWindow;

  require('./ipc/store-handlers')();
  require('./ipc/dialog-handlers')();
  require('./ipc/action-handlers')();
  require('./ipc/file-handlers')();
  require('./ipc/git-handlers')();
  require('./ipc/archiver-handlers')();

  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });

  registerWindowShortcut(mainWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
