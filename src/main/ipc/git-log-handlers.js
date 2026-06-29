const { app, BrowserWindow, Menu, ipcMain, clipboard } = require('electron');
const git = require('simple-git');

async function handleGitLogs (event, projectPath, options) {
  const gitRepo = git(projectPath);
  if(typeof options === 'string'){
    options = [options];
  } else if (!options || !Array.isArray(options)) {
    options = [];
  }

  const output = await gitRepo.raw(['log', '--graph', '--format=%x00%H%x00%an%x00%ae%x00%cn%x00%ce%x00%cI%x00%B%x00%D%x01', ...options]);
  return parseGraphOutput(output);
}

function parseGraphOutput(output) {
  const chunks = output.split('\x01');
  const chunksCount = chunks.length;
  const commits = [];
  const graphRegex = /^\s+|[^\*\|\\\/\s]+|\s+$/g;
  let nextFields = null;  // 暂存下一条记录的字段

  // 按记录分隔符切分，最后一项是空串，直接忽略
  for (let i = 0; i < chunksCount - 1; i++) {
    const chunk = chunks[i];
    // 哈希之后的部分按 \x00 分割。注意前面会有多余的一个 \x00
    const fields = nextFields ? nextFields : chunk.split('\x00');
    nextFields = i + 1 < chunksCount - 1 ? chunks[i + 1].split('\x00') : null;

    let graphPart = fields[0].replace(graphRegex, '');

    if (nextFields && nextFields[0].includes('|\\')) {
      let nextGraphParts = nextFields[0].trim().split('\n');
      let nextGraphPart = nextGraphParts.shift().replace(graphRegex, '');
      if (nextGraphPart) {
        if (nextGraphPart.endsWith('|')) nextGraphPart = nextGraphPart.slice(0, -1);
        graphPart += '\n' + nextGraphPart;
      }
      nextFields[0] = nextGraphParts.join('\n');
    }

    let subject = (fields[7] ?? '').trim();
    let body = '';
    if (subject !== '') {
      subject = subject.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
      const arr = subject.split('\n\n');
      subject = arr[0];
      if (arr.length > 1) body = arr.slice(1).join('\n\n');
    }
    if (body === '') {
      body = subject;
      subject = '';
    }
    if (graphPart !== '' && graphPart.startsWith('|/') && graphPart.endsWith('|')) {
      graphPart = graphPart.slice(0, -1);
    }

    commits.push({
      graph: graphPart,
      hash: fields[1],
      author_name: fields[2] || '',
      author_email: fields[3] || '',
      committer_name: fields[4] || '',
      committer_email: fields[5] || '',
      date: fields[6] || '',
      subject,
      body,
      refs: (fields[8] ?? '').trim()
    });
  }

  return commits;
}

module.exports = function () {
  ipcMain.handle('git:logs.graph', handleGitLogs);
};
