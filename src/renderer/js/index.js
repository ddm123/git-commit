document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    currentTheme: '',
    projectRootPath: null,
    branches: [],
    files: [],
    origFiles: [],
    currentFilesCount: 0,
    canPush: false,
    untrackedCount: 0,
    filterByDay: '0',
    filterByDays: new Map([['0', '任何时候修改的'], ['1', '今天修改的'], ['2', '最近两天修改的'], ['3', '最近3天修改的'], ['5', '最近5天修改的'], ['7', '最近一周修改的']]),
    filterDayRange: {start: 0, end: 0},
    selectedFilesCache: {submitting: new Set(), ignored: new Set()},
    ignoreFiles: new Set(),
    isIgnoreMode: false,
    forcedUseGitignore: false,
    filteredGitIgnoredFiles: new Set(),
    _renderingFiles: false,

    init() {
      const saveTheme = debounce(theme => window.electronStore.set('theme', theme), 1000);

      window.gitAPI.onProgress('git:progress', (event, data) => {
        Alpine.store('statusBar').setStatusText('正在拉取远程仓库最新代码... ' + data.method + '(' + data.stage + '): ' + data.progress + '%');
      });
      this.$watch('currentTheme', (theme) => {
        window.electronAPI.darkMode(theme==='dark');
        saveTheme(theme);
      });
      this.$watch('filterByDay', days => {
        days = parseFloat(days);
        if (days > 0) this.setFilterDayRange(days - 1);
        this.renderFiles(this.projectRootPath || Alpine.store('projectPath')?.path);
      });
      this.$watch('isIgnoreMode', flag => {
        this.renderFiles(this.projectRootPath || Alpine.store('projectPath')?.path);
      });

      this.currentTheme = window.electronStore.get('theme') ?? '';

      this.setFilterDayRange();
    },

    get isRenderingFiles() {
      return this._renderingFiles;
    },

    setFilterDayRange(subDays = 0) {
      const start = new Date(), end = new Date();
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      this.filterDayRange.start = start.getTime();
      this.filterDayRange.end = end.getTime();

      if (subDays > 0) {
        this.filterDayRange.start -= subDays*86400000; // 86400000 = 24*60*60*1000 (1 day in milliseconds)
      }

      return this;
    },

    clearAllList() {
      if (Alpine.store('projectPath')) Alpine.store('projectPath').currentBranch = '';
      if (Alpine.store('fileListing')) Alpine.store('fileListing').selectedFilesCount = 0;
      this.branches = [];
      this.files = [];
      this.origFiles = [];
      this.untrackedCount = 0;
      this.currentFilesCount = 0;
      document.dispatchEvent(new CustomEvent('files_changed', { detail: {files: this.files} }));
      return this;
    },

    refresh(succeedCallback) {
      const projectPath = Alpine.store('projectPath').path;
      if (!projectPath || isDisabledBody()) return;

      clearMessages();
      disableBody(true);

      this.clearAllList();

      window.gitAPI.branch(projectPath).then(async result => {
        if (result.all.length === 0) {
          showError('没有找到任何分支');
          return;
        }

        if (!result.current) {
          this.branches.push({
            label: '没有指定当前分支',
            branch: '',
            current: false,
            remote: false
          });
        }

        const commits = new Set();
        result.all.forEach(branch => {
          if (commits.has(result.branches[branch].commit)) return;
          commits.add(result.branches[branch].commit);

          const isRemote = branch.startsWith('remotes/');
          const branchName = isRemote ? branch.substring(8) : branch;
          const shortBranchName = isRemote ? branchName.replace(/^[^\/]+\//, '') : branchName;
          this.branches.push({
            label: result.branches[branch].name,
            branch: branchName,
            short: shortBranchName,
            current: result.branches[branch].current ?? (result.current == shortBranchName),
            remote: isRemote
          });
        });
        this.$nextTick(() => {
          if (result.current) Alpine.store('projectPath').currentBranch = result.current;
        });

        disableBody(true);
        window.gitAPI
          .getStatus(projectPath)
          .then(status => {
            disableBody(false);
            this.projectRootPath = status.projectPath;
            return this.fillFileList(status);
          })
          .then((files) => {
            if(typeof succeedCallback === 'function'){
              succeedCallback(files, this.branches);
            }

            return files;
          })
          .catch(error => {
            disableBody(false);
            if (error.cause && error.cause === 'signal.aborted') {
              console.error(error);
            } else {
              this.showError(textToHtml(error.message));
            }
          });
      })
      .catch(error => {
        this.showError(textToHtml(error.message));
      })
      .finally(() => {
        disableBody(false);
      });
    },

    async fillFileList(status) {
      if(status.current){
        Alpine.store('projectPath').currentBranch = status.current;
      }

      const path = this.projectRootPath || Alpine.store('projectPath').path;
      this.origFiles = status.files ?? [];
      if (this.isForcedUseGitignore()) {
        await this.filterGitIgnoredFiles(path, this.origFiles.map(f => f.file || f.path));
      }

      await this.renderFiles(path);
      document.dispatchEvent(new CustomEvent('files_changed', { detail: {files: this.files} }));

      return this.files;
    },

    renderFiles(projectPath) {
      this.files = [];
      this.currentFilesCount = 0;
      this._renderingFiles = true;

      const fileListing = Alpine.store('fileListing');
      const types = { 'M': 'modified', 'D': 'deleted', 'A': 'added', 'U': 'unmerged', '?': 'untracked' };
      const typeLabels = { 'M': '已修改', 'D': '已删除', 'A': '已添加', 'U': '未解决合并冲突', '?': '未跟踪' };

      if (fileListing) fileListing.selectedFilesCount = 0;

      return chunkRenderer(this.origFiles, this.files, i => {
        const file = this.origFiles[i];
        const type = file.working_dir && file.working_dir !== ' ' ? file.working_dir : file.index;

        if (typeof this.origFiles[i].stat === 'undefined') {
          this.origFiles[i].stat = type === 'D' ? null : window.electronAPI.getFileStatSync(projectPath, file.path);
        }
        this.origFiles[i].selected ??= file.index && file.index !== ' ' && file.index !== '?' && file.index !== 'U';

        if (this.isIgnored(this.origFiles[i], fileListing)) return true;

        const fileStat = this.origFiles[i].stat;
        this.origFiles[i].DS ??= projectPath.includes('\\') ? '\\' : '/';
        if (typeof file.file === 'undefined') {
          this.origFiles[i].file = file.path;
          this.origFiles[i].path = file.path.substring(0, file.path.lastIndexOf(this.origFiles[i].DS));
        }
        this.origFiles[i].absPath ??= fileStat ? fileStat.absPath : projectPath + this.origFiles[i].DS + this.origFiles[i].file;
        this.origFiles[i].status ??= types[type] ?? type;
        this.origFiles[i].statusLabel ??= typeLabels[type] ?? type;
        this.origFiles[i].size ??= fileStat ? fileStat.size : 0;
        this.origFiles[i].fsize ??= fileStat ? formatFileSize(fileStat.size) : '-';
        this.origFiles[i].ext ??= getExtname(this.origFiles[i].file);
        this.origFiles[i].timestamp ??= fileStat ? fileStat.mtimeMs : 0;
        this.origFiles[i].time ??= fileStat ? new Date(fileStat.mtimeMs).toLocaleString(navigator.language || 'zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }) : '-';

        if (type === '?') {
          this.untrackedCount++;
        }
        this.currentFilesCount++;
        return undefined;
      }, 50)
        .then(result => {
          this.currentFilesCount = this.files.length;
          const th = fileListing?.element.querySelector('table thead :where(td, th)[order-dir]');
          if (th) {
            const orderDir = th.getAttribute('order-dir') === 'asc' ? 'desc' : 'asc';
            th.setAttribute('order-dir', orderDir);
            this._renderingFiles = false
            this.sortFiles({ target: th });
          }
          return result;
        })
        .catch(error => {
          if (error?.cause !== 'signal.aborted') {
            throw error;
          }
        })
        .finally(() => this._renderingFiles = false);
    },

    isIgnored(file, fileListingStore) {
      if (file.stat && file.stat.isDirectory) return true; // 如果是一个文件夹，跳过

      const f = file.file ?? file.path;
      if (this.isIgnoreMode !== this.ignoreFiles.has(f)) return true;

      // 如果需要过滤日期
      const ftime = file.timestamp ?? (file.stat ? file.stat.mtimeMs : 0);
      if (this.filterByDay>0 && ftime>0 && (ftime<this.filterDayRange.start || ftime>this.filterDayRange.end)) return true;

      // 如果需要强行按/.gitignore文件内容来隐藏文件
      if (this.forcedUseGitignore && !this.filteredGitIgnoredFiles.has(f)) return true;

      if (file.selected) {
        if (fileListingStore) fileListingStore.selectedFilesCount++;
      } else if (this.selectedFilesCache[this.isIgnoreMode ? 'ignored' : 'submitting'].has(f)) {
        file.selected = true;
        if (fileListingStore) fileListingStore.selectedFilesCount++;
      }

      return false;
    },

    sortFiles(event) {
      if (this.isRenderingFiles) {
        showError('正在加载文件列表，请稍后...');
        return;
      }

      let th = event.target;
      let field = th.getAttribute('data-field');
      let orderBy = th.getAttribute('order-by') || field;
      let orderDir = th.getAttribute('order-dir')=='asc' ? 'desc' : 'asc';
      let ths = th.closest('tr').children;

      for(let i=0; i<ths.length; i++){
        if(ths[i].nodeType==1 && ths[i]!==th){
          ths[i].removeAttribute('order-dir');
        }
      }

      th.setAttribute('order-dir', orderDir);
      this.files.sort((a, b) => {
        if (a.status!==b.status && (a.status === 'untracked' || b.status === 'untracked')) {
          return a.status === 'untracked' ? 1 : -1;
        }
        if (a[orderBy] <= b[orderBy]) {
          return orderDir === 'asc' ? -1 : 1;
        }
        return orderDir === 'asc' ? 1 : -1;
      });
    },

    getSelectedFiles() {
      return this.files.filter(file => file.selected);
    },

    saveIgnoreFiles(projectPath) {
      let allIgnoreFiles = window.electronStore.get('ignoreFiles') ?? {};
      if (typeof allIgnoreFiles !== 'object') allIgnoreFiles = {};
      allIgnoreFiles[projectPath] = Array.from(this.ignoreFiles).join(';');
      return window.electronStore.setJSON('ignoreFiles', JSON.stringify(allIgnoreFiles));
    },

    loadIgnoreFiles(projectPath) {
      let allIgnoreFiles = window.electronStore.get('ignoreFiles') ?? {};
      if (typeof allIgnoreFiles !== 'object') allIgnoreFiles = {};
      return allIgnoreFiles[projectPath] ? allIgnoreFiles[projectPath].split(';') : [];
    },

    isForcedUseGitignore(...args) {
      const argc = args.length;
      let values = window.electronStore.get('forcedUseGitignore');

      // 如果是设置
      if (argc > 1 || (argc === 1 && typeof args[0] === 'boolean')) {
        const projectPath = argc > 1 ? args[0] : Alpine.store('projectPath').path;
        if (projectPath) {
          if (!values || typeof values !== 'object') values = {};
          this.forcedUseGitignore = values[projectPath] = (argc > 1 ? args[1] : args[0]) ? true : false;
          window.electronStore.setJSON('forcedUseGitignore', JSON.stringify(values));
        }
        return this;
      }

      if (!values || typeof values !== 'object') return false;

      const projectPath = argc > 0 ? args[0] : Alpine.store('projectPath').path;
      return this.forcedUseGitignore = values[projectPath] ? true : false;
    },

    filterGitIgnoredFiles(projectPath, files) {
      return window.electronAPI.filterGitIgnoredFiles(projectPath, files).then(files => {
        this.filteredGitIgnoredFiles = new Set(files);
        return files;
      });
    },

    changForcedUseGitignore (event) {
      const path = this.projectRootPath || Alpine.store('projectPath')?.path;
      if (path) {
        this.isForcedUseGitignore(event.target.checked);
        if (event.target.checked) {
          this.filterGitIgnoredFiles(path, this.origFiles.map(f => f.file || f.path)).then(() => this.renderFiles(path));
        } else {
          this.filteredGitIgnoredFiles.clear();
          this.renderFiles(path);
        }
      }
    },

    setSelectedFileCache(file, isAdd = true) {
      const key = this.isIgnoreMode ? 'ignored' : 'submitting';
      isAdd ? this.selectedFilesCache[key].add(file) : this.selectedFilesCache[key].delete(file);
      return this;
    },

    clearSelectedFileCache() {
      this.selectedFilesCache[this.isIgnoreMode ? 'ignored' : 'submitting'].clear();
      return this;
    },

    openDialog(title, message) {
      Alpine.store('dialog').open(title, message);
    },

    showError(msg) {
      if(!msg || msg.length<=128){
        showError(msg);
      }else{
        this.openDialog('错误信息', '<div style="color:red;">'+msg+'</div>');
      }
    }
  }));

  compileComponents().then(() => {
    document.dispatchEvent(new CustomEvent('componentsLoaded'));
  });
});
