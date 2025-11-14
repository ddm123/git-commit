const chokidar = require('chokidar');
const fs = require('node:fs');
const path = require('node:path');

class SyncWatcher {
  #watcher = null;
  #batch = new Map();
  #batchTimer = null;
  #processing = false;
  #processQueue = [];
  #ftpClient = null;

  constructor(sourcePath, targetPath, options = {}) {
    if (!sourcePath || !targetPath) {
      throw new Error('sourcePath 和 targetPath 参数不能为空');
    }

    this.isFtp = false;
    this.sourcePath = sourcePath;
    this.targetPath = targetPath;
    this.options = options || {};

    if (typeof this.options.onError !== 'function') {
      this.options.onError = err => console.error('SyncWatcher error', err);
    }
    // allow injecting a client instance via options.client
    if (this.options.ftpClient) {
      this.#ftpClient = this.options.ftpClient;
      this.isFtp = true;
    } else if (this.options.ftp && typeof this.options.ftp === 'object' && this.options.ftp.host) {
      this.isFtp = true;
    } else if (!fs.existsSync(targetPath)) {
      throw new Error('targetPath(' + targetPath + ') does not exist.');
    }
  }

  async start() {
    if (this.#watcher) return;

    this.options.persistent ??= true;
    this.options.ignoreInitial ??= true;
    this.options.ignored ??= ['**/node_modules/**', '**/.git/**', '**/.DS_Store'];
    this.options.awaitWriteFinish ??= {};
    this.options.awaitWriteFinish.stabilityThreshold ??= 500;
    this.options.awaitWriteFinish.pollInterval ??= 100;
    this.options.depth ??= 99;

    this.#watcher = chokidar.watch(this.sourcePath, this.options);

    const enqueue = (p, action) => {
      // store the latest action for this path; Map keeps insertion order
      this.#batch.set(p, action);

      if (this.#batchTimer) clearTimeout(this.#batchTimer);
      this.#batchTimer = setTimeout(() => this.#processBatch(), 300);
    };

    this.#watcher.on('add', p => enqueue(p, 'add'));
    this.#watcher.on('change', p => enqueue(p, 'change'));
    this.#watcher.on('unlink', p => enqueue(p, 'unlink'));
    this.#watcher.on('addDir', p => enqueue(p, 'addDir'));
    this.#watcher.on('unlinkDir', p => enqueue(p, 'unlinkDir'));
    this.#watcher.on('error', err => {
      try { this.options.onError(err); } catch (e) { console.error(e); }
    });

    if (this.options.onReady) {
      this.#watcher.once('ready', () => this.options.onReady());
    }

    // if FTP mode and no client injected, connect
    if (this.isFtp && !this.#ftpClient) {
      this.#processing = true;
      this.#ftpClient = this.#getFtpClient(this.options.ftp);
      await this.#connectFtp(this.#ftpClient);
      this.#processing = false;
    }
  }

  async stop() {
    let result = true;

    if (this.#batchTimer) {
      clearTimeout(this.#batchTimer);
      this.#batchTimer = null;
    }
    if (this.#watcher) {
      try {
        await this.#watcher.close();
      } catch (e) {
        result = false;
      }
      this.#watcher = null;
    }
    if (this.#ftpClient) {
      try {
        await this.#ftpClient.close();
      } catch (e) {
        result = false;
      }
      this.#ftpClient = null;
    }

    return result;
  }

  // map a local absolute path to remote target path (posix)
  #mapToRemote(localPath) {
    let sourcePath = this.sourcePath.replaceAll('\\', '/');
    let targetPath = this.targetPath.replace(/(?:\/|\\)+$/, '');
    if (!sourcePath.endsWith('/')) {
      sourcePath += '/';
    }

    return localPath.replaceAll('\\', '/')
      .replace(sourcePath, this.isFtp ? targetPath.replaceAll('\\', '/') + '/' : targetPath + path.sep);
  }

  async #processBatch() {
    if (!this.#batch.size) return;

    const entries = Array.from(this.#batch.entries());
    this.#batch.clear();
    this.#processQueue.push(entries);

    if (this.#processing) return;
    this.#processing = true;

    // process all queued batches in order
    let attempt = 0;
    restartQueue: while (this.#processQueue.length) {
      for (const [local, action] of this.#processQueue[0]) {
        try {
          let result = await this.#handleEntry(local, action);

          if (typeof this.options.onProgress === 'function') {
            this.options.onProgress(...result);
          }
        } catch (e) {
          if (this.isFtp && this.#isConnectionError(e)) {
            if (attempt < 3){
              attempt++;
              await this.#connectFtp(this.#ftpClient);
              continue restartQueue;
            } else {
              throw e;
            }
          }

          console.error(e);
          try {
            this.options.onError && this.options.onError(e, local, action);
          } catch (ee) {
            console.error(ee);
          }
        }
      }
      this.#processQueue.shift();
    }

    this.#processing = false;
  }

  // helper: safe stat (returns stat or null)
  async #statSafe(p) {
    try {
      return await fs.promises.stat(p);
    } catch (e) {
      return null;
    }
  }

  async #ensureDir(remote) {
    if (this.isFtp && this.#ftpClient) {
      await this.#ftpClient.ensureDir(remote);
    } else {
      await fs.promises.mkdir(remote, { recursive: true });
    }
    return true;
  }

  async #removeFile(remote) {
    if (this.isFtp && this.#ftpClient) {
      await this.#ftpClient.deleteFile(remote);
    } else {
      await fs.promises.unlink(remote);
    }
    return true;
  }

  async #removeDir(remote) {
    if (this.isFtp && this.#ftpClient) {
      await this.#ftpClient.removeDir(remote);
    } else {
      await fs.promises.rm(remote, { recursive: true, force: true });
    }
    return true;
  }

  async #uploadOrCopy(local, remote) {
    if (this.isFtp && this.#ftpClient) {
      await this.#ftpClient.uploadFile(local, remote);
    } else {
      const destDir = path.dirname(remote);
      await fs.promises.mkdir(destDir, { recursive: true });
      await fs.promises.copyFile(local, remote);
    }
    return true;
  }

  async #handleEntry(local, action) {
    const remote = this.#mapToRemote(local);

    switch (action) {
      case 'add':
      case 'change': {
        const stat = await this.#statSafe(local);
        if (stat && stat.isFile()) {
          await this.#uploadOrCopy(local, remote);
        } else if (stat && stat.isDirectory()) {
          await this.#ensureDir(remote);
        } else {
          // stat failed -> treat as removal
          try { await this.#removeFile(remote); } catch (e) { await this.#removeDir(remote); }
        }
        break;
      }
      case 'addDir':
        await this.#ensureDir(remote);
        break;
      case 'unlink':
        await this.#removeFile(remote);
        break;
      case 'unlinkDir':
        await this.#removeDir(remote);
        break;
      default:
        try { this.options.onOther && await this.options.onOther(local, action); } catch (e) { console.error(e); }
    }

    return [local, remote, action];
  }

  #getFtpClient(ftpOptions) {
    const Client = require('./ftp-client.js');
    const client = new Client(
      ftpOptions.host,
      ftpOptions.username ?? '',
      ftpOptions.password ?? '',
      ftpOptions.port,
      ftpOptions.protocol
    );

    return client;
  }

  async #connectFtp(client) {
    if (typeof this.options.ftp.onInit === 'function') {
      this.options.ftp.onInit(client);
    }

    await client.connect();
    if (typeof this.options.ftp.onConnected === 'function') {
      this.options.ftp.onConnected(client);
    }

    return true;
  }

  #isConnectionError(err) {
    if (!err || typeof err !== 'object') {
      return false;
    }
    if (err.code && ['ERR_NOT_CONNECTED', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code)) {
      return true;
    }
    if (err.message && /(?:Connection closed|Not connected|No SFTP connection)/i.test(err.message)) {
      return true;
    }
    return false;
  }
}

module.exports = SyncWatcher;