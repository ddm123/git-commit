document.addEventListener('alpine:init', () => {
  Alpine.data('manageProjects', () => ({
    projectPaths: [],
    incrementId: 0,

    init() {
      window.electronAPI.receive('project.paths', (event, paths) => {
        this.addPath(...paths);
      });
      window.electronAPI.receive('parentWin.closed', () => {
        window.close();
      });
      window.addEventListener('beforeunload', () => {
        window.electronAPI.send('manage-projects.closed', ...this.projectPaths.map(item => item.path));
      });
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          window.close();
        }
      });
    },

    addPath(...path) {
      for (const p of path) {
        if (!this.projectPaths.some(item => item.path === p)) {
          this.projectPaths.push({ id: ++this.incrementId, path: p });
        }
      }
      return this;
    },

    removePath(id) {
      const index = this.projectPaths.findIndex(item => item.id == id);
      if (index >= 0) {
        this.projectPaths.splice(index, 1);
      }
      return this;
    },

    selectProjectPath(event) {
      window.electronAPI.openDirectory().then(result => {
        if (result) {
          this.addPath(result);
        }
      });
    },

    onSort(id, position) {
      const index = this.projectPaths.findIndex(item => item.id == id);
      if (index < 0) return;

      const [movedItem] = this.projectPaths.splice(index, 1);
      this.$nextTick(() => {
        this.projectPaths.splice(position, 0, movedItem);
      });
    }
  }));
});
