document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    branches: [],
    files: [],
    _rafId: null,

    init() {
      window.gitAPI.onProgress('git:progress', (event, data) => {
        Alpine.store('statusBar').statusText = '正在拉取远程仓库最新代码... ' + data.method + '(' + data.stage + '): ' + data.progress + '%';
      });
    },

    get isRenderingFiles() {
      return this._rafId !== null;
    },

    refresh(succeedCallback) {
      const projectPath = Alpine.store('projectPath').path;
      if (!projectPath || isDisabledBody()) return;
      if (this._rafId!==null) {
        window.cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }

      clearMessages();
      disableBody(true);

      if (Alpine.store('projectPath')) Alpine.store('projectPath').currentBranch = '';
      if (Alpine.store('fileListing')) Alpine.store('fileListing').selectedFilesCount = 0;
      this.branches = [];
      this.files = [];
      window.gitAPI.getBranches(projectPath).then((result) => {
        if (result.all.length === 0) {
          showError('没有找到任何分支');
          return;
        }

        if (result.current) {
          Alpine.store('projectPath').currentBranch = result.current;
        }else{
          this.branches.push({
            label: '没有指定当前分支',
            value: ''
          });
        }

        result.all.forEach((branch) => {
          this.branches.push({
            label: result.branches[branch].name,
            value: branch
          });
        });

        disableBody(true);
        window.gitAPI
          .getStatus(projectPath)
          .then(status => {
            disableBody(false);
            return this.fillFileList(JSON.parse(status));
          })
          .then((files) => {
            const th = document.querySelector('.file-list thead :where(td, th)[order-dir]');
            if(th){
              const orderDir = th.getAttribute('order-dir')==='asc' ? 'desc' : 'asc';
              th.setAttribute('order-dir', orderDir);
              this.sortFiles({target: th});
            }

            if(typeof succeedCallback === 'function'){
              succeedCallback(files, this.branches);
            }

            return files;
          })
          .catch(error => {
            disableBody(false);
            this.showError(error.message);
          });
      })
      .catch(error => {
        this.showError(error.message);
      })
      .finally(() => {
        disableBody(false);
      });
    },

    async fillFileList(status) {
      if(status.current){
        Alpine.store('projectPath').currentBranch = status.current;
      }

      await this.renderFiles(Alpine.store('projectPath').path, status.files);
      if (this._rafId!==null) {
        window.cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      return this.files;
    },

    renderFiles(projectPath, files, start = 0) {
      return new Promise((resolve, reject) => {
        const limit = 10;
        const fileCount = files.length;
        const types = { 'M': 'modified', 'D': 'deleted', 'A': 'added', '?': 'untracked' };
        const typeLabels = { 'M': '已修改', 'D': '已删除', 'A': '已添加', '?': '未跟踪' };

        this._rafId = window.requestAnimationFrame(() => {
          let index = null;
          for (let i = 0; i < limit && index < fileCount; i++) {
            index = start + i;
            if (index < fileCount) {
              const file = files[index];
              const type = file.working_dir && file.working_dir !== ' ' ? file.working_dir : file.index;
              const fileStat = type === 'D' ? null : window.electronAPI.getFileStatSync(projectPath, file.path);

              if (fileStat && fileStat.isDirectory) {
                continue;
              }

              this.files.push({
                key: index,
                file: file.path,
                absPath: fileStat ? fileStat.absPath : projectPath + (projectPath.includes('\\') ? '\\' : '/') + file.path,
                status: types[type] ?? type,
                statusLabel: typeLabels[type] ?? type,
                size: fileStat ? fileStat.size : 0,
                ext: getExtname(file.path),
                fsize: fileStat ? formatFileSize(fileStat.size) : '-',
                timestamp: fileStat ? fileStat.mtimeMs : 0,
                time: fileStat ? new Date(fileStat.mtimeMs).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                }) : '-',
                selected: false
              });
            }
          }

          if (index && (++index < fileCount)) {
            this.renderFiles(projectPath, files, index).then(() => resolve(true)).catch(err => reject(err));
          } else {
            resolve(true);
          }
        });
      });
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

  compileComponents().then(() => document.dispatchEvent(new CustomEvent('componentsLoaded')));
});
