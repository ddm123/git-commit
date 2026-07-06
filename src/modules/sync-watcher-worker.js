const SyncWatcher = require('./sync-watcher.js');

let watcher = null;

function startWatcher({ sourcePath, targetPath, options }) {
  if (watcher) {
    return;
  }

  let hasError = false;

  options.childProcessSync = false;
  if (options.ftp) options.ftp.childProcessSync = false;

  if (options.onError) options.onError = (...args) => {
    hasError = true;

    for (let i = args.length; i--;) {
      if (args[i] instanceof Error) {
        const err = args[i];
        args[i] = { message: err.message, name: err.name ?? undefined };
      }
    }
    process.send({ type: 'error', result: args });
  };
  if (options.onReady) options.onReady = (...args) => process.send({ type: 'ready', result: args });
  if (options.onProgress) options.onProgress = (...args) => process.send({ type: 'progress', result: args });
  if (options.onOther) options.onOther = (...args) => process.send({ type: 'other', result: args });

  watcher = new SyncWatcher(sourcePath, targetPath, options);
  watcher.start()
  .then(() => {
    if (hasError) {
      watcher = null;
      console.log('Error starting SyncWatcher. Exiting...');
      process.exit(0);
    } else {
      process.send({ type: 'started', result: true });
    }
  })
  .catch(err => {
    watcher = null;
    process.send({ type: 'error', result: { message: err.message, name: err.name ?? undefined } });
    console.log('Error starting SyncWatcher: ' + err.message + '. Exiting...');
    process.exit(0);
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
    console.log('SyncWatcher stopped. Exiting...');
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
