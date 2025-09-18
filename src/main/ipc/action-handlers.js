const { BrowserWindow, Menu, ipcMain, clipboard } = require('electron');

async function showCopyContextMenu(event, menus) {
  // 创建菜单
  const menuTemplate = [];

  for (const menu of menus) {
    const isEnabled = typeof menu.enabled === 'boolean' ? menu.enabled : true;
    if (menu === '-') {
      menuTemplate.push({ type: 'separator' });
    } else if (menu.handler) {
      let args = menu.args ?? [];
      if (typeof args === 'string') {
        args = [args];
      }

      menuTemplate.push({
        label: menu.label,
        enabled: isEnabled,
        click: () => event.sender.send(menu.handler, ...args)
      });
    } else {
      menuTemplate.push({
        label: menu.label,
        enabled: isEnabled,
        click: () => clipboard.writeText(menu.text)
      });
    }
  }

  // 显示菜单（自动定位到鼠标位置）
  Menu.buildFromTemplate(menuTemplate)
    .popup({ window: BrowserWindow.fromWebContents(event.sender) });
  return true;
}

module.exports = function setupActionHandlers() {
  ipcMain.handle('show-copy-context-menu', showCopyContextMenu);
  ipcMain.handle('clipboard:write-text', (event, text) => clipboard.writeText(text));
  ipcMain.handle('clipboard:read-text', (event) => clipboard.readText());
};
