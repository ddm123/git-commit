document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    branches: [],
    files: [],

    init() {
      window.gitAPI.onProgress('git:progress', (event, data) => {
        Alpine.store('statusBar').statusText = '正在拉取远程仓库最新代码... ' + data.method + '(' + data.stage + '): ' + data.progress + '%';
      });
    },

    refresh(succeedCallback) {
      const projectPath = Alpine.store('projectPath').path;
      if (!projectPath || isDisabledBody()) return;

      clearMessages();
      disableBody(true);
      window.gitAPI.getBranches(projectPath).then((result) => {
        Alpine.store('projectPath').currentBranch = '';
        this.branches = [];
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
          .then(status => this.fillFileList(JSON.parse(status)))
          .then((files) => {
            const th = document.querySelector('th[x-on\\:click="sortFiles"][order-dir]');
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
          .catch(error => this.showError(error.message))
          .finally(() => disableBody(false));
      })
      .catch(error => {
        this.showError(error.message);
      })
      .finally(() => {
        disableBody(false);
      });
    },

    async fillFileList(status) {
      const projectPath = Alpine.store('projectPath').path;
      const files = [];

      Alpine.store('fileListing').selectedFilesCount = 0;

      if(status.current){
        Alpine.store('projectPath').currentBranch = status.current;
      }

      const types = {'M': 'modified', 'D': 'deleted', 'A': 'added', '?': 'untracked'};
      let typeLabels = {'M': '已修改', 'D': '已删除', 'A': '已添加', '?': '未跟踪'};
      await Promise.all(status.files.map(async (file, key) => {
        let path = file.path;
        let type = file.working_dir && file.working_dir!==' ' ? file.working_dir : file.index;
        let fileStat = type==='D' ? null : await window.electronAPI.getFileStat(status.projectPath, path);

        if (fileStat && fileStat.isDirectory) {
          return;
        }
        files.push({
          key: key,
          file: path,
          absPath: fileStat ? fileStat.absPath : projectPath + (projectPath.includes('\\') ? '\\' : '/') + path,
          status: types[type] ?? type,
          statusLabel: typeLabels[type] ?? type,
          size: fileStat ? fileStat.size : 0,
          ext: getExtname(path),
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
      }));

      this.files = files;
      Alpine.store('fileListing').selectedFilesCount = 0;
      return files;
    },

    sortFiles(event) {
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
});
