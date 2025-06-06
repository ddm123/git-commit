const { ipcMain } = require('electron');
const Store = require('electron-store');

const store = new Store();

module.exports = function setupDialogHandlers() {
  ipcMain.handle('store:get', (event, key) => {
    return store.get(key);
  });
  ipcMain.handle('store:set', (event, key, value) => {
    store.set(key, value);
  });
};