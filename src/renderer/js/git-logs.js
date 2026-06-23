document.addEventListener('alpine:init', () => {
  Alpine.data('gitLogHistory', () => ({
    projectPath: '',
    branch: '',
    filter: {action: 'message', text: ''},
    logs: [],
    logFiles: [],
    currentLog: null,
    currentFile: null,
    lastLog: null,
    logPage: 1,
    isEndLogs: false,
    logsMaxCount: 50,
    selectedLog: '',
    intersectionObserver: null,
    isLoadingLogs: false,
    _rafId: null,

    init() {
      this.projectPath = window.electronAPI.getArgument('project-path');

      window.addEventListener('keydown', function (e) {
        if (e.key === 'F12' && window.electronAPI.isDevelopment()) {
          window.electronAPI.toggleDevTools();
        }
      });
      window.electronAPI.receive('show-log-histories', (event, projectPath, branch, options, file) => {
        this.projectPath = projectPath;
        this.branch = branch;
        this.currentFile = file;
        this.fetchLogs(options).then(logs => {
          this.logs = logs.all ?? [];
          if (this.logs.length > 0) {
            this.selectedLog = this.logs[0].hash;
            this.currentLog = this.logs[0];
            this.lastLog = this.logs[this.logs.length - 1];

            this.$nextTick(() => this.triggerNextPage());
          }
        })
        .catch(error => {
          showError(error.message);
        });
      });

      this.intersectionObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.fetchNextLogs();
            break;
          }
        }
      }, { threshold: 0.5, root: this.$refs.logsContainer });

      this.$watch('currentLog', log => {
        if (log) this.fetchLogFiles(log);
      });
    },

    fetchLogs(options, limit, page = 1) {
      if(!options || Object.prototype.toString.call(options) !== '[object Object]') {
        options = {};
      }
      if (this.currentFile) {
        options.file = this.currentFile;
      }
      if (this.filter.text) {
        switch (this.filter.action) {
          case 'name':
            options['--author'] = this.filter.text;
            break;
          case 'message':
            options['--grep'] = this.filter.text;
            break;
          case 'file':
            options['file'] = '*' + this.filter.text + '*';
            break;
        }
      }
      if (this.filter.end) {
        options['--before'] = this.filter.end;
      }
      if (this.filter.begin) {
        options['--after'] = this.filter.begin;
      }
      if (limit !== undefined) options.maxCount = limit;
      if (page !== undefined && page > 1) {
        options['--skip'] = (page - 1) * limit;
      }
      if (options.maxCount) {
        this.logsMaxCount = options.maxCount;
      } else {
        options.maxCount = this.logsMaxCount;
      }

      options.multiLine ??= true;
      options.strictDate ??= true;
      //options['--graph'] = null;

      return window.electronAPI.logs(this.projectPath, options);
    },

    search(event) {
      disableBody(true);
      if (this.lastLog && document.getElementById(this.lastLog.hash)) {
        this.intersectionObserver.unobserve(document.getElementById(this.lastLog.hash));
      }
      this.currentLog = null;
      this.lastLog = null;
      this.logs = [];
      this.logFiles = [];
      this.logPage = 1;
      this.isEndLogs = false;
      const options = {};

      this.fetchLogs(options).then(logs => {
        this.logs = logs.all ?? [];
        if (this.logs.length > 0) {
          this.selectedLog = this.logs[0].hash;
          this.currentLog = this.logs[0];
          this.lastLog = this.logs[this.logs.length - 1];

          this.$nextTick(() => this.triggerNextPage());
        }
      })
      .catch(error => {
        showError(error.message);
      })
      .finally(() => {
        disableBody(false);
      });
    },

    fetchNextLogs() {
      if (this.isLoadingLogs || this.isEndLogs) return;

      this.isLoadingLogs = true;
      this.fetchLogs(null, this.logsMaxCount, this.logPage + 1)
        .then(logs => {
          logs.all ??= [];
          this.logs.push(...logs.all);
          if (logs.all.length < this.logsMaxCount) {
            this.isEndLogs = true;
          }
          this.logPage += 1;

          if (this.lastLog && document.getElementById(this.lastLog.hash)) {
            this.intersectionObserver.unobserve(document.getElementById(this.lastLog.hash));
          }
          this.lastLog = this.logs[this.logs.length - 1];
          this.$nextTick(() => this.triggerNextPage());
        })
        .catch(error => {
          showError(error.message);
        })
        .finally(() => {
          this.isLoadingLogs = false;
        });
    },

    triggerNextPage() {
      if (!this.isEndLogs && this.logs.length < this.logsMaxCount) {
        this.isEndLogs = true;
      }
      if (!this.isEndLogs && this.$refs.logsContainer.scrollHeight > this.$refs.logsContainer.clientHeight) {
        this.intersectionObserver.observe(document.getElementById(this.lastLog.hash));
      }
    },

    fetchLogFiles(log) {console.log(log);
      this.logFiles = [];
      const keyMap = new Map();
      const files = [];

      if (this._rafId!==null) {
        window.cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }

      return Promise.allSettled([
        window.electronAPI.gitShow(this.projectPath, ['--numstat', '--format=', log.hash]),
        window.electronAPI.gitShow(this.projectPath, ['--name-status', '--format=', log.hash])
      ])
      .then(results => {
        if (results[0].status === 'fulfilled') {
          if (results[0].value) {
            results[0].value.trim()
            .split('\n')
            .map(line => {
              const [add, del, ...fileParts] = line.split('\t');
              if (!fileParts) return null;
              const row = {
                file: fileParts.join('\t'), // 处理文件名中可能包含的 tab
                add: add === '-' ? 0 : add,   // 二进制文件显示为 "-"
                delete: del === '-' ? 0 : del,
                hash: log.hash
              };
              const fileMatch = row.file.match(/^(.+?)\{([^\}]+?)\s*=>\s*([^\}]+?)\}(.*)$/);
              if (fileMatch) {
                row.file = fileMatch[1] + fileMatch[3] + fileMatch[4];
                row.oldFile = fileMatch[1] + fileMatch[2] + fileMatch[4];
                row.fileFormatted = fileMatch[0];
              }
              if (this.filter.action === 'file' && this.filter.text) {
                const kw = htmlspecialchars(this.filter.text);
                row.fileFormatted = htmlspecialchars(row.fileFormatted ?? row.file).replaceAll(kw, `<span class="bg-secondary text-secondary-content">${kw}</span>`);
              } else if (row.fileFormatted) {
                row.fileFormatted = htmlspecialchars(row.fileFormatted);
              }
              if (keyMap.has(row.file)) {
                const key = keyMap.get(row.file);
                files[key] = Object.assign(files[key], row);
              } else {
                keyMap.set(row.file, files.length);
                files.push(row);
              }
              return row;
            });
          }
        } else {
          showError(results[0].reason instanceof Error ? results[0].reason.message : results[0].reason);
        }
        if (results[1].status === 'fulfilled') {
          if (results[1].value) {
            results[1].value.trim()
            .split('\n')
            .map(line => {
              const [status, ...fileParts] = line.split('\t');
              if (!fileParts) return null;
              const row = {
                file: fileParts.join('\t'), // 处理文件名中可能包含的 tab
                status,
                hash: log.hash
              };
              if (status.startsWith('R') && fileParts.length > 1) {
                row.status = 'R';
                row.oldFile = fileParts[0];
                row.file = fileParts[1];
                row.fileFormatted = fileParts[0] + ' => ' + fileParts[1];
              }
              if (this.filter.action === 'file' && this.filter.text) {
                const kw = htmlspecialchars(this.filter.text);
                row.fileFormatted = htmlspecialchars(row.fileFormatted ?? row.file).replaceAll(kw, `<span class="bg-secondary text-secondary-content">${kw}</span>`);
              } else if (row.fileFormatted) {
                row.fileFormatted = htmlspecialchars(row.fileFormatted);
              }
              if (keyMap.has(row.file)) {
                const key = keyMap.get(row.file);
                if (files[key].fileFormatted) row.fileFormatted = files[key].fileFormatted;
                files[key] = Object.assign(files[key], row);
              } else {
                keyMap.set(row.file, files.length);
                files.push(row);
              }
              return row;
            });
          }
        } else {
          showError(results[1].reason instanceof Error ? results[1].reason.message : results[1].reason);
        }

        this.renderFiles(files);
      });
    },

    renderFiles(files, start = 0) {
      return new Promise((resolve, reject) => {
        const limit = 10;
        const fileCount = files.length;
        if (fileCount === 0) return resolve(true);

        this._rafId = window.requestAnimationFrame(() => {
          let index = null;
          for (let i = 0; i < limit && index < fileCount; i++) {
            index = start + i;
            if (index < fileCount) {
              this.logFiles.push(files[index]);
            }
          }
          if (index && (++index < fileCount)) {
            this.renderFiles(files, index).then(() => resolve(true)).catch(err => reject(err));
          } else {
            resolve(true);
          }
        });
      });
    },

    showDiff(file) {
      if(isDisabledBody()) return;

      if (file.status !== 'M') {
        showError('当前文件不是修改状态，无法查看差异');
        return;
      }

      disableBody(true);
      window.electronAPI.gitShow(this.projectPath, [file.hash, '--unified=50', '--format=', '--', file.file])
        .then(result => window.electronAPI.showDiff(this.projectPath, file.file, result))
        .catch(error => showError(error.message.replace(/(?:\r\n|\r|\n)/g, '<br/>')))
        .finally(() => disableBody(false));
    },

    formatDateTime(date) {
      return new Date(date).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    },

    formatAuthor(log) {
      let str = '';
      if (log.author_name && log.author_email) {
        str = `${log.author_name} <${log.author_email}>`;
      } else if (log.author_name) {
        str = log.author_name;
      } else if (log.author_email) {
        str = log.author_email;
      }
      return str;
    },

    formatRefs(refs) {
      if (!refs) return '';
      let html = '';
      for (const ref of refs.split(', ')) {
        if (ref.startsWith('HEAD -> ')) {
          html += `<span class="badge badge-xs badge-success base-100">${ref.replace('HEAD -> ', '')}</span>`;
        } else if (ref.startsWith('tag: ')) {
          html += `<span class="badge badge-xs badge-warning base-100">${ref}</span>`;
        } else {
          html += `<span class="badge badge-xs badge-info base-100">${ref}</span>`;
        }
      }
      return html;
    },

    clickLogRow(event, tr, log) {
      tr.querySelector('input[type="radio"][name="__log"]').click();
      this.currentLog = log;
    },

    rowClass(file) {
      let cls = '';
      switch (file.status) {
        case 'M':
          cls = 'modified';
          break;
        case 'A':case 'R':
          cls = 'untracked';
          break;
        case 'D':
          cls = 'deleted';
          break;
      }
      if (this.currentFile && this.currentFile === file.file) {
        cls += cls === '' ? 'active' : ' active';
      }
      return cls;
    }
  }));
});
