const { app, BrowserWindow, Menu, ipcMain, clipboard } = require('electron');
const git = require('simple-git');

async function handleGitLogs (event, projectPath, options) {
  const gitRepo = git(projectPath);
  if(typeof options === 'string'){
    options = [options];
  } else if (!options || !Array.isArray(options)) {
    options = [];
  }

  const output = await gitRepo.raw(['log', '--graph', '--format=%x00%H%x00%an%x00%ae%x00%cn%x00%ce%x00%cI%x00%s%x00%b%x00%D%x01', ...options]);
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

    let subject = fields[7] ?? '';
    let body = (fields[8] ?? '').trim();
    if (body === '') {
      body = subject;
      subject = '';
    }

    commits.push({
      graph: graphPart ? generateGraphSVG(graphPart) : '',
      hash: fields[1],
      author_name: fields[2] || '',
      author_email: fields[3] || '',
      committer_name: fields[4] || '',
      committer_email: fields[5] || '',
      date: fields[6] || '',
      subject,
      body,
      refs: (fields[9] ?? '').trim()
    });
  }

  return commits;
}

function generateGraphSVG(graphStr) {
  const width = 28;
  const height = 28;
  const radius = 4;
  const startX = 5;
  const startY = -1;
  const corlor = '#e80a0a';
  const lineWidth = 1;

  if (graphStr.startsWith('|/') && graphStr.endsWith('|')) graphStr = graphStr.slice(0, -1);

  const lines = graphStr.replaceAll('|\\', '^').replaceAll('|/', 'v').split('\n');
  const lineCount = lines.length;
  if (lineCount === 0) return '';

  let svgContent = '';

  for (let rowIdx = 0; rowIdx < lineCount; rowIdx++) {
    const line = lines[rowIdx];
    const chars = line.split('');

    chars.forEach((char, col) => {
      const x = col * startX + startX;

      switch (char) {
        case '|':
          svgContent += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${height + 1}" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
          break;
        case 'v':
          svgContent += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${height + 1}" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
          svgContent += `<path d="M${x},${height / 2} C${x + startX*2 - 2},${height / 2} ${x + startX*2},${height / 2 - 2} ${x + startX*2},${height / 2 - 4} L${x + startX*2},${startY}" fill="none" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
          break;
        case '^':
          svgContent += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${height + 1}" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
          svgContent += `<path d="M${x},${height / 2} C${x + startX*2 - 2},${height / 2} ${x + startX*2},${height / 2 + 2} ${x + startX*2},${height / 2 + 4} L${x + startX*2},${height + 1}" fill="none" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
          break;
        case '*':
          svgContent += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${height + 1}" stroke="${corlor}" stroke-width="${lineWidth}"/>`;
          svgContent += `<circle cx="${x}" cy="${height / 2}" r="${radius}" fill="${corlor}"/>`;
          break;
      }
    });
  };

  return `<svg title="${graphStr}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="auto">${svgContent}</svg>`;
}

module.exports = function () {
  ipcMain.handle('git:logs.graph', handleGitLogs);
};
