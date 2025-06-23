const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

function createArchiver(zipFile, filesPath, files, options){
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFile, {flags: 'w'});
    const archive = archiver('zip', options);

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    files.forEach(file => archive.file(filesPath+path.sep+file, {name: file.replaceAll('\\', '/')}));

    archive.pipe(output);
    archive.finalize();
  });
}

module.exports = function setupArchiverHandlers() {
  ipcMain.handle('archiver:create', (event, zipFile, filesPath, files, options) => createArchiver(zipFile, filesPath, files, options));
};
