document.addEventListener('alpine:init', () => {
  Alpine.data('gitDiff', () => ({
    file: '',
    oldLine: '',
    newLine: '',
    diffChunks: { oldFile: [], newFile: [] },

    init() {
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          window.close();
        }
      });
      window.electronAPI.receive('show-diff-chunks', (event, file, diffChunks) => {
        this.file = file;
        ({ oldFile: this.diffChunks.oldFile, newFile: this.diffChunks.newFile } = this.parseDiffChunks(diffChunks));
      });
    },

    parseDiffChunks(diffChunks) {
      const result = {oldFile: [], newFile: []};
      let oldLine = 0;
      let newLine = 0;
      let prevChunk = null;

      for (const chunk of diffChunks) {
        chunk.value = chunk.value.split(/\r?\n/);

        if (chunk.added && prevChunk && prevChunk.removed) {
          result.newFile.splice(-prevChunk.count);
        }

        for (let i = 0; i < chunk.count; i++) {
          if (!chunk.added) {
            oldLine++;
            result.oldFile.push({ line: oldLine, code: chunk.value[i], change: chunk.removed ? '-' : ''});
          } else {
            result.oldFile.push({ line: '', code: '', change: 'none' });
          }
          if (!chunk.removed) {
            newLine++;
            result.newFile.push({ line: newLine, code: chunk.value[i], change: chunk.added ? '+' : '' });
          } else {
            result.newFile.push({ line: '', code: '', change: 'none' });
          }
        }

        if (chunk.added && prevChunk && prevChunk.removed) {
          result.oldFile.splice(-prevChunk.count);
        }

        prevChunk = chunk.added || chunk.removed ? chunk : null;
      }
      return result;
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

    previewLine(event, type, index) {
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
    },

    encodedHtml(text) {
      return text ? text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') : text;
    }
  }));
});
