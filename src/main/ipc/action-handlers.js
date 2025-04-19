const { BrowserWindow, Menu, ipcMain, clipboard } = require('electron');

async function showCopyContextMenu(event, menus) {
  return new Promise((resolve) => {
    // 创建菜单
    const menuTemplate = [];

    for(const menu of menus){
      if(menu==='-'){
        menuTemplate.push({ type: 'separator' });
      }else{
        menuTemplate.push({label: menu.label, click: () => {
          clipboard.writeText(menu.text);
          resolve(menu.text);
        }});
      }
    }

    // 显示菜单（自动定位到鼠标位置）
    Menu.buildFromTemplate(menuTemplate).popup({ window: BrowserWindow.fromWebContents(event.sender) });
  });
}

module.exports = function setupActionHandlers() {
  ipcMain.handle('show-copy-context-menu', showCopyContextMenu);
  ipcMain.handle('clipboard:write-text', (event, text) => clipboard.writeText(text));
  ipcMain.handle('clipboard:read-text', (event) => clipboard.readText());
};
