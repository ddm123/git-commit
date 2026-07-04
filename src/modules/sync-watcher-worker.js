const SyncWatcher = require('./sync-watcher.js');

let watcher = null;

function startWatcher({ sourcePath, targetPath, options }) {
  if (watcher) {
    return;
  }

  options.childProcessSync = false;
  if (options.ftp) options.ftp.childProcessSync = false;

  if (options.onError) options.onError = (...args) => process.send({ type: 'error', result: args });
  if (options.onReady) options.onReady = (...args) => process.send({ type: 'ready', result: args });
  if (options.onProgress) options.onProgress = (...args) => process.send({ type: 'progress', result: args });
  if (options.onOther) options.onOther = (...args) => process.send({ type: 'other', result: args });

  watcher = new SyncWatcher(sourcePath, targetPath, options);
  watcher.start()
  .then(() => {
    process.send({ type: 'started', result: true });
  })
  .catch(err => {
    watcher = null;
    process.send({ type: 'error', result: err.message });
  });
}

function stopWatcher() {
  if (!watcher) {
    return;
  }

  watcher.stop()
  .then(result => process.send({ type: 'stopped', result }))
  .finally(() => {
    watcher = null;
    process.exit(0);
  });
}

process.on('message', message => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'start') {
    startWatcher(message);
  } else if (message.type === 'stop') {
    stopWatcher();
  }
});

process.on('disconnect', () => {
  stopWatcher();
});
