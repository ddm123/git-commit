const { ipcMain } = require('electron');
const path = require('node:path');
const Client = require('../../modules/ftp-client.js');
const Store = require('../../modules/electron-store.js');

async function uploadFiles(event, projectPath, files, progressChannel) {
  if (!files || files.length === 0) return 0;

  const store = Store.singleton;
  const ftpConfig = store.get('ftp');
  if (!ftpConfig || typeof ftpConfig[projectPath] !== 'object' || !ftpConfig[projectPath].host) {
    throw new Error('未配置FTP连接信息');
  }
  if (typeof files === 'string') {
    files = [files];
  }

  let fileIndex = 0;
  const fileCount = files.length;
  const client = new Client(
    ftpConfig[projectPath].host,
    ftpConfig[projectPath].username ?? '',
    ftpConfig[projectPath].password ?? '',
    ftpConfig[projectPath].port,
    ftpConfig[projectPath].protocol
  );

  if (progressChannel) {
    event.sender.send(progressChannel, {
      type: 'connect',
      message: `正在连接到FTP服务器(${ftpConfig[projectPath].host})...`
    });
  }
  await client.connect();

  if (progressChannel) {
    client.trackProgress(info => {
      info.file = files[fileIndex];
      info.fileIndex = fileIndex;
      info.fileCount = fileCount;
      info.progress = info.bytesOverall > 0 ? Math.floor(info.bytes / info.bytesOverall * 10000) / 100 : 0;
      event.sender.send(progressChannel, info);
    });
  }

  let succeedCount = 0;
  const remoteDir = ftpConfig[projectPath].remotePath ? ftpConfig[projectPath].remotePath.replaceAll('\\', '/').replace(/[\\/]+$/, '')+'/' : '/';
  for (; fileIndex < fileCount; fileIndex++) {
    const file = files[fileIndex].replace(/^[\\/]+/, '');
    try {
      await client.uploadFile(path.join(projectPath, file), remoteDir + file);
      succeedCount++;
    } catch (err) {
      if (progressChannel) {
        event.sender.send(progressChannel, {type: 'error', fileIndex, fileCount, file, name: file, message: err.message});
      } else {
        console.error(err);
      }
    }
  }
  client.close();

  return succeedCount;
}

module.exports = function setupFtpHandlers() {
  ipcMain.handle('ftp:upload', uploadFiles);
};