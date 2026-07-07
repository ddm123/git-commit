const chokidar = require('chokidar');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { type } = require('node:os');

class SyncWatcher {
  #watcher = null;
  #batch = new Map();
  #batchTimer = null;
  #processing = false;
  #processQueue = [];
  #ftpClient = null;
  #workerProcess = null;

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
      if (this.options.childProcessSync) {
        throw new Error('子进程模式下不支持指定ftpClient选项');
      }
      this.#ftpClient = this.options.ftpClient;
      this.isFtp = true;
    } else if (this.options.ftp && typeof this.options.ftp === 'object' && this.options.ftp.host) {
      this.isFtp = true;
    } else if (!fs.existsSync(targetPath)) {
      throw new Error('targetPath(' + targetPath + ') does not exist.');
    }
  }

  start() {
    return this.options.childProcessSync ? this.#startWithWorker() : this.#startWithMain();
  }

  stop() {
    return this.options.childProcessSync ? this.#stopWithWorker() : this.#stopWithMain();
  }

  async #startWithMain() {
    if (this.#watcher) return true;

    // Try connecting to the FTP first
    if (this.isFtp && !this.#ftpClient) {
      this.#processing = true;
      try {
        this.#ftpClient = this.#getFtpClient(this.options.ftp);
        await this.#connectFtp(this.#ftpClient);
        this.#processing = false;
      } catch (e) {
        this.#callErrorHandler(e);
        this.#processing = false;
        return false;
      }
    }

    this.options.persistent ??= true;
    this.options.ignoreInitial ??= true;
    //this.options.ignored ??= /(^|[\\\/])(node_modules|\.git|\.DS_Store)($|[\\\/])/i; // ignore ['**/node_modules/**', '**/.git/**', '**/.DS_Store']
    this.options.awaitWriteFinish ??= {};
    this.options.awaitWriteFinish.stabilityThreshold ??= 2000;
    this.options.awaitWriteFinish.pollInterval ??= 200;
    this.options.depth ??= 100;

    if (this.options.ftp && typeof this.options.ftp.ignoredPaths === 'string' && this.options.ftp.ignoredPaths.trim() !== '') {
      const ignoredPaths = this.options.ftp.ignoredPaths.trim().replaceAll('\\', '/');
      const re = new RegExp(this.#wildcardToRegex(ignoredPaths).replace(/\s*(?:\r\n|\n|\r)+\s*/g, '$|^'));

      this.options.ignored = (relPath) => re.test(relPath.replaceAll('\\', '/'));
    }

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
    this.#watcher.on('error', this.#callErrorHandler.bind(this));

    if (this.options.onReady) {
      this.#watcher.once('ready', () => this.options.onReady());
    }

    return true;
  }

  async #startWithWorker() {
    if (this.#workerProcess) return true;

    this.#workerProcess = fork(path.join(__dirname, 'sync-watcher-worker.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    this.#workerProcess.stdout?.on('data', chunk => process.stdout.write(`[sync-watcher-process] ${chunk}`));
    this.#workerProcess.stderr?.on('data', chunk => process.stderr.write(`[sync-watcher-process] ${chunk}`));

    this.#workerProcess.on('message', message => {
      if (!message || typeof message !== 'object') return;

      if (message.result === undefined) message.result = [];
      else if (!Array.isArray(message.result)) message.result = [message.result];

      switch (message.type) {
        case 'progress':
          if (typeof this.options.onProgress === 'function') this.options.onProgress(...message.result);
          break;
        case 'ready':
          if (typeof this.options.onReady === 'function') this.options.onReady(...message.result);
          break;
        case 'error':
          this.#callErrorHandler(...message.result);
          break;
        case 'other':
          if (typeof this.options.onOther === 'function') this.options.onOther(...message.result);
          break;
        case 'ftp.init':
          if (typeof this.options.ftp?.onInit === 'function') this.options.ftp.onInit(...message.result);
          break;
        case 'ftp.connected':
          if (typeof this.options.ftp?.onConnected === 'function') this.options.ftp.onConnected(...message.result);
          break;
      }
    });

    this.#workerProcess.on('error', err => {
      this.#callErrorHandler(err);
    });

    this.#workerProcess.on('exit', (code, signal) => {
      if (this.#workerProcess) {
        this.#workerProcess = null;
      }
      if (code !== 0 && signal !== 'SIGTERM') {
        console.error(new Error(`Sync watcher worker exited unexpectedly (code=${code}, signal=${signal})`));
      }
    });

    const options = {...this.options};
    if (options.onError) options.onError = true;
    if (options.onReady) options.onReady = true;
    if (options.onProgress) options.onProgress = true;
    if (options.onOther) options.onOther = true;
    if (options.ftp) {
      if (options.ftp.onInit) options.ftp.onInit = true;
      if (options.ftp.onConnected) options.ftp.onConnected = true;
    }

    this.#workerProcess.send({
      type: 'start',
      sourcePath: this.sourcePath,
      targetPath: this.targetPath,
      options: options
    });

    let result = await this.#listenWorkerProcess('started', this.#workerProcess);
    return result;
  }

  async #stopWithMain() {
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

    console.log('SyncWatcher stopped.');

    return result;
  }

  async #stopWithWorker() {
    let result = true;

    if (this.#workerProcess) {
      let child = this.#workerProcess;
      this.#workerProcess = null;

      child.send({ type: 'stop' });
      result = await this.#listenWorkerProcess('stopped', child);
      //child.removeAllListeners('message');
      //child.removeAllListeners('error');
      //child.removeAllListeners('exit');
      child = null;
    }
    return result;
  }

  async #listenWorkerProcess(action, child) {
    if (!child) {
      return false;
    }

    let result = true;
    try {
      const p = new Promise((resolve, reject) => {
        let timer = setTimeout(() => {
          cleanup();
          reject(new Error('等待子进程通知(' + action + ')超时'));
        }, 10000);

        function onMessage(msg) {
          if (!msg) {
            msg = {type: 'error', result: new Error('子进程通知为空')};
          } else if (typeof msg !== 'object') {
            msg = {type: 'error', result: msg};
          } else if (Array.isArray(msg.result)) {
            msg.result = msg.result[0];
          }
          if (msg.type === 'error') {
            cleanup();
            reject(msg.result);
          } else if (msg.type === action) {
            cleanup();
            resolve(msg.result);
          }
        }
        function onError(err) {
          cleanup();
          reject(new Error('子进程错误: ' + err.message));
        }
        function onExit(code) {
          cleanup();
          reject(new Error(`子进程异常退出，退出码: ${code}`));
        }
        function cleanup() {
          clearTimeout(timer);
          child.removeListener('message', onMessage);
          child.removeListener('error', onError);
          child.removeListener('exit', onExit);
        }

        child.on('message', onMessage);
        child.once('error', onError);
        child.once('exit', onExit);
      });

      result = await p;
    } catch (err) {
      console.error(err.message);
      child.kill('SIGKILL');
      result = false;
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
            if (attempt < 3) {
              attempt++;
              await this.#connectFtp(this.#ftpClient);
              continue restartQueue;
            } else {
              console.error(e);
              this.stop();// Because the connection failed, so we stop the sync watcher
              this.#callErrorHandler(e, local, action);
              break restartQueue;
            }
          }

          console.error(e);
          this.#callErrorHandler(e, local, action);
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

  #callErrorHandler(...args) {
    try {
      this.options.onError(...args);
    } catch (e) {
      console.error(e);
    }
  }

  #wildcardToRegex(pattern) {
    return '^' + pattern
      .replace(/[\.\+\?\^\$\{\}\(\)\|\[\]\/\\]/g, '\\$&')
      .replaceAll('**', '@@ALL@@') // '.*': ** 匹配多级目录
      .replaceAll('*', '[^/]*') // * 不匹配路径分隔符
      .replaceAll('?', '[^/]') // ? 匹配单个字符（不包括路径分隔符）
      .replaceAll('@@ALL@@', '.*') + '$';
  }
}

module.exports = SyncWatcher;
