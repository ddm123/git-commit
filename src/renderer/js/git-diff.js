document.addEventListener('alpine:init', () => {
  Alpine.data('gitDiff', () => ({
    file: '',
    oldFile: null,
    isImage: false,
    oldLine: '',
    newLine: '',
    diffChunks: { oldFile: [], newFile: [] },
    lineNumberTooltip: {line: 0, x: 0, y: 0},

    init() {
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          window.electronAPI.closeWindow();
        } else if (e.key === 'F12' && window.electronAPI.isDevelopment()) {
          window.electronAPI.toggleDevTools();
        }
      });
      window.electronAPI.receive('show-diff-chunks', (event, file, diffChunks) => {
        const diff2htmlUi = new Diff2HtmlUI(this.$refs.diffContainer, diffChunks, {
          drawFileList: true,
          matching: 'lines',
          highlight: true,
          outputFormat: 'side-by-side'
        });
        diff2htmlUi.draw();
        diff2htmlUi.highlightCode();
        this.renderImage();
      });
    },

    parseDiffChunks(diffChunks) {
      const result = {oldFile: [], newFile: []};
      let oldLine = 0;
      let newLine = 0;
      let oldFileKey = 0;
      let newFileKey = 0;

      let index = 0;
      let chunkCount = diffChunks.length;
      for (; index < chunkCount; index++) {
        const chunk = diffChunks[index];
        chunk.value = chunk.value.split(/\r?\n/);

        if (!chunk.added && !chunk.removed) {
          for (let i = 0; i < chunk.count; i++) {
            result.oldFile.push({ key: ++oldFileKey, line: ++oldLine, code: chunk.value[i], change: '' });
            result.newFile.push({ key: ++newFileKey, line: ++newLine, code: chunk.value[i], change: '' });
          }
        } else if (chunk.removed) {
          const nextChunk = diffChunks[index + 1] ?? null;
          let count = chunk.count;

          if (nextChunk && nextChunk.added) {
            nextChunk.value = nextChunk.value.split(/\r?\n/);
            count = Math.max(chunk.count, nextChunk.count);
            index++;
          }
          for (let i = 0; i < count; i++) {
            result.oldFile.push(
              i < chunk.count
              ? { key: ++oldFileKey, line: ++oldLine, code: chunk.value[i], change: '-' }
              : { key: ++oldFileKey, line: '', code: '', change: 'none' }
            );
            result.newFile.push(
              nextChunk && nextChunk.added && i < nextChunk.count
              ? { key: ++newFileKey, line: ++newLine, code: nextChunk.value[i], change: '+' }
              : { key: ++newFileKey, line: '', code: '', change: 'none' }
            );
          }
        } else if (chunk.added) {
          for (let i = 0; i < chunk.count; i++) {
            result.oldFile.push({ key: ++oldFileKey, line: '', code: '', change: 'none' });
            result.newFile.push({ key: ++newFileKey, line: ++newLine, code: chunk.value[i], change: '+' });
          }
        }
      }
      return result;
    },

    renderFileCode(oldCode, newCode, start) {
      const limit = 20;
      const oldCodeLength = oldCode.length;
      const newCodeLength = newCode.length;
      const maxLength = Math.max(oldCodeLength, newCodeLength);

      let index = null;
      for (let i = 0; i < limit && index < maxLength; i++) {
        index = start + i;
        if (index < oldCodeLength) {
          this.diffChunks.oldFile.push(oldCode[index]);
        }
        if (index < newCodeLength) {
          this.diffChunks.newFile.push(newCode[index]);
        }
      }

      if (index && (++index < oldCodeLength || index < newCodeLength)) {
        window.requestAnimationFrame(() => this.renderFileCode(oldCode, newCode, index));
      }
    },

    getClass(change) {
      if(change.change==='-'){
        return 'bg-red-200 text-red-500';
      }
      if(change.change==='+'){
        return 'bg-green-200 text-green-600';
      }
      if(change.change==='none'){
        return 'bg-checkered';
      }
      return '';
    },

    scrollIntoView(event, row, index) {
      this.previewLine(event, row.change==='none' ? 'new' : 'old', index, false);

      const selectors = row.change==='none'
        ? '.diff-preview table tr td:last-child pre:nth-child(' + (index + 2) + ')'
        : '.diff-preview table tr td:first-child pre:nth-child(' + (index + 2) + ')';
      const lineElement = document.querySelector(selectors);
      const activeElement = document.querySelector('.diff-preview pre.active');

      if (activeElement) {
        activeElement.classList.remove('active');
      }
      if (lineElement) {
        lineElement.scrollIntoView({
          behavior: 'instant', // 滚动是立即的还是平滑的动画。smooth：滚动应该是平滑的动画。instant：滚动应该通过一次跳跃立刻发生。auto：滚动行为由 scroll-behavior 的计算值决定。
          block: 'center',
          inline: 'start'
        });
        lineElement.classList.add('active');
      }
    },

    showLineNumber(event) {
      if (!event.target.hasAttribute('data-key')) {
        return;
      }

      const index = parseInt(event.target.getAttribute('data-key'), 10);
      if (isNaN(index) || typeof this.diffChunks.oldFile[index] === 'undefined') {
        return;
      }
      this.lineNumberTooltip.line = this.diffChunks.oldFile[index].line || this.diffChunks.newFile[index].line;

      this.$nextTick(() => {
        this.$refs.lineNumberTooltip.style.removeProperty('display');
        const rect = event.target.getBoundingClientRect();
        const tipRect = this.$refs.lineNumberTooltip.getBoundingClientRect();
        this.lineNumberTooltip.x = rect.right + 8;
        this.lineNumberTooltip.y = rect.top + (rect.height - tipRect.height) / 2;
      });
    },

    hideLineNumber(event) {
      this.$refs.lineNumberTooltip.style.setProperty('display', 'none');
    },

    previewLine(event, type, index, setMarker = true) {
      let oldLine = typeof this.diffChunks.oldFile[index] !== 'undefined' ? this.diffChunks.oldFile[index].code : '';
      let newLine = typeof this.diffChunks.newFile[index] !== 'undefined' ? this.diffChunks.newFile[index].code : '';
      let oldLine2 = '';
      let newLine2 = '';

      if (oldLine!==newLine) {
        if (oldLine !== '' && newLine !== '') {
          for (const part of window.electronAPI.diffChars(oldLine, newLine)) {
            if (part.added) {
              newLine2 += `<span class="bg-green-300 text-green-800">${this.encodedHtml(part.value)}</span>`;
            } else if (part.removed) {
              oldLine2 += `<span class="bg-red-300 text-red-800">${this.encodedHtml(part.value)}</span>`;
            } else {
              oldLine2 += this.encodedHtml(part.value);
              newLine2 += this.encodedHtml(part.value);
            }
          }
        } else if (oldLine === '') {
          newLine2 = `<span class="bg-green-300 text-green-800">${this.encodedHtml(newLine)}</span>`;
        } else if (newLine === '') {
          oldLine2 = `<span class="bg-red-300 text-red-800">${this.encodedHtml(oldLine)}</span>`;
        }
      }

      this.oldLine = oldLine2==='' ? this.encodedHtml(oldLine) : oldLine2;
      this.newLine = newLine2==='' ? this.encodedHtml(newLine) : newLine2;

      if (setMarker) {
        const selectors = type === 'new'
          ? '.diff-preview table tr td:last-child pre:nth-child(' + (index + 2) + ')'
          : '.diff-preview table tr td:first-child pre:nth-child(' + (index + 2) + ')';
        const lineElement = document.querySelector(selectors);
        const activeElement = document.querySelector('.diff-preview pre.active');

        if (activeElement) {
          activeElement.classList.remove('active');
        }
        if (lineElement) {
          lineElement.classList.add('active');
        }
      }
    },

    renderImage() {
      const projectPath = window.electronAPI.getArgument('project-path');
      const c = [];
      const elms = this.$refs.diffContainer.querySelectorAll('.d2h-files-diff .d2h-file-side-diff .d2h-code-side-line');
      const len = elms.length;

      for (let i = 0; i < len; i++) {
        if (elms[i].textContent === 'Binary file') {
          c.push({
            "left": elms[i],
            "right": elms[i + 1],
            "file": elms[i].closest('.d2h-files-diff')?.previousElementSibling?.querySelector('.d2h-file-name')?.textContent?.trim()
          });
          i++;
        }
      }

      c.forEach(elm => {
        let ext;
        if (elm.file && (ext = this.isImageFile(elm.file))) {
          window.electronAPI.getHeadFileBase64(projectPath, elm.file).then(base64 => {
            elm.left.innerHTML = `<img src="data:image/${ext};base64,${base64}" alt="" class="max-w-full"/>`;
            if (elm.right) {
              elm.right.innerHTML = '<img src="'+this.getImageSrc(elm.file)+'" alt="" class="max-w-full">';
            }
          })
          .catch(err => {
            console.error(err);
          });
        }
      });
    },

    encodedHtml(text) {
      return text ? text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') : text;
    },

    isImageFile(filePath) {
      const lastDotIndex = filePath.lastIndexOf('.');
      const ext = lastDotIndex === -1 ? '' : filePath.substring(lastDotIndex + 1).toLowerCase();
      return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'ico'].includes(ext) ? ext : false;
    },

    getImageSrc(file) {
      let absPath = window.electronAPI.getArgument('project-path') + '/' + file;
      return 'file://' + absPath.replaceAll('..', '').replace(/(?:\\|\/)+/g, '/');
    }
  }));
});
