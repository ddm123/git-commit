const { app, BrowserWindow, Menu, ipcMain, clipboard } = require('electron');
const path = require('node:path');
const fs = require('fs');
const git = require('simple-git');
const { diffLines, diffChars } = require('diff');
const Store = require('../../modules/electron-store.js');

async function handleGitStatus(event, projectPath) {
  const gitRepo = git(projectPath);
  const gitStatus = await gitRepo.status(['--porcelain', projectPath]);
  //const gitDiff = await gitRepo.diffSummary(['--numstat']);//可以查看有改动文件的被删除行数和增加行数，但无法查看未跟踪的文件

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
      e.sender.send(eventName, event);
    };
  }
  return await git(projectPath).pull();
}

async function handleGitDiff(event, projectPath, options) {
  if(typeof options === 'string'){
    options = [options];
  }
  return await git(projectPath).diff(options);
}

async function getDiffContent(projectPath, file) {
  //const { execFileSync } = require('node:child_process');
  //const head = execFileSync('git', ['show', 'HEAD:' + file], { cwd: projectPath, encoding: null });
  //const head = await git(projectPath).raw(['show', 'HEAD:' + file]);//这种方式无法读取二进制文件
  const head = await git(projectPath).showBuffer('HEAD:' + file);

  const imageExt = isImageFile(file);
  if (imageExt) {
    return 'data:image/' + imageExt + ';base64,' + Buffer.from(head, 'binary').toString('base64');
  }

  const local = await fs.promises.readFile(path.join(projectPath, file), 'utf-8');
  return diffLines(head.toString(), local, { newlineIsToken: false, stripTrailingCr: true });
}

function getUserLogs(projectPath){
  const gitRepo = git(projectPath);
  return gitRepo.raw(['config', '--get', 'user.email'])
    .then(email => email ? email.trim() : '')
    .then(email => email ? gitRepo.raw([
      'log',
      '--author='+email, // 按作者筛选
      '--pretty=format:%h%x01%s%x00', // 只输出 hash 和提交信息
      '-n', '10' // 限制 10 条
    ]) : '')
    .then(logs => {
      const gitLogs = [];
      for(const line of logs.trim().split('\x00')){
        const [hash, message] = line.split('\x01');
        if(hash && message){
          gitLogs.push({hash, message});
        }
      }
      return gitLogs;
    });
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
    try{
      for(const log of await getUserLogs(projectPath)){
        let label = log.message;
        if(label.length>50){
          label = label.substring(0, 50) + '...';
        }
        menuTemplate.push({label: label, click: () => {
          event.sender.send('clipboard:readText', 'gitMessagePaste', log.message);
        }});
      }
    }catch(ex){
      console.error(ex);
    }
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

function handleShowDiff(event, projectPath, file, diffChunks) {
  const windowBounds = Store.singleton;
  const win = new BrowserWindow({
    x: windowBounds.getIntValue('diffWin.x') || 183,
    y: windowBounds.getIntValue('diffWin.y') || 66,
    width: windowBounds.getIntValue('diffWin.width') || 1000,
    height: windowBounds.getIntValue('diffWin.height') || 600,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/git-diff.js'),
      additionalArguments: [
        '--project-path=' + projectPath,
        '--is-packaged=' + (app.isPackaged ? 'true' : 'false')
      ]
    }
  });

  win.on('close', (event) => {
    if (!win.isDestroyed()) {
      const bounds = win.getBounds();
      if(win.isMaximized()){
        windowBounds.set('diffWin.isMaximized', true);
      }else{
        windowBounds.set('diffWin.isMaximized', false);
        if(!win.isMinimized()){
          windowBounds.set('diffWin.x', bounds.x);
          windowBounds.set('diffWin.y', bounds.y);
          windowBounds.set('diffWin.width', bounds.width);
          windowBounds.set('diffWin.height', bounds.height);
        }
      }
    }
  });
  if (windowBounds.get('diffWin.isMaximized', false)) {
    win.maximize();
  }

  win.loadFile('src/renderer/git-diff.html');
  win.setTitle('查看 '+file+' 差异');
  win.webContents.on('did-finish-load', () => {
    //win.webContents.openDevTools();
    win.webContents.send('show-diff-chunks', file, diffChunks);
  });

  return win.getTitle();
}

/**
 * @param {string} filePath 文件路径
 * @returns {string|boolean} 返回图片格式扩展名（不含点），如果不是图片则返回 false
 */
function isImageFile(filePath) {
  const lastDotIndex = filePath.lastIndexOf('.');
  const ext = lastDotIndex === -1 ? '' : filePath.substring(lastDotIndex + 1).toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'ico'].includes(ext) ? ext : false;
}

async function isBinaryFile(filePath, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    let read = 0;
    let checkedBOM = false;

    const done = (isBinary) => {
      stream.destroy();
      resolve(isBinary);
    };

    stream.on('data', (chunk) => {
      if (!checkedBOM) {
        checkedBOM = true;
        if (chunk.length >= 3 && chunk[0] === 0xEF && chunk[1] === 0xBB && chunk[2] === 0xBF) {
          return done(false); // UTF-8 BOM -> 文本
        }
      }

      read += chunk.length;
      // 逐字节检查（你的策略：遇到 >127 就判为二进制并立即返回）
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] > 127) return done(true);
      }

      if (read >= maxBytes) return done(false); // 达到上限仍未判二进制，认为文本
    });

    stream.on('end', () => done(false));
    stream.on('error', (err) => {
      stream.destroy();
      reject(err);
    });
  });
}

function closeDiffWindow(event) {
  //event.sender is webContents
  /** @var {BrowserWindow} win */
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
}

function toggleDevTools(event) {
  //event.sender is webContents
  if (event.sender.isDevToolsOpened()) {
    event.sender.closeDevTools();
  } else {
    event.sender.openDevTools({ mode: 'undocked', title: 'Developer Tools', activate: true });
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
  ipcMain.handle('git:checkout', async (event, projectPath, ...files) => await git(projectPath).checkout(['--', ...files]));
  ipcMain.handle('git:diff', handleGitDiff);
  ipcMain.handle('git:diffFile', (event, projectPath, file) => getDiffContent(projectPath, file));
  ipcMain.handle('git:showPasteContextMenu', showMessagePaste);
  ipcMain.handle('git:showDiff', handleShowDiff);
  ipcMain.on('diff-chars', (event, oldStr, newStr) => event.returnValue = diffChars(oldStr, newStr));
  ipcMain.on('close-diff-window', closeDiffWindow);
  ipcMain.on('toggle-dev-tools', toggleDevTools);
};