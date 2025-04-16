const { BrowserWindow, Menu, ipcMain, clipboard } = require('electron');

async function showPathContextMenu(event, relativePath, absolutePath) {
  return new Promise((resolve) => {
    // 创建菜单
    const menu = Menu.buildFromTemplate([
      {label: '复制相对路径', click: () => {
        clipboard.writeText(relativePath);
        resolve(relativePath);
      }},
      {label: '复制绝对路径', click: () => {
        clipboard.writeText(absolutePath);
        resolve(absolutePath);
      }}
    ]);

    // 显示菜单（自动定位到鼠标位置）
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
  });
}

module.exports = function setupActionHandlers() {
  ipcMain.handle('show-path-context-menu', showPathContextMenu);
  ipcMain.handle('clipboard:write-text', (event, text) => clipboard.writeText(text));
  ipcMain.handle('clipboard:read-text', (event) => clipboard.readText());
};
