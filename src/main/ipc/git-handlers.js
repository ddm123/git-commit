const { BrowserWindow, ipcMain } = require('electron');
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
};