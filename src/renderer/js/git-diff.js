document.addEventListener('alpine:init', () => {
  Alpine.data('gitDiff', () => ({
    file: '',
    diffChunks: [],

    init() {
      window.electronAPI.receive('show-diff-chunks', (event, file, diffChunks) => {
        this.file = file;
        this.diffChunks = diffChunks;
      });
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
