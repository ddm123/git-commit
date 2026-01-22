document.addEventListener('alpine:init', () => {
  Alpine.data('gitDiff', () => ({
    projectPath: '',
    file: '',
    oldFile: null,
    isImage: false,
    oldLine: '',
    newLine: '',
    diffChunks: { oldFile: [], newFile: [] },
    lineNumberTooltip: {line: 0, x: 0, y: 0},

    init() {
      this.projectPath = window.electronAPI.getArgument('project-path');

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
          matching: 'words', // matching level: 'lines' for matching lines, 'words' for matching lines and words or 'none', default is none
          diffStyle: 'word', // 'word' or 'char', default is 'word'
          highlight: true,
          outputFormat: 'side-by-side'
        });
        diff2htmlUi.draw();
        diff2htmlUi.highlightCode();

        const imgCount = this.renderImage().length;
        if (!imgCount && file.length===1) { // 如果没有图片并且是只查看一个文件
          setTimeout(() => this.showDiffPosition(), 200);
        }
      });
    },

    renderImage() {
      const c = [];
      const elms = this.$refs.diffContainer.querySelectorAll('.d2h-files-diff .d2h-file-side-diff .d2h-code-side-line');
      const len = elms.length;

      for (let i = 0; i < len; i++) {
        if (elms[i].textContent === 'Binary file') {
          this.markAsBinaryFile([elms[i], elms[i + 1]]);

          c.push({
            "left": elms[i],
            "right": elms[i + 1],
            "file": elms[i].closest('.d2h-files-diff')?.previousElementSibling?.querySelector('.d2h-file-name')?.textContent?.trim()
          });
          i++;
        }
      }

      this.setImageHtml(c);
      return c;
    },

    showDiffPosition() {
      const td = this.$refs.diffContainer.querySelector('td.d2h-del, td.d2h-emptyplaceholder');
      if (td) {
        td.scrollIntoView({
          behavior: 'smooth', // 滚动是立即的还是平滑的动画。smooth：滚动应该是平滑的动画。instant：滚动应该通过一次跳跃立刻发生。auto：滚动行为由 scroll-behavior 的计算值决定。
          block: 'center',
          inline: 'start'
        });
      }
    },

    setImageHtml(elms) {
      elms.forEach(elm => {
        let mimeType;
        if (elm.file && (mimeType = this.getImageMime(elm.file))) {
          window.electronAPI.getHeadFileBase64(this.projectPath, elm.file).then(base64 => {
            elm.left.innerHTML = `<img src="data:${mimeType};base64,${base64}" alt="" class="max-w-full"/>`;
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

    markAsBinaryFile(elms) {
      for (const elm of elms) {
        if (elm) {
          const td = elm.tagName.toLowerCase()==='td' ? elm : elm.closest('td');
          const numTd = td.previousElementSibling;
          td.classList.remove('d2h-info');
          td.classList.add('d2h-cntx', 'binary-file');
          if (numTd) {
            numTd.classList.remove('d2h-info');
            numTd.classList.add('d2h-cntx', 'binary-file');
          }
        }
      }
    },

    isImageFile(filePath) {
      const lastDotIndex = filePath.lastIndexOf('.');
      const ext = lastDotIndex === -1 ? '' : filePath.substring(lastDotIndex + 1).toLowerCase();
      return [
        'png', 'jpg', 'gif', 'bmp', 'tif', 'ico',
        'jpeg', 'tiff', 'webp', 'apng', 'avif'
      ].includes(ext) ? ext : false;
    },

    getImageSrc(file) {
      let absPath = this.projectPath + '/' + file;
      return 'file://' + absPath.replaceAll('..', '').replace(/(?:\\|\/)+/g, '/');
    },

    getImageMime(file) {
      const ext = this.isImageFile(file);

      if (!ext) return ext;
      if (ext === 'jpg') return 'image/jpeg';
      if (ext === 'ico') return 'image/vnd.microsoft.icon';
      if (ext === 'tif') return 'image/tiff';

      return 'image/' + ext;
    }
  }));
});
