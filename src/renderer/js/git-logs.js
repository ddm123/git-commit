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
    highlightCss: 'bg-secondary text-secondary-content',
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
          this.logs = logs;
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

      this.$watch('currentLog', (log, oldLog) => {
        if (log && (!oldLog || log.hash !== oldLog.hash)) this.fetchLogFiles(log);
      });
    },

    fetchLogs(options, limit, page = 1) {
      if(!options || !Array.isArray(options)) {
        options = [];
      }

      const TZOffset = this.filter.end || this.filter.begin ? this.timezoneOffset() : '';
      if (this.filter.end) {
        options.push("--until=" + this.filter.end + "T23:59:59" + TZOffset);
      }
      if (this.filter.begin) {
        options.push("--since=" + this.filter.begin + "T00:00:00" + TZOffset);
      }
      if (limit !== undefined) {
        options.push('--max-count=' + limit);
        this.logsMaxCount = limit;
      } else {
        options.push('--max-count=' + this.logsMaxCount);
      }
      if (page !== undefined && page > 1) {
        options.push('--skip=' + ((page - 1) * limit));
      }
      if (this.filter.text) {
        switch (this.filter.action) {
          case 'name':
            options.push("--author=" + this.filter.text, "-i");
            break;
          case 'message':
            options.push("--grep=" + this.filter.text, "-i");
            break;
          case 'file':
            options.push('--', "*" + this.filter.text.replaceAll("'", "\\'") + "*");
            break;
        }
      }
      if ((this.filter.action !== 'file' || !this.filter.text) && this.currentFile) {
        options.push('--', this.currentFile);
      }

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

      return this.fetchLogs(options).then(logs => {
        this.logs = logs;
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

    clearSearch(event, btn) {
      let input = btn.previousElementSibling;
      if (input && input.getAttribute('x-model') !== "filter.text") input = null;
      if (this.filter.text) {
        this.filter.text = '';
        this.search(event).then(() => input && input.focus());
      } else if (input) {
        input.focus();
      }
    },

    fetchNextLogs() {
      if (this.isLoadingLogs || this.isEndLogs) return;

      this.isLoadingLogs = true;
      this.fetchLogs(null, this.logsMaxCount, this.logPage + 1)
        .then(logs => {
          if (logs.length) {
            this.logs.push(...logs);
          }
          if (logs.length < this.logsMaxCount) {
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

    fetchLogFiles(log) {
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
                row.fileFormatted = this.highlightText(row.fileFormatted ?? row.file, this.filter.text, true);
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
                row.fileFormatted = this.highlightText(row.fileFormatted ?? row.file, this.filter.text, true);
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

    timezoneOffset() {
      const o1 = new Date().getTimezoneOffset();
      const o2 = Math.abs(o1);
      return (o1 > 0 ? '-' : '+') + String(Math.floor(o2 / 60)).padStart(2, '0') + ':' + String(o2 % 60).padStart(2, '0');
    },

    generateGraphSVG(graphStr) {
      const width = 28;
      const height = 28;
      const radius = 4;
      const startX = 5;
      const startY = -1;
      const corlor = '#e80a0a';
      const lineWidth = 1;

      const lines = graphStr.replaceAll('|\\', '^').replaceAll('|/', 'v').split('\n');
      const lineCount = lines.length;
      if (lineCount === 0) return '';

      let svgContent = '';

      for (let rowIdx = 0; rowIdx < lineCount; rowIdx++) {
        const line = lines[rowIdx];
        const chars = line.split('');

        chars.forEach((char, col) => {
          const x = col * startX + startX;

          switch (char) {
            case '|':
              svgContent += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${height + 1}" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
              break;
            case 'v':
              svgContent += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${height + 1}" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
              svgContent += `<path d="M${x},${height / 2} C${x + startX*2 - 2},${height / 2} ${x + startX*2},${height / 2 - 2} ${x + startX*2},${height / 2 - 4} L${x + startX*2},${startY}" fill="none" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
              break;
            case '^':
              svgContent += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${height + 1}" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
              svgContent += `<path d="M${x},${height / 2} C${x + startX*2 - 2},${height / 2} ${x + startX*2},${height / 2 + 2} ${x + startX*2},${height / 2 + 4} L${x + startX*2},${height + 1}" fill="none" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
              break;
            case '*':
              svgContent += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${height + 1}" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
              svgContent += `<circle cx="${x}" cy="${height / 2}" r="${radius}" fill="${corlor}"/>`;
              break;
          }
        });
      };

      return `<svg title="${graphStr}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="auto">${svgContent}</svg>`;
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

    formatSubject(log) {
      let str = log.subject || log.body;
      if (str.length > 50) {
        str = str.substring(0, 50) + '...';
      }
      if (this.filter.text && this.filter.action === 'message') {
        str = this.highlightText(str, this.filter.text, true);
      } else {
        str = htmlspecialchars(str);
      }
      return str;
    },

    formatAuthor(log, highlight) {
      let str = '';
      if (log.author_name && log.author_email) {
        str = `${log.author_name} <${log.author_email}>`;
      } else if (log.author_name) {
        str = log.author_name;
      } else if (log.author_email) {
        str = log.author_email;
      }
      if (highlight) {
        if (this.filter.text && this.filter.action === 'name') {
          str = this.highlightText(str, this.filter.text, true);
        } else {
          str = htmlspecialchars(str);
        }
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

    escapeRegExp(str) {
      return str.replace(/[\.\*\+\?\^\$\{\}\(\)\|\[\]\\]/g, '\\$&');
    },

    highlightText(str, text, escape = true) {
      if (escape) {
        str = htmlspecialchars(str.replace(new RegExp(this.escapeRegExp(text), 'gi'), '[{highlight}]$&[{/highlight}]'));
        str = str.replaceAll('[{highlight}]', '<span class="'+this.highlightCss+'">').replaceAll('[{/highlight}]', '</span>');
      } else {
        str = str.replace(new RegExp(this.escapeRegExp(text), 'gi'), '<span class="'+this.highlightCss+'">$&</span>');
      }
      return str;
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
