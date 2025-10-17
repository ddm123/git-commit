const { ipcMain } = require('electron');
const Store = require('../../modules/electron-store.js');

const store = Store.singleton;

module.exports = function setupDialogHandlers() {
  ipcMain.on('store:get', (event, key, defaultValue = undefined) => event.returnValue = store.get(key, defaultValue));
  ipcMain.on('store:getIntValue', (event, key, defaultValue = undefined) => event.returnValue = store.getIntValue(key, defaultValue));
  ipcMain.on('store:getFloatValue', (event, key, defaultValue = undefined) => event.returnValue = store.getFloatValue(key, defaultValue));

  ipcMain.handle('store:set', (event, key, value) => {
    store.set(key, value);
  });
  ipcMain.handle('store:setIntValue', (event, key, value) => {
    store.setIntValue(key, value);
  });
  ipcMain.handle('store:setFloatValue', (event, key, value) => {
    store.setFloatValue(key, value);
  });
  ipcMain.handle('store:setJSON', (event, key, value) => {
    store.setJSON(key, value);
  });
};