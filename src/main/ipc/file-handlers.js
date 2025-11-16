const { ipcMain } = require('electron');
const path = require('node:path');
const fs = require('fs');
const Store = require('../../modules/electron-store.js');
const SyncWatcher = require('../../modules/sync-watcher.js');

let syncWatcher = null;

function getFileStat(event, dir, file) {
  const filePath = path.join(dir, file);

  return fs.promises.stat(filePath).then(stat => {
    stat.isDirectory = stat.isDirectory();
    stat.isFile = stat.isFile();
    stat.absPath = filePath;
    return stat;
  });
}

function startSyncFiles(event, projectPath, progressChannel) {
  const store = Store.singleton;
  const ftpConfig = store.get('ftp');
  if (!ftpConfig || typeof ftpConfig[projectPath] !== 'object' || !ftpConfig[projectPath].host) {
    throw new Error('未配置FTP连接信息');
  }

  const syncWatcherOptions = {
    ftp: {...ftpConfig[projectPath]}
  };
  if (progressChannel) {
    syncWatcherOptions.ftp.onInit = () => {
      event.sender.send(progressChannel, {
        type: 'connect',
        message: `正在连接到FTP服务器(${ftpConfig[projectPath].host})...`
      });
    };
    syncWatcherOptions.ftp.onConnected = () => {
      event.sender.send(progressChannel, {
        type: 'connected',
        message: `已成功连接到FTP服务器(${ftpConfig[projectPath].host})`
      });
    };
    syncWatcherOptions.onProgress = (sourcePath, targetPath, action) => {
      event.sender.send(progressChannel, {
        type: action,
        sourcePath,
        targetPath
      });
    };
    syncWatcherOptions.onError = (err, sourcePath = '', action = '') => {
      event.sender.send(progressChannel, { type: 'error', message: err.message, sourcePath, action });
    };
  }
  if (typeof syncWatcherOptions.ftp.ignoredPaths === 'string') {
    syncWatcherOptions.ignored = syncWatcherOptions.ftp.ignoredPaths.split(/(?:\r\n|\n|\r)/);
  } else if (Array.isArray(syncWatcherOptions.ftp.ignoredPaths)) {
    syncWatcherOptions.ignored = syncWatcherOptions.ftp.ignoredPaths;
  }

  syncWatcher = new SyncWatcher(projectPath, ftpConfig[projectPath].remotePath || '/', syncWatcherOptions);
  return syncWatcher.start();
}

async function stopSyncFiles() {
  if (!syncWatcher) return null;
  await syncWatcher.stop();
  syncWatcher = null;
  return true;
}

module.exports = function setupFileHandlers(win) {
  ipcMain.handle('fs:getFileStat', getFileStat);
  ipcMain.handle('fs:startSyncFiles', startSyncFiles);
  ipcMain.handle('fs:stopSyncFiles', stopSyncFiles);

  win.on('close', async (event) => {
    // stop the sync watcher before closing the window
    event.preventDefault();

    try {
      await stopSyncFiles();
    } catch (e) {
      console.error('Error stopping SyncWatcher on window close:', e);
    }

    // now close the window (if not already closed)
    if (!win.isDestroyed()) {
      win.destroy();
    }
  });
};
