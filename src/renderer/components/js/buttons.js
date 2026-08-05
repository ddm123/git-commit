Alpine.data('buttons', () => ({
  isLoadingLogs: false,

  init() {
    window.addEventListener('keydown', event => {
      // 如果事件已经在进行中，则不做任何事。
      if (event.defaultPrevented) return;

      if (event.key === 'F5') {
        event.preventDefault();
        this.refresh();
      } else if (event.key === 'F6') {
        event.preventDefault();
        this.pull();
      } else if (event.key === 'F7') {
        event.preventDefault();
        this.stashList();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        this.commit(event, event.shiftKey);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        this.showLogHistories();
      }
    });
  },

  commit(event, isPush) {
    if (this.isRenderingFiles) {
      showError('正在加载文件列表，请稍后...');
      return;
    }

    if (isDisabledBody()) return;

    clearMessages();

    const commitMessage = Alpine.store('commitMessage').message;

    if(!commitMessage) {
      showError('请输入提交信息');
      return;
    }

    const files = this.getSelectedFiles().map(file => file.file);
    if(!files.length) {
      showError('请选择需要提交的文件');
      return;
    }
    disableBody(true);

    isPush ??= event.target?.getAttribute('data-action') === 'commitAndPush';
    let commitResult = this._commit(files, commitMessage, isPush);
    commitResult.then(() => {
      disableBody(false);
      this.refresh();
      showSuccess(isPush ? '已成功提交并推送到远程仓库' : '已成功提交');

      Alpine.store('commitMessage').message = '';
      Alpine.store('statusBar').setStatusText('');
      this.clearSelectedFileCache();
    })
    .catch((error) => {
      disableBody(false);
      this.showError(error.message.replace(/(?:\r\n|\r|\n)/g, '<br/>'));
    });

    return commitResult;
  },

  push() {
    if(isDisabledBody()) return;
    clearMessages();
    disableBody(true);

    Alpine.store('statusBar').setStatusText('拉取最新代码...');
    const projectPath = Alpine.store('projectPath').path;
    window.gitAPI.pull({baseDir: projectPath, progress: 'git:progress'}).then(async (pullResult) => {
      if (pullResult.files && pullResult.files.length > 0) {
        // 如果有拉取到别人已有新的提交，则撤消我的提交，再重新提交
        Alpine.store('statusBar').setStatusText('推送到远程仓库之前发现已有其他人提交');
        const commits = await window.gitAPI.getUnpushedCommits(projectPath);
        const count = commits.length;
        if (count > 0) {
          Alpine.store('statusBar').setStatusText('开始撤消您的 '+count+' 个提交...');
          await window.gitAPI.reset(projectPath, ['HEAD~'+count, '--mixed']); // 撤销提交（保留修改到工作区）
          await window.gitAPI.reset(projectPath, ['HEAD', '--', ...files]);// 取消暂存

          let message = '';
          let files = [];
          for (let i = 0; i < count; i++) {
            if (commits[i].message) {
              if (message !== '') message += '\n';
              message += commits[i].message;
            }
            files.push(...commits[i].files);
          }

          return this._commit(files, message, true);
        }
      }

      Alpine.store('statusBar').setStatusText('正在推送代码...');
      return window.gitAPI.push(projectPath)
        .then(() => {
          showSuccess('已成功推送到远程仓库');
          this.canPush = false;
        });
    })
    .catch(err => {
      this.showError(err.message.replace(/(?:\r\n|\r|\n)/g, '<br/>'));
    })
    .finally(() => {
      Alpine.store('statusBar').setStatusText('');
      disableBody(false);
    });
  },

  pull() {
    if(isDisabledBody()) return;
    clearMessages();
    disableBody(true);
    Alpine.store('statusBar').setStatusText('正在拉取远程仓库最新代码...');
    window.gitAPI.pull({
      baseDir: Alpine.store('projectPath').path,
      progress: 'git:progress'
      //progress: (event) => Alpine.store('statusBar').setStatusText('正在拉取远程仓库最新代码... ' + event.progress + '%')
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
      })
      .catch((error) => this.showError(error.message.replace(/(?:\r\n|\r|\n)/g, '<br/>')))
      .finally(() => {
        disableBody(false);
        Alpine.store('statusBar').setStatusText('');
      });
  },

  stashList() {
    if(isDisabledBody()) return;

    disableBody(true);
    window.gitAPI.stash.list(Alpine.store('projectPath').path)
      .then(result => {
        const len = result.all.length;
        let html = '';
        if (len > 0) {
          html += '<table class="table table-xs"';
          html += ' x-data="{';
          html += 'list: ' + JSON.stringify(result.all).replaceAll('"', '&quot;') + ',';
          html += 'pop(index) {';
          html += 'window.gitAPI.stash.pop(Alpine.store(\'projectPath\').path, \'stash@{\'+index+\'}\').then((res) => {';
          html +=   'const files = res ? this.getConflictFiles(res) : [];';
          html +=   'const filesCount = files.length;';
          html +=   'if (filesCount) {';
          html +=     'this.refresh();';
          html +=     'this.openDialog(\'有 \'+filesCount+\' 个文件合并冲突，需要手动解决冲突\', \'冲突的文件：<br>\'+files.join(\'<br>\'));';
          html +=   '} else {';
          html +=     'this.remove(index);';
          html +=     'this.refresh(() => showSuccess(\'已成功恢复储藏的文件并已删除该储藏\'));';
          html +=   '}';
          html += '}).catch(err => {';
          html +=   'const files = this.getConflictFiles(err.message);';
          html +=   'const filesCount = files.length;';
          html +=   'if (filesCount) {';
          html +=     'this.openDialog(\'有 \'+filesCount+\' 个文件合并冲突，需要手动解决冲突\', \'冲突的文件：<br>\'+files.join(\'<br>\'));';
          html +=   '} else {';
          html +=     'this.showError(err.message.replace(/(?:\\r\\n|\\r|\\n)/g, \'<br/>\'));';
          html +=   '}';
          html += '});';
          html += '},';
          html += 'drop(index) {';
          html += 'if(window.confirm(\'确认删除该储藏？\')){';
          html +=   'window.gitAPI.stash.drop(Alpine.store(\'projectPath\').path, \'stash@{\'+index+\'}\').then(() => {';
          html +=     'this.remove(index);';
          html +=     'this.refresh(() => showSuccess(\'已成功删除该储藏\'));';
          html +=   '}).catch(err => {';
          html +=     'showError(err.message.replace(/(?:\\r\\n|\\r|\\n)/g, \'<br/>\'));';
          html +=   '});';
          html += '}';
          html += '},';
          html += 'remove(index) {';
          html += 'return this.list.splice(index, 1);';
          html += '},';
          html += 'getConflictFiles(errMsg) {';
          html +=   'const files = new Set();';
          html +=   'const lines = errMsg.split(\'\\n\');';
          html +=   'for (const line of lines) {';
          html +=     'const conflictMatch = line.match(/CONFLICT[^:]*:[^in]*in\\s+(\\S+)/i);';
          html +=     'if (conflictMatch && conflictMatch[1]) {';
          html +=       'files.add(conflictMatch[1]);';
          html +=       'continue;';
          html +=     '}';
          html +=     'const bothMatch = line.match(/both\\s+\\w+:\\s+(\\S+)/i);';
          html +=     'if (bothMatch && bothMatch[1]) {';
          html +=       'files.add(bothMatch[1]);';
          html +=     '}';
          html +=   '}';
          html +=   'return Array.from(files);';
          html += '}';
          html += '}"';
          html += '>';
          html += '<thead><tr><th></th><th>Author</th><th>Message</th><th>Date</th><th></th></tr></thead>';
          html += '<tbody>';
          html += '<template x-for="(item, index) in list" :key="item.hash">';
            html += '<tr>';
            html += '<td x-text="index"></td>';
            html += '<td><span x-text="item.author_name"></span><br><span x-text="item.author_email"></span></td>';
            html += '<td x-text="item.message"></td>';
            html += '<td x-html="item.date.replace(\'T\', \'<br>\')"></td>';
            html += '<td class="flex flex-wrap items-center justify-center gap-1">';
            html +=   '<button class="btn whitespace-nowrap btn-xs" x-on:click="pop.bind($data, index)">应用并删除</button>';
            html +=   '<button class="btn whitespace-nowrap btn-xs" x-on:click="drop.bind($data, index)">直接删除</button>';
            html += '</td>';
            html += '</tr>';
          html += '</template>';
          html += '</tbody>';
          html += '</table>';
        } else {
          html += '<div class="text-center">此存储库没有储藏条目</div>';
        }
        this.openDialog('储藏列表', html);
      })
      .catch(error => this.showError(error.message.replace(/(?:\r\n|\r|\n)/g, '<br/>')))
      .finally(() => disableBody(false));
  },

  showLogHistories() {
    if (this.isLoadingLogs) return;

    this.isLoadingLogs = true;
    window.gitAPI.showLogHistories(Alpine.store('projectPath').path, Alpine.store('projectPath').currentBranch)
    .catch(error => this.showError(error.message.replace(/(?:\r\n|\r|\n)/g, '<br/>')))
    .finally(() => this.isLoadingLogs = false);
  },

  async _commit(files, message, isPush) {
    const projectPath = Alpine.store('projectPath').path;
    Alpine.store('statusBar').setStatusText('拉取最新代码...');

    //失败无回滚
    /*let result = window.gitAPI.pull(projectPath)//先拉取
      .then((result) => {
        Alpine.store('statusBar').setStatusText('正在添加需要提交的文件..');
        return window.gitAPI.add(projectPath, files);
      })//再添加
      .then((result) => {
        Alpine.store('statusBar').setStatusText('正在提交代码...');
        return window.gitAPI.commit(projectPath, message);
      });//然后提交

      if(isPush){
        return result.then((result) => {
          Alpine.store('statusBar').setStatusText('正在推送代码...');
          return window.gitAPI.push(projectPath);
        });//最后推送
      }
      return result;*/

    //失败有回滚
    let state = {added: false, committed: false};

    try {
      await window.gitAPI.pull({baseDir: projectPath, progress: 'git:progress'});//先拉取

      // 第一步：添加文件
      Alpine.store('statusBar').setStatusText('正在添加需要提交的文件..');
      await window.gitAPI.add(projectPath, files);
      state.added = true; // 标记已添加

      // 第二步：提交
      Alpine.store('statusBar').setStatusText('正在提交代码...');
      const commitResult = await window.gitAPI.commit(projectPath, message);
      state.committed = true; // 标记已提交

      // 第三步：推送
      if(isPush){
        Alpine.store('statusBar').setStatusText('正在推送代码...');
        const pushResult = await window.gitAPI.push(projectPath);
        this.canPush = false;
        return pushResult;
      }

      this.canPush = true;
      return commitResult;
    } catch (error) {
      // 错误处理（根据失败阶段精准回滚）
      if (state.committed) {
        // 第三步失败：已提交但推送失败 → 撤销提交和添加
        Alpine.store('statusBar').setStatusText('推送失败，开始回滚提交和暂存');
        await window.gitAPI.reset(projectPath, ['HEAD~1', '--mixed']); // 撤销提交（保留修改到工作区）
        await window.gitAPI.reset(projectPath, ['HEAD', '--', ...files]); // 取消暂存
      } else if (state.added) {
        // 第二步失败：已添加但提交失败 → 仅取消暂存
        Alpine.store('statusBar').setStatusText('提交失败，取消暂存');
        await window.gitAPI.reset(projectPath, ['HEAD', '--', ...files]);
      }

      throw error;
    }
  }
}));
