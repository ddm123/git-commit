document.addEventListener('alpine:init', () => {
  Alpine.data('gitDiff', () => ({
    file: '',
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
          } else if (!prevChunk || !prevChunk.removed) {
            result.oldFile.push({ line: '', code: '', change: 'none' });
          }
          if (!chunk.removed) {
            newLine++;
            result.newFile.push({ line: newLine, code: chunk.value[i], change: chunk.added ? '+' : '' });
          } else {
            result.newFile.push({ line: '', code: '', change: 'none' });
          }
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
    }
  }));
});
