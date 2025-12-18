const { ipcMain } = require('electron');
const path = require('node:path');
const fs = require('fs');
const Store = require('../../modules/electron-store.js');
const SyncWatcher = require('../../modules/sync-watcher.js');
const { addListener: bindWinClose } = require('../../modules/main-win-onclose.js');

let syncWatcher = null;

function parseFileStat(filePath, stat) {
  stat.isDirectory = stat.isDirectory();
  stat.isFile = stat.isFile();
  stat.absPath = filePath;
  return stat;
}

function getFileStat(event, dir, file) {
  const filePath = path.join(dir, file);

  return fs.promises.stat(filePath).then(stat => parseFileStat(filePath, stat));
}

function getFileStatSync(event, dir, file) {
  const filePath = path.join(dir, file);

  try {
    const stat = fs.statSync(filePath);
    return parseFileStat(filePath, stat);
  } catch (e) {
    console.error('getFileStatSync error:', e);
    return null;
  }
}

function startSyncFiles(event, projectPath, progressChannel) {
  if (syncWatcher) {
    return Promise.resolve(true);
  }

  const store = Store.singleton;
  const ftpConfig = store.get('ftp');
  if (!ftpConfig || typeof ftpConfig[projectPath] !== 'object' || !ftpConfig[projectPath].host) {
    throw new Error('未配置FTP连接信息');
  }

  const syncWatcherOptions = {
    ftp: {...ftpConfig[projectPath]}
  };
  const sender = (event && event.sender) || {send: () => {}};

  if (progressChannel) {
    syncWatcherOptions.ftp.onInit = () => {
      sender.send(progressChannel, {
        type: 'connect',
        message: `正在连接到FTP服务器(${ftpConfig[projectPath].host})...`
      });
    };
    syncWatcherOptions.ftp.onConnected = () => {
      sender.send(progressChannel, {
        type: 'connected',
        message: `已成功连接到FTP服务器(${ftpConfig[projectPath].host})`
      });
    };
    syncWatcherOptions.onProgress = (sourcePath, targetPath, action) => {
      sender.send(progressChannel, {
        type: action,
        sourcePath,
        targetPath
      });
    };
    syncWatcherOptions.onError = (err, sourcePath = '', action = '') => {
      sender.send(progressChannel, { type: 'error', message: err.message, sourcePath, action });
    };
  }
  if (typeof syncWatcherOptions.ftp.ignoredPaths === 'string' && syncWatcherOptions.ftp.ignoredPaths.trim() !== '') {
    const ignoredPaths = syncWatcherOptions.ftp.ignoredPaths
      .trim().replaceAll('\\', '/')
      .split(/\s*(?:\r\n|\n|\r)+\s*/)
      .map(pattern => {
        if (pattern.includes('*') || pattern.includes('?')) {
          try {
            const reg = new RegExp(wildcardToRegex(pattern), 'i');
            pattern = reg;
          } catch (e) {}
        }
        return pattern;
      });

    syncWatcherOptions.ignored = function (relPath){
      const normalizedPath = relPath.replaceAll('\\', '/');

      for (const pattern of ignoredPaths) {
        if (pattern instanceof RegExp) {
          if (pattern.test(normalizedPath)) return true;
        } else {
          // 精确匹配或目录匹配
          if (normalizedPath === pattern || normalizedPath.startsWith(pattern + '/')
            || (pattern.endsWith('/') && normalizedPath.startsWith(pattern))
          ) {
            return true;
          }
        }
      }
      return false;
    };
  }

  syncWatcher = new SyncWatcher(projectPath, ftpConfig[projectPath].remotePath || '/', syncWatcherOptions);
  return syncWatcher.start().catch(err => {
    syncWatcher = null;
    throw err;
  });
}

function wildcardToRegex(pattern) {
  return '^' + pattern
    .replace(/[.+?^${}()|\[\]\/\\]/g, '\\$&')
    .replaceAll('**', '@ALL@') // '.*': ** 匹配多级目录
    .replaceAll('*', '[^/]*') // * 不匹配路径分隔符
    .replaceAll('?', '[^/]')
    .replaceAll('@ALL@', '.*') + '$'; // ? 匹配单个字符（不包括路径分隔符）
}

async function stopSyncFiles() {
  if (!syncWatcher) return null;
  await syncWatcher.stop();
  syncWatcher = null;
  return true;
}

module.exports = function setupFileHandlers(win) {
  ipcMain.handle('fs:getFileStat', getFileStat);
  ipcMain.on('fs:getFileStatSync', (event, dir, file) => event.returnValue = getFileStatSync(event, dir, file));
  ipcMain.handle('fs:startSyncFiles', startSyncFiles);
  ipcMain.handle('fs:stopSyncFiles', stopSyncFiles);

  bindWinClose(async () => {
    try {
      await stopSyncFiles();
    } catch (e) {
      console.error('Error stopping SyncWatcher on window close:', e);
    }
  }, win);
};
