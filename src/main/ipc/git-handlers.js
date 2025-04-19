const { BrowserWindow, Menu, ipcMain, clipboard } = require('electron');
const git = require('simple-git');

async function handleGitStatus(event, projectPath) {
  const gitRepo = git(projectPath);
  const gitStatus = await gitRepo.status(['--porcelain', projectPath]);

  gitStatus.projectPath = await gitRepo.revparse(['--show-toplevel']);
  gitStatus.selectedPath = projectPath;
  gitStatus.files = gitStatus.files.map(file => ({path: file.path, index: file.index, working_dir: file.working_dir}));

  return JSON.stringify(gitStatus);
}

async function handleGitPull(e, projectPath) {
  if(typeof projectPath === 'object' && projectPath.progress){
    let eventName = projectPath.progress;
    projectPath.progress = (event) => {
      /*
       {
         method: 'pull',
         stage: 'receiving',
         progress: 88,
         processed: 360,
         total: 408
       }
       {
         method: 'pull',
         stage: 'resolving',
         progress: 86,
         processed: 86,
         total: 100
       }
       */
      BrowserWindow.fromWebContents(e.sender).webContents.send(eventName, event);
    };
  }
  return await git(projectPath).pull();
}

async function showMessagePaste(event, projectPath) {
  // 创建菜单
  const menuTemplate = [];
  const clipboardText = clipboard.readText();

  if(clipboardText){
    menuTemplate.push({label: '粘贴', click: () => {
      event.sender.send('clipboard:readText', 'gitMessagePaste', clipboardText);
    }});
  }

  if(projectPath){
    const gitRepo = git(projectPath);
    const userEmail = (await gitRepo.raw(['config', '--get', 'user.email'])).trim();
    const logs = await gitRepo.raw([
      'log',
      `--author=${userEmail}`, // 按作者筛选
      '--pretty=format:%h%x01%s%x00', // 只输出 hash 和提交信息
      '-n', '10' // 限制 10 条
    ]);
    logs.trim().split('\x00').map(line => {
      const [hash, message] = line.split('\x01');

      if(message){
        menuTemplate.push({label: message, click: () => {
          event.sender.send('clipboard:readText', 'gitMessagePaste', message);
        }});
      }

      return {
        hash,
        message: message
      };
    });
  }

  const menuCount = menuTemplate.length;
  if(menuCount>0){
    if(menuCount>1){
      menuTemplate.splice(1, 0, { type: 'separator' });
    }

    // 显示菜单（自动定位到鼠标位置）
    Menu.buildFromTemplate(menuTemplate)
      .popup({ window: BrowserWindow.fromWebContents(event.sender) });
  }
}

module.exports = function setupGitHandlers() {
  ipcMain.handle('git:getRootPath', async (event, projectPath) => await git(projectPath).revparse(['--show-toplevel']));
  ipcMain.handle('git:getBranches', async (event, projectPath) => await git(projectPath).branchLocal());
  ipcMain.handle('git:getStatus', handleGitStatus);
  ipcMain.handle('git:switchBranch', async (event, projectPath, branch) => await git(projectPath).checkout(branch));
  ipcMain.handle('git:pull', handleGitPull);
  ipcMain.handle('git:add', async (event, projectPath, files) => await git(projectPath).add(files));
  ipcMain.handle('git:commit', async (event, projectPath, message) => await git(projectPath).commit(message));
  ipcMain.handle('git:push', async (event, projectPath) => await git(projectPath).push());
  ipcMain.handle('git:reset', async (event, projectPath, parameters) => await git(projectPath).reset(parameters));
  ipcMain.handle('git:showPasteContextMenu', showMessagePaste);
};