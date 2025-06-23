document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    isDisabledBody: false,
    projectPath: '',
    historyProjectPaths: [],
    lastSaveArchiver: null,
    branches: [],
    files: [],
    canPush: false,
    selectedFilesCount: 0,
    currentBranch: '',
    commitMessage: '',
    processMessage: '',
    dialogTitle: '',
    dialogBody: '',

    init() {
      window.gitAPI.onProgress('git:progress', (event, data) => {
        this.processMessage = '正在拉取远程仓库最新代码... ' + data.method + '(' + data.stage + '): ' + data.progress + '%';
      });
      window.electronAPI.onPaste((event, type, text) => {
        if(type==='gitMessagePaste'){
          this.insertCommitMessage(text);
        }
      });
      window.electronAPI.onMenuClick('git:checkout', (event, path, file) => {
        if(window.confirm('是否放弃对 "' + file + '" 的修改？')){
          window.gitAPI.checkout(path, file).then(() => {
            showSuccess('已还原 "' + file + '" 的修改');
            this.refresh();
          }).catch((error) => {
            showError(error.message);
          });
        }
      });
      window.electronAPI.onMenuClick('dialog:showSaveDialog', (event, path, ...files) => {
        window.electronAPI.showSaveDialog({
          title: '压缩文件保存到...',
          filters: [{name: 'ZIP 文件', extensions: ['zip']}],
          defaultPath: this.lastSaveArchiver || path
        }).then((filePath) => {
          if(filePath){
            if(!filePath.toLowerCase().endsWith('.zip')){
              filePath += '.zip';
            }
            this.lastSaveArchiver = filePath;
            window.electronAPI.createArchiver(filePath, path, files, {zlib: {level: 6}}).then(() => {
              showSuccess('已成功保存压缩文件到: ' + filePath);
            }).catch((error) => {
              showError('保存压缩文件失败: ' + error.message);
            });
          }
        }).catch((error) => {
          showError('保存压缩文件失败: ' + error.message);
        });
      });
      window.electronAPI.getStoreValue('historyProjectPaths').then(paths => {
        if(paths){
          paths = paths.split(';');
          this.historyProjectPaths = paths;
        }

        window.electronAPI.getStoreValue('projectPath').then(path => {
          if(path || (path = this.historyProjectPaths[0] ?? '')){
            this.projectPath = path;
            this.refresh();
          }
        });
      });
    },

    selectProjectPath(event) {
      const lastSelectedValue = event.target.getAttribute('data-last-selected') || '';
      if (this.isDisabledBody) {
        this.projectPath = lastSelectedValue;
        return;
      }

      const selectedValue = event.target.value;

      if (selectedValue === '%SELECT%') {
        this.isDisabledBody = true;
        window.electronAPI.openDirectory(lastSelectedValue).then((result) => {
          if (result) {
            if(!this.historyProjectPaths.includes(result)){
              this.historyProjectPaths.unshift(result);
            }

            event.target.setAttribute('data-last-selected', result);
            this.projectPath = result;
            this.refresh();
            window.electronAPI.setStoreValue('historyProjectPaths', this.historyProjectPaths.join(';'));
          } else {
            this.projectPath = lastSelectedValue;
          }
          window.electronAPI.setStoreValue('projectPath', this.projectPath);
        })
        .finally(() => {
          this.isDisabledBody = false;
        });
      } else if (selectedValue) {
        this.projectPath = selectedValue;
        event.target.setAttribute('data-last-selected', selectedValue);
        this.refresh();
        window.electronAPI.setStoreValue('projectPath', this.projectPath);
      }
    },

    refresh() {
      if (!this.projectPath) return;

      clearMessages();
      this.isDisabledBody = true;
      window.gitAPI.getBranches(this.projectPath).then((result) => {
        this.currentBranch = '';
        this.branches = [];
        if (result.all.length === 0) {
          showError('没有找到任何分支');
          return;
        }

        if (result.current) {
          this.currentBranch = result.current;
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

        this.isDisabledBody = true;
        window.gitAPI
          .getStatus(this.projectPath)
          .then(status => this.fillFileList(JSON.parse(status)))
          .then((files) => {
            const th = document.querySelector('th[x-on\\:click="sortFiles"][order-dir]');
            if(th){
              const orderDir = th.getAttribute('order-dir')==='asc' ? 'desc' : 'asc';
              th.setAttribute('order-dir', orderDir);
              this.sortFiles({target: th});
            }
            return files;
          })
          .catch(error => this.showError(error.message))
          .finally(() => this.isDisabledBody = false);
      })
      .catch(error => {
        this.showError(error.message);
      })
      .finally(() => {
        this.isDisabledBody = false;
      });
    },

    async fillFileList(status) {
      const files = [];
      this.selectedFiles = [];
      this.selectedFilesCount = 0;

      if(status.current){
        this.currentBranch = status.current;
      }

      const types = {'M': 'modified', 'D': 'deleted', 'A': 'added', '?': 'untracked'};
      let typeLabels = {'M': '已修改', 'D': '已删除', 'A': '已添加', '?': '未跟踪'};
      await Promise.all(status.files.map(async (file) => {
        let path = file.path;
        let type = file.working_dir && file.working_dir!==' ' ? file.working_dir : file.index;
        let fileStat = type==='D' ? null : await window.electronAPI.getFileStat(status.projectPath, path);

        if (fileStat && fileStat.isDirectory) {
          return;
        }
        files.push({
          file: path,
          absPath: fileStat ? fileStat.absPath : this.projectPath + (this.projectPath.includes('\\') ? '\\' : '/') + path,
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

    toggleSelectAll(event) {
      let isChecked = event.target.checked;
      this.selectedFilesCount = 0;
      this.files.forEach((file) => {
        file.selected = isChecked;
        if (isChecked) {
          this.selectedFilesCount++;
        }
      });
    },

    getSelectedFiles() {
      return this.files.filter(file => file.selected);
    },

    insertCommitMessage(text) {
      const textareas = document.querySelectorAll('textarea[x-model="commitMessage"]');
      if(textareas.length){
        let startPos = 0, endPos = 0;
        let beforeText = '', afterText = '';
        for(const textarea of textareas){
          // 获取当前光标位置或选中文本范围
          startPos = textarea.selectionStart;
          endPos = textarea.selectionEnd;
          beforeText = this.commitMessage.substring(0, startPos);
          afterText = this.commitMessage.substring(endPos);

          this.commitMessage = beforeText + text + afterText;
          textarea.focus();
          textarea.setRangeText(
            text,// 要插入的文本
            textarea.selectionStart,
            textarea.selectionEnd,
            'end'// 可选: 'start'|'end'|'preserve'（光标位置）
          );
        }
      }else{
        this.commitMessage = text;
      }
    },

    switchBranch(event) {
      if(this.isDisabledBody) return;

      clearMessages();
      let branch = event.target.value;
      if (!branch) {
        showError('请选择分支');
        return;
      }
      this.isDisabledBody = true;
      window.gitAPI.switchBranch(this.projectPath, branch)
        .then(() => {
          this.refresh();
          showSuccess('已成功切换到 '+ branch + ' 分支');
        })
        .catch((error) => this.showError(error.message))
        .finally(() => this.isDisabledBody = false);
    },

    showDiff(file) {
      if(this.isDisabledBody) return;

      clearMessages();
      if(file.status!=='modified'){
        showError('当前文件不是已修改状态，无法查看差异');
        return;
      }

      this.isDisabledBody = true;
      window.gitAPI.diff(this.projectPath, [file.file])
        .then(result => {
          const chunks = result ? result.split(/\s*@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@[\t ]*[^\r\n]*[\r\n]/) : [];
          const changes = [];
          const fileMatch = /a[/\\](.+?)\s+b[/\\]\1/gi.exec(chunks[0]);
          for (let i = 1; i < chunks.length; i += 5) {
            const len = changes.push({
              oldStart: parseInt(chunks[i]),
              oldLines: parseInt(chunks[i+1] || 1),
              newStart: parseInt(chunks[i+2]),
              newLines: parseInt(chunks[i+3] || 1),
              code: chunks[i+4].split(/[\r\n]/)
            });
            changes[len - 1].diffCode = this._parseDiffCode(changes[len - 1]);
          }
          window.gitAPI.showDiff(fileMatch ? fileMatch[1] : null, changes);
        })
        .catch(error => this.showError(error.message))
        .finally(() => this.isDisabledBody = false);
    },

    commit(event) {
      if(this.isDisabledBody) return;

      clearMessages();

      if(!this.commitMessage) {
        showError('请输入提交信息');
        return;
      }

      const files = this.getSelectedFiles().map(file => file.file);
      if(!files.length) {
        showError('请选择需要提交的文件');
        return;
      }
      this.isDisabledBody = true;

      let isPush = event.target.getAttribute('data-action') === 'commitAndPush';
      let commitResult = this._commit(files, this.commitMessage, isPush);
      commitResult.then(() => {
          this.refresh();
          showSuccess(isPush ? '已成功提交并推送到远程仓库' : '已成功提交');

          this.commitMessage = '';
          this.processMessage = '';
        })
        .catch((error) => this.showError(error.message))
        .finally(() => {
          this.isDisabledBody = false;
        });
    },

    push() {
      if(this.isDisabledBody) return;
      clearMessages();
      this.isDisabledBody = true;
      this.processMessage = '正在推送代码...';
      window.gitAPI.push(this.projectPath)
        .then(() => {
          showSuccess('已成功推送到远程仓库');
          this.canPush = false;
        })
        .finally(() => {
          this.processMessage = '';
          this.isDisabledBody = false;
        });
    },

    pull() {
      if(this.isDisabledBody) return;
      clearMessages();
      this.isDisabledBody = true;
      window.gitAPI.pull({
        baseDir: this.projectPath,
        progress: 'git:progress'
        //progress: (event) => this.processMessage = '正在拉取远程仓库最新代码... ' + event.progress + '%'
      })
        .then((result) => {
          if(result.files && result.files.length > 0){
            let html = '';
            for(let file of result.files){
              let lines = '';
              html += '<div>';
              if(typeof result.insertions[file] !== 'undefined'){
                lines += ` <span style="color:green;">+${result.insertions[file]}</span>`;
              }
              if(typeof result.deletions[file] !== 'undefined'){
                lines += ` <span style="color:red;">-${result.deletions[file]}</span>`;
              }
              if(lines===''){
                if(result.created && result.created.includes(file)){
                  file = `<span style="color:green;">${file} 新增</span>`;
                }else if(result.deleted && result.deleted.includes(file)){
                  file = `<span style="color:red;">${file} 已删除</span>`;
                }
              }
              html += file + lines;
              html += '</div>';
            }
            this.openDialog('拉取远程仓库最新代码', html);
          }else{
            showSuccess('已成功拉取远程仓库最新代码');
          }
          this.processMessage = '';
        })
        .catch((error) => this.showError(error.message))
        .finally(() => this.isDisabledBody = false);
    },

    openDialog(title, message) {
      this.dialogTitle = title;
      this.dialogBody = message;
      document.getElementById('app-dialog').showModal();
    },

    showError(msg) {
      if(!msg || msg.length<=128){
        showError(msg);
      }else{
        this.openDialog('错误信息', '<div style="color:red;">'+msg+'</div>');
      }
    },

    clickRow(event, tr) {
      const checkbox = tr.querySelector('.col-checkbox input[type="checkbox"]');
      if (checkbox) {
        checkbox.focus();
      }
    },

    showPathContextMenu(currentFile) {
      let files = this.getSelectedFiles();
      let menus = [];

      menus.push(
        {label: '复制相对路径', text: currentFile.file},
        {label: '复制绝对路径', text: currentFile.absPath}
      );
      if(files.length>0){
        let absPaths = [];
        let paths = [];
        for(const file of files){
          absPaths.push(file.absPath);
          paths.push(file.file);
        }

        menus.push(
          '-',
          {label: '复制选中文件的相对路径', text: paths.join("\n")},
          {label: '复制选中文件的绝对对路径', text: absPaths.join("\n")},
          {label: '打包选中的文件', text: 'archiver', handler: 'dialog:showSaveDialog', args: [this.projectPath, ...paths]}
        );
      }
      if(currentFile.status!=='untracked'){
        menus.push(
          '-',
          {label: '放弃修改', text: currentFile.file, handler:'git:checkout', args:[this.projectPath, currentFile.file]}
        );
      }

      window.electronAPI.showPathContextMenu(menus);
    },

    keyboardSelectFile(event) {
      if(event.target.tagName.toLowerCase()==='input' || event.target.type==='checkbox'){
        let el = null;
        if(event.keyCode === 38) {//上箭头
          event.preventDefault();
          el = event.target.closest('tr').previousElementSibling;
        }else if(event.keyCode === 40){//下箭头
          event.preventDefault();
          el = event.target.closest('tr').nextElementSibling;
        }
        if(el){
          el.querySelector('.col-checkbox input[type="checkbox"]').focus();
        }
      }
    },

    async _commit(files, message, isPush) {
      this.processMessage = '拉取最新代码...';

      //失败无回滚
      /*let result = window.gitAPI.pull(this.projectPath)//先拉取
        .then((result) => {
          this.processMessage = '正在添加需要提交的文件..';
          return window.gitAPI.add(this.projectPath, files);
        })//再添加
        .then((result) => {
          this.processMessage = '正在提交代码...';
          return window.gitAPI.commit(this.projectPath, message);
        });//然后提交

        if(isPush){
          return result.then((result) => {
            this.processMessage = '正在推送代码...';
            return window.gitAPI.push(this.projectPath);
          });//最后推送
        }
        return result;*/

      //失败有回滚
      let state = {
        added: false,
        committed: false
      };

      try {
        await window.gitAPI.pull({baseDir: this.projectPath, progress: 'git:progress'});//先拉取

        // 第一步：添加文件
        this.processMessage = '正在添加需要提交的文件..';
        await window.gitAPI.add(this.projectPath, files);
        state.added = true; // 标记已添加

        // 第二步：提交
        this.processMessage = '正在提交代码...';
        const commitResult = await window.gitAPI.commit(this.projectPath, message);
        state.committed = true; // 标记已提交

        // 第三步：推送
        if(isPush){
          this.processMessage = '正在推送代码...';
          const pushResult = await window.gitAPI.push(this.projectPath);
          this.canPush = false;
          return pushResult;
        }

        this.canPush = true;
        return commitResult;
      } catch (error) {
        // 错误处理（根据失败阶段精准回滚）
        if (state.committed) {
          // 第三步失败：已提交但推送失败 → 撤销提交和添加
          this.processMessage = '推送失败，开始回滚提交和暂存';
          await window.gitAPI.reset(this.projectPath, ['HEAD~1', '--mixed']); // 撤销提交（保留修改到工作区）
          await window.gitAPI.reset(this.projectPath, ['HEAD', '--', ...files]); // 取消暂存
        } else if (state.added) {
          // 第二步失败：已添加但提交失败 → 仅取消暂存
          this.processMessage = '提交失败，取消暂存';
          await window.gitAPI.reset(this.projectPath, ['HEAD', '--', ...files]);
        }

        throw error;
      }
    },

    _parseDiffCode(changes) {
      const diffCode = [[], []];
      changes.code.pop();//最后一行是多出来的

      for(let lines = changes.code.length, i = 0; i<lines; i++){
        if(changes.code[i] === '\\ No newline at end of file') break;

        let len1 = diffCode[0].length, len2 = diffCode[1].length;
        if(changes.code[i].startsWith('-')){
          diffCode[0].push({
            line: len1 ? diffCode[0][len1 - 1].line+1 : changes.oldStart+i,
            code: changes.code[i],
            change: '-'
          });
        }else if(changes.code[i].startsWith('+')){
          diffCode[1].push({
            line: len2 ? diffCode[1][len2 - 1].line+1 : changes.newStart+i,
            code: changes.code[i],
            change: '+'
          });
        }else{
          let row = {
            line: Math.max(
              len1 ? diffCode[0][len1 - 1].line+1 : changes.oldStart+i,
              len2 ? diffCode[1][len2 - 1].line+1 : changes.newStart+i
            ),
            code: changes.code[i],
            change: ''
          };
          let noneLines = [0, 0];
          if(len1){
            for(let j = diffCode[0][len1 - 1].line + 1; j < row.line; j++){
              diffCode[0].push({
                line: '',
                code: '',
                change: 'none'
              });
              noneLines[0]++;
            }
          }
          if(len2){
            for(let j = diffCode[1][len2 - 1].line + 1; j < row.line; j++){
              diffCode[1].push({
                line: '',
                code: '',
                change: 'none'
              });
              noneLines[1]++;
            }
          }
          diffCode[0].push(row);
          diffCode[1].push(row);
        }
      }
      return diffCode;
    }
  }));
});
