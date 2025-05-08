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

    getLine(code, change, line, elm) {
      let el = elm.previousElementSibling;
      while(el){
        if(el.classList.contains('bg-red-200')){
          line--;
        }
        el = el.previousElementSibling;
      }
      return change.newStart + line;
    },

    getClass(code) {
      if(code.startsWith('-')){
        return 'bg-red-200 text-red-500';
      }
      if(code.startsWith('+')){
        return 'bg-green-200 text-green-600';
      }
      return '';
    }
  }));
});
