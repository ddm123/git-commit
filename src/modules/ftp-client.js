const path = require('node:path');
const fs = require('node:fs');
let progress = null;

class FtpClient {
  client = null;
  #connected = false;
  #_progressCallback = null;
  #_addedClientCloseListener = false;
  #_onUnderlyingClose = null;

  constructor (
    host,
    user = '',
    password = '',
    port = '',
    protocol = 'ftp'
  ) {
    this.host = host;
    this.port = port;
    this.user = user;
    this.password = password;
    this.protocol = protocol;
  }

  async connect() {
    if (!this.host) {
      return Promise.reject(new Error('FTP主机地址不能为空'));
    }
    if (this.client) {
      try {
        await this.close();
      } catch (e) {
        console.error('Closing existing FTP connection error:', e);
      }
    }

    let connectResult = null;
    if (this.protocol === 'sftp') {
      const Client = require('ssh2-sftp-client');
      this.client = new Client();
      connectResult = await this.client.connect({
        host: this.host,
        port: this.port || 22,
        username: this.user,
        password: this.password
      });

      // 试图监听底层 ssh2 client 的断开/错误事件以更新状态（尽量安全地访问）
      if (!this.#_addedClientCloseListener) {
        const underlying = this.client?.client;
        if (underlying && typeof underlying.on === 'function') {
          if (this.#_onUnderlyingClose) {
            underlying.removeListener('close', this.#_onUnderlyingClose);
            underlying.removeListener('end', this.#_onUnderlyingClose);
            underlying.removeListener('error', this.#_onUnderlyingClose);
          } else {
            this.#_onUnderlyingClose = () => { this.#connected = false; };
          }
          underlying.on('end', this.#_onUnderlyingClose);
          underlying.on('close', this.#_onUnderlyingClose);
          underlying.on('error', this.#_onUnderlyingClose);
        }
        this.#_addedClientCloseListener = true;
      }
    } else {
      const { Client } = require("basic-ftp");
      this.client = new Client();
      this.client.ftp.verbose = false;
      connectResult = await this.client.access({
        host: this.host,
        port: this.port || 21,
        user: this.user,
        password: this.password,
        secure: this.protocol === 'ftps'
      });

      // 监听底层 socket 的 close/error 以更新状态
      if (!this.#_addedClientCloseListener) {
        const sock = this.client?.ftp?.socket;
        if (sock && typeof sock.on === 'function') {
          if (this.#_onUnderlyingClose) {
            sock.removeListener('close', this.#_onUnderlyingClose);
            sock.removeListener('error', this.#_onUnderlyingClose);
          } else {
            this.#_onUnderlyingClose = () => { this.#connected = false; };
          }
          sock.on('close', this.#_onUnderlyingClose);
          sock.on('error', this.#_onUnderlyingClose);
        }
        this.#_addedClientCloseListener = true;
      }
    }

    this.#connected = true;
    return connectResult;
  }

  async close() {
    if (!this.client) {
      this.#connected = false;
      return true;
    }

    let result = true;
    if (this.protocol === 'sftp') {
      result = await this.client.end();

      if (this.#_onUnderlyingClose) {
        const underlying = this.client?.client;
        underlying?.removeListener('close', this.#_onUnderlyingClose);
        underlying?.removeListener('end', this.#_onUnderlyingClose);
        underlying?.removeListener('error', this.#_onUnderlyingClose);
      }
    } else {
      await this.client.close();
      result = this.client.closed;
      if (this.#_onUnderlyingClose) {
        const sock = this.client.ftp?.socket;
        sock?.removeListener('close', this.#_onUnderlyingClose);
        sock?.removeListener('error', this.#_onUnderlyingClose);
      }
    }

    this.#connected = false;
    this.#_addedClientCloseListener = false;
    this.#_onUnderlyingClose = null;
    this.client = null;
    return result;
  }

  // 同步检查当前连接状态（轻量）：基于内部连接标志与底层 socket/closed 状态
  isConnected() {
    if (!this.client) return false;

    if (this.protocol === 'sftp') {
      return this.#connected;
    }

    // basic-ftp 的 client 可能有 closed 标志，优先使用它
    if (typeof this.client.closed !== 'undefined') {
      return !this.client.closed && this.#connected;
    }
    // 否则检查底层 socket 是否存在且未被销毁
    try {
      const sock = this.client.ftp?.socket;
      if (sock) return !sock.destroyed && this.#connected;
    } catch (e) { /* ignore */ }

    return this.#connected;
  }

  async uploadFile(localFile, remoteFile) {
    if (!this.client) {
      return Promise.reject(new Error('FTP客户端未连接'));
    }

    remoteFile = remoteFile.replaceAll('\\', '/');
    const dir = path.posix.dirname(remoteFile);

    if (this.protocol === 'sftp') {
      const rs = fs.createReadStream(localFile);
      let ps = null;

      if (this.#_progressCallback) {
        if (!progress) {
          progress = require('progress-stream');
        }

        ps = progress({time: 100, length: fs.statSync(localFile).size});
        ps.on('progress', p => {
          this.#_progressCallback({
            type: 'upload',
            name: remoteFile,
            bytes: p.transferred,
            bytesOverall: p.length
          });
        });
        rs.pipe(ps);
      }

      try {
        if (await this.client.exists(dir) !== 'd') {
          await this.client.mkdir(dir, true);
        }

        return await this.client.put(ps ?? rs, remoteFile);
      } finally {
        rs.destroy();
        if (ps) ps.end();
      }
    }

    return this.client
      .ensureDir(dir)
      .then(() => this.client.uploadFrom(localFile, remoteFile));
  }

  deleteFile(remoteFile) {
    if (!this.client) {
      return Promise.reject(new Error('FTP客户端未连接'));
    }

    remoteFile = remoteFile.replaceAll('\\', '/');

    if (this.protocol === 'sftp') {
      return this.client.delete(remoteFile);
    }

    return this.client.remove(remoteFile);
  }

  ensureDir(remoteDir) {
    if (!this.client) {
      return Promise.reject(new Error('FTP客户端未连接'));
    }

    remoteDir = remoteDir.replaceAll('\\', '/');

    if (this.protocol === 'sftp') {
      return this.client.mkdir(remoteDir, true);
    }

    return this.client.ensureDir(remoteDir);
  }

  removeDir(remoteDir) {
    if (!this.client) {
      return Promise.reject(new Error('FTP客户端未连接'));
    }

    remoteDir = remoteDir.replaceAll('\\', '/');

    if (this.protocol === 'sftp') {
      return this.client.rmdir(remoteDir, true);
    }

    return this.client.removeDir(remoteDir);
  }

  trackProgress(callback) {
    if (!this.client) {
      throw new Error('FTP客户端未连接');
    }

    this.#_progressCallback = typeof callback === 'function' ? callback : null;
    if (this.protocol !== 'sftp') {
      this.#_progressCallback ? this.client.trackProgress(this.#_progressCallback) : this.client.trackProgress();
    }
  }

}

module.exports = FtpClient;
