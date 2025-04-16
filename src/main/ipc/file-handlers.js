const { ipcMain } = require('electron');
const path = require('node:path');
const fs = require('fs');

function getFileStat(event, dir, file){
  let filePath = path.join(dir, file);
  let stat = fs.statSync(filePath);
  stat.isDirectory = stat.isDirectory();
  stat.isFile = stat.isFile();
  stat.absPath = filePath;
  return stat;
}

module.exports = function setupFileHandlers() {
  ipcMain.handle('fs:getFileStat', getFileStat);
};
