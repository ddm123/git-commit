const path = require('node:path');
const fs = require('node:fs');
let progress = null;

class FtpClient {
  client = null;
  #_progressCallback = null;

  constructor (
    host,
    user = '',
    password = '',
    port = 21,
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
      await this.close();
    }

    let connectResult = null;
    if (this.protocol === 'sftp') {
      const Client = require('ssh2-sftp-client');
      this.client = new Client();
      connectResult = this.client.connect({
        host: this.host,
        port: this.port || 22,
        username: this.user,
        password: this.password
      });
    } else {
      const { Client } = require("basic-ftp");
      this.client = new Client();
      this.client.ftp.verbose = false;
      connectResult = this.client.access({
        host: this.host,
        port: this.port || 21,
        user: this.user,
        password: this.password,
        secure: this.protocol === 'ftps'
      });
    }
    return connectResult;
  }

  async close() {
    if (!this.client) return true;

    let result = true;
    if (this.protocol === 'sftp') {
      result = await this.client.end();
    } else {
      await this.client.close();
      result = this.client.closed;
    }
    this.client = null;
    return result;
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

        return this.client.put(ps ?? rs, remoteFile);
      } finally {
        rs.destroy();
      }
    }

    return this.client
      .ensureDir(dir)
      .then(() => this.client.uploadFrom(localFile, remoteFile));
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