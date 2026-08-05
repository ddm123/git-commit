Alpine.store('projectPath', {
  path: '',
  currentBranch: ''
});

Alpine.data('projectPath', () => ({
  historyProjectPaths: [],
  lastSelectedPath: '',
  branches: [],
  ftpConfig: {},
  ftpDefaultPort: 21,
  savedFtpConfig: null,
  loadingIcon: '<span class="loading loading-spinner loading-xs" style="--size-selector:.185rem;"></span>',
  isSyncing: false,

  get selectProjectPathFlag() {
    return '%SELECT%';
  },

  async init() {
    this.savedFtpConfig = window.electronStore.get('ftp');

    window.gitAPI.onProgress('files.sync.progress', (event, data) => {
      let statusText = '';
      if (data.type === 'connected') {
        statusText = '';
      } else if (data.type === 'error') {
        if (data.sourcePath) statusText += '同步 ' + data.sourcePath + ' 出错: ';
        statusText += data.message;
        this.showError(data.sourcePath ? statusText : '文件自动同步失败: ' + statusText);
      } else if (data.message) {
        statusText += data.message;
      } else if (data.sourcePath) {
        statusText += '文件 ' + data.sourcePath + ' 已同步';
      }
      if (statusText !== '') {
        statusText += ' | ' + this.getTime();
      }
      Alpine.store('statusBar').setStatusText(statusText);
    });
    window.electronAPI.receive('manage-projects.closed', (event, ...paths) => {
      document.body.classList.remove('disable');

      const pathsStr = paths.join(';');
      if (pathsStr === this.historyProjectPaths.join(';')) return;

      this.historyProjectPaths = paths;
      window.electronStore.set('historyProjectPaths', pathsStr);

      this.$nextTick(()=>{
        if (paths.length === 0) {
          Alpine.store('projectPath').path = this.lastSelectedPath = '';
          this.clearAllList();
          window.electronStore.delete('projectPath');
        } else if (!paths.includes(Alpine.store('projectPath').path)) {
          Alpine.store('projectPath').path = this.lastSelectedPath = paths[0];
          this.selectProjectPath({target: {value: paths[0]}});
        }
      });
    });
    this.$watch('$store.projectPath.path', path => {
      if(path && path !== this.selectProjectPathFlag){
        this.ftpConfig = (this.savedFtpConfig && typeof this.savedFtpConfig[path] === 'object') ? Object.assign({}, this.savedFtpConfig[path]) : {};
        this.initIgnoredFiles(path);
        window.gitAPI.getUnpushedCommits(path).then(commits => this.canPush = commits.length > 0);
      }
    });
    this.$watch('ftpConfig.protocol', protocol => {
      this.ftpDefaultPort = protocol === 'sftp' ? 22 : 21;
    });

    let paths = window.electronStore.get('historyProjectPaths');
    if(paths){
      paths = paths.split(';').filter(p => p && p !== this.selectProjectPathFlag);
      this.historyProjectPaths = paths;
      await this.$nextTick();// 等待渲染好 DOM 后再继续
    }

    let path = window.electronStore.get('projectPath') || (this.historyProjectPaths[0] ?? '');
    if (path === this.selectProjectPathFlag) path = '';
    if (!this.historyProjectPaths.includes(path)) {
      path = this.historyProjectPaths[0] ?? '';
      window.electronStore.set('projectPath', path);
    }

    Alpine.store('projectPath').path = this.lastSelectedPath = path;

    document.addEventListener('componentsLoaded', () => {
      if(path){
        this.refresh();
      }
      if (this.isSyncEnabled(path)) {
        this.startSyncFiles(path);
      } else {
        window.electronAPI.stopSyncFiles();
      }
    });
  },

  getTime() {
    const date = new Date();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    return (hours < 10 ? '0' + hours : hours) + ':' + (minutes < 10 ? '0' + minutes : minutes) + ':' + (seconds < 10 ? '0' + seconds : seconds);
  },

  isSyncEnabled(path) {
    return path && this.savedFtpConfig && typeof this.savedFtpConfig[path] === 'object' && this.savedFtpConfig[path].autoSync && this.savedFtpConfig[path].host;
  },

  startSyncFiles(path) {
    Alpine.store('statusBar').setStatusText(this.loadingIcon + ' 正在启动文件同步...', true);
    return window.electronAPI.startSyncFiles(path, 'files.sync.progress').then(result => {
      this.isSyncing = result;
      Alpine.store('statusBar').setStatusText(result ? this.loadingIcon + ' 正在扫描项目文件...' : '启动文件同步失败，已停止自动同步。', true);
      return result;
    });
  },

  stopSyncFiles() {
    if (this.isSyncing) Alpine.store('statusBar').setStatusText(this.loadingIcon + ' 正在停止文件同步服务...', true);
    return window.electronAPI.stopSyncFiles().then(isStopped => {
      this.isSyncing = false;
      Alpine.store('statusBar').setStatusText(isStopped ? '文件同步服务已停止' : '');
      return isStopped;
    });
  },

  selectProjectPath(event) {
    if (isDisabledBody()) {
      Alpine.store('projectPath').path = this.lastSelectedPath;
      return;
    }

    const selectedValue = event.target.value;
    const restartSyncFiles = function(projectPath) {
      this.stopSyncFiles().then(isStopped => {
        if (this.isSyncEnabled(projectPath)) {
          this.startSyncFiles(projectPath);
        }
      }).catch((error) => {
        showError('文件同步服务停止失败，无法重新为当前项目启动文件同步。请重启本程序。<br>' + error.message);
      });
    };

    if (selectedValue === this.selectProjectPathFlag) {
      disableBody(true);
      window.electronAPI.openDirectory(this.lastSelectedPath).then((result) => {
        if (result) {
          if(!this.historyProjectPaths.includes(result)){
            this.historyProjectPaths.unshift(result);
          }

          Alpine.store('projectPath').path = result;

          disableBody(false);
          this.refresh(() => {
            // 提供的路径如果是有效的，则更新这次选择的路径
            this.lastSelectedPath = result;
            window.electronStore.set('projectPath', result);

            let paths = window.electronStore.get('historyProjectPaths');
            paths = paths ? paths.split(';') : [];
            if(!paths.includes(result)){
              paths.unshift(result);
              window.electronStore.set('historyProjectPaths', paths.join(';'));
            }

            restartSyncFiles.call(this, result);
          });
        } else {
          Alpine.store('projectPath').path = this.lastSelectedPath;
          window.electronStore.set('projectPath', this.lastSelectedPath);
        }
      })
      .finally(() => {
        disableBody(false);
      });
    } else if (selectedValue) {
      Alpine.store('projectPath').path = selectedValue;
      this.refresh(() => {
        // 提供的路径如果是有效的，则更新这次选择的路径
        this.lastSelectedPath = selectedValue;
        window.electronStore.set('projectPath', selectedValue);

        restartSyncFiles.call(this, selectedValue);
      });
    }
  },

  manageProjects() {
    document.body.classList.add('disable');
    window.electronAPI.showProjectsDialog(...this.historyProjectPaths);
  },

  switchBranch(event) {
    if(isDisabledBody()) return;

    clearMessages();
    let branchName = event.target.value;
    let branch = null;

    if (!branchName) {
      showError('请选择分支');
      return;
    }
    for (let i = this.branches.length; i--;) {
      if (this.branches[i].short === branchName) {
        branch = this.branches[i];
        break;
      }
    }
    if (!branch) {
      showError('请选择分支');
      return;
    }

    const resetBranch = function () {
      return window.gitAPI.raw(Alpine.store('projectPath').path, ['symbolic-ref', '--short', 'HEAD'])
        .then(result => Alpine.store('projectPath').currentBranch = result ? result.trim() : '');
    };
    const run = (branch) => {
      disableBody(true);

      const options = ['switch'];
      if (branch.remote) {
        options.push('-c', branch.short, branch.branch);
      } else {
        options.push(branch.branch);
      }
      window.gitAPI.raw(Alpine.store('projectPath').path, options)
        .then(() => {
          this.refresh();
          showSuccess('已成功切换到 '+ branch.branch + ' 分支');
        })
        .catch((error) => {
          this.showError(textToHtml(error.message));
          resetBranch();
        })
        .finally(() => disableBody(false));
    };

    if (branch.remote) {
      Alpine.store('dialog').open('确认切换分支提示', '确定要切换到 ' + branch.label + ' 分支吗?<br/>这将会在本地创建一个新的分支：'+ branch.short, true, true, true)
        .then(act => {
          if (act === 'ok') run(branch);
          else resetBranch();
        });
    } else {
      run(branch);
    }
  },

  showFtpConfig() {
    const path = Alpine.store('projectPath').path;
    if (!path) {
      showError('项目路径不能为空');
      return;
    }

    this.ftpConfig = (this.savedFtpConfig && typeof this.savedFtpConfig[path] === 'object') ? Object.assign({}, this.savedFtpConfig[path]) : {};
    this.ftpConfig.autoSync ??= false;
    this.ftpConfig.childProcessSync ??= true;
    this.ftpConfig.ignoredPaths ??= '**/node_modules/**\n**/.git/**\n**/.DS_Store**';
    document.getElementById('ftp-config-dialog').showModal();
  },

  saveFtpConfig() {
    const path = Alpine.store('projectPath').path;
    if(!path){
      showError('项目路径不能为空');
      return;
    }

    let savedConfig = window.electronStore.get('ftp');
    if (this.ftpConfig.host) {
      savedConfig = (savedConfig && typeof savedConfig === 'object') ? savedConfig : {};
      savedConfig[path] = Object.assign({}, this.ftpConfig);

      if (savedConfig[path].autoSync) {
        window.electronStore.setJSON('ftp', JSON.stringify(savedConfig));

        if (this.savedFtpConfig && typeof this.savedFtpConfig[path] === 'object' && this.isFtpConfigChanged(this.savedFtpConfig[path], savedConfig[path])) {
          // 如果忽略路径发生了变化，则需要重启文件监听服务
          this.stopSyncFiles()
            .then(() => this.startSyncFiles(path))
            .catch(err => showError('文件同步服务停止失败，无法重新为当前项目启动文件同步。请重启本程序。<br>' + err.message));
        } else {
          this.startSyncFiles(path);
        }
      } else {
        window.electronStore.setJSON('ftp', JSON.stringify(savedConfig));
        window.electronAPI.stopSyncFiles().then(result => Alpine.store('statusBar').setStatusText(result ? '已停止文件自动同步' : ''));
      }
    } else if (savedConfig && typeof savedConfig === 'object' && typeof savedConfig[path] !== 'undefined') {
      window.electronAPI.stopSyncFiles().then(result => Alpine.store('statusBar').setStatusText(result ? '已停止文件自动同步' : ''));
      delete savedConfig[path];

      window.electronStore.setJSON('ftp', JSON.stringify(savedConfig));
    }

    this.savedFtpConfig = savedConfig;
    showSuccess('已成功保存FTP设置');

    document.getElementById('ftp-config-dialog').close();
  },

  isFtpConfigChanged(before, after) {
    if (before.ignoredPaths != after.ignoredPaths) return true;
    if (before.remotePath != after.remotePath) return true;
    if (before.childProcessSync != after.childProcessSync) return true;
    if (before.host != after.host) return true;
    if (before.port != after.port) return true;
    if (before.username != after.username) return true;
    if (before.password != after.password) return true;
    return false;
  },

  closeFtpConfig() {
    const path = Alpine.store('projectPath').path;
    this.ftpConfig = (path && this.savedFtpConfig && typeof this.savedFtpConfig[path] === 'object') ? Object.assign({}, this.savedFtpConfig[path]) : {};
    document.getElementById('ftp-config-dialog').close();
  },

  initIgnoredFiles(projectPath) {
    const files = this.loadIgnoreFiles(projectPath);
    if (files.length || this.ignoreFiles.size) this.ignoreFiles = new Set(files);
    if (this.$store.ignoreFileListing) this.$store.ignoreFileListing.isNeedRefresh = true;
  }
}));
