const messages = new Map();
const loadJsFileCache = new Map();
var messagesTimeoutId = null;
var disableBodyCounter = 0;

function disableBody(flag, enforce) {
  const body = document.body;
  if (flag || flag === undefined) {
    if (enforce) {
      body.classList.add('disable');
      if (typeof NProgress === 'object') NProgress.start();
    } else {
      if (disableBodyCounter === 0) {
        body.classList.add('disable');
        if (typeof NProgress === 'object') NProgress.start();
      }
      disableBodyCounter++;
    }
  } else {
    if (enforce) {
      body.classList.remove('disable');
      if (typeof NProgress === 'object') NProgress.done();
    }else if(disableBodyCounter<=1) {
      body.classList.remove('disable');
      if (typeof NProgress === 'object') NProgress.done();
      disableBodyCounter = 0;
    }else{
      disableBodyCounter--;
    }
  }
  return body;
}

function isDisabledBody() {
  return document.body.classList.contains('disable');
}

function showError(message) {
  const messageElement = createMessageElement(message);
  messageElement.classList.add('error');
  insertMessageElement(messageElement);
  return messageElement;
}

function showSuccess(message) {
  const messageElement = createMessageElement(message);
  messageElement.classList.add('success');
  insertMessageElement(messageElement);
  return messageElement;
}

function textToHtml(text) {
  return text ? text.replace(/(?:\r\n|\r|\n)/g, '<br/>').replaceAll('  ', ' &nbsp;').replaceAll('\t', ' &nbsp; &nbsp;') : text;
}

function getExtname(fileName) {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : fileName.substring(lastDotIndex);
}

function formatFileSize(size) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return size.toFixed(2) + ' ' + units[index];
}

function debounce(fn, wait = 300) {
  let timer;

   function debounced(...args) {
      clearTimeout(timer);
     timer = setTimeout(() => fn.apply(this, args), wait);
   }

   debounced.cancel = () => clearTimeout(timer);
   return debounced;
}

function htmlspecialchars(str) {
  return str.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function extractScriptFromHtml(html, props = undefined) { 
  const scriptPromises = [];
  const scriptElements = [];

  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, p1, p2) => {
    const newScript = document.createElement('script');
    let isSync = true;

    if (p1) {
      const attrRegex = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^'"\s>]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(p1)) !== null) {
        newScript.setAttribute(attrMatch[1], attrMatch[2] || attrMatch[3] || attrMatch[4] || '');
        if (attrMatch[1] === 'async' || attrMatch[1] === 'defer') isSync = false;
      }
    }
    if (p2 && (p2 = p2.trim())) {
      newScript._funcName = '__temp_function_' + Math.random().toString(36).substring(2) + '__';
      newScript._funcArgs = props;
      newScript.textContent = 'window["'+newScript._funcName+'"] = function(props){\n'+p2+'\n};';
    }
    if (isSync && newScript.getAttribute('src')) {
      scriptPromises.push(new Promise((resolve, reject) => {
        newScript.addEventListener('load', (event) => resolve(event));
        newScript.addEventListener('error', (event) => reject(event));
      }));
    }
    scriptElements.push(newScript);
    return '';
  });

  return {html, scriptPromises, scriptElements};
}

async function compileComponents(onLoad) {
  const rendererComponent = async function(component, html) {
    let attributes = {};
    for (const attr of component.attributes) {
      attributes[attr.name] = attr.value;
    }

    let scriptPromises = [], scriptElements = [];
    ({html, scriptPromises, scriptElements} = extractScriptFromHtml(html, attributes));
    if (scriptElements.length) scriptElements.forEach(elm => {
      document.head.appendChild(elm);
      if (elm._funcName) {
        window[elm._funcName](elm._funcArgs);
        delete window[elm._funcName];
      }
    });
    if (scriptPromises.length) {
      const results = await Promise.allSettled(scriptPromises);
      results.forEach(result => {
        if (result.status === 'rejected') console.error('Error in component script:', result.reason);
      });
    }
    component.insertAdjacentHTML('beforebegin', html);
    onLoad(html, component);
    component.remove();
    if (scriptElements.length) scriptElements.forEach(elm => elm.remove());
  };
  const loadComponent = function(component) {
    return fetch(component.getAttribute('src')/*, {cache: 'no-store', headers: {'Cache-Control': 'no-cache'}}*/)
      .then(response => response.text())
      .then(html => rendererComponent(component, html))
      .catch(error => console.error('Error loading component '+component.getAttribute('src')+':', error));
  }
  if (typeof onLoad !== 'function') onLoad = () => {};

  const deferComponents = [];
  for (const component of document.querySelectorAll('component[src]')) {
    if (component.hasAttribute('defer')) {
      deferComponents.push(component);
    } else {
      await loadComponent(component);
    }
  }

  let len = deferComponents.length;
  if (len) {
    for (let i = 0; i < len; i++) loadComponent(deferComponents[i]);
  } else {
    onLoad(undefined, undefined);
  }
}

function loadJsFile(url) {
  if (loadJsFileCache.has(url)) {
    return loadJsFileCache.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;
    script.async = true;

    script.addEventListener('load', (event) => resolve(event));
    script.addEventListener('error', (event) => {
      loadJsFileCache.delete(url); // 失败时清除缓存，允许重试
      reject(new Error(`Failed to load script: ${url}`));
    });

    (document.head || document.body).appendChild(script);
  });

  loadJsFileCache.set(url, promise);
  return promise;
}

function createMessageElement(message) {
  const messageElement = document.createElement('div');
  const textElement = document.createElement('div');
  const closeElement = document.createElement('div');
  const classList = messageElement.classList;
  const duration = 8;//单位：秒

  textElement.classList.add('text');
  textElement.innerHTML = message;
  closeElement.classList.add('close');
  closeElement.innerHTML =
   '<svg class="circle-progress" viewBox="0 0 200 200">' +
     '<circle class="circle-bg" cx="100" cy="100" r="95"></circle>' +
     '<circle class="circle-fill" cx="100" cy="100" r="95" stroke-dasharray="596.9">' +
     '<animate attributeName="stroke-dashoffset" from="0" to="596.9" dur="' + duration + 's" fill="freeze"/>' +
     '</circle>' +
     '<path class="icon" d="M70 70 L130 130 M130 70 L70 130" fill="none"/>' +
   '</svg>';
  closeElement.msgIndex = messages.size;
  closeElement.addEventListener('click', (event) => {
    classList.remove('slide-in');
    classList.add('slide-out');
  });
  messageElement.addEventListener('animationend', event => {
    if (event.animationName === 'slideOut') {
      messageElement.remove();
      messages.delete(closeElement.msgIndex);
    }
  });
  messageElement.appendChild(textElement);
  messageElement.appendChild(closeElement);
  classList.add('message');
  classList.add('slide-in');
  window.setTimeout(() => closeElement.click(), duration * 1000);

  messages.set(closeElement.msgIndex, messageElement);
  return messageElement;
}

function insertMessageElement(messageElement) {
  const messagesElement = document.getElementById('messages');
  if (messagesElement) {
    messagesElement.appendChild(messageElement);
    return messageElement;
  }

  const childrens = Array.from(document.body.children);
  let isInserted = false;
  for (const child of childrens) {
    if (child.nodeType === 1 && !child.classList.contains('message')) {
      document.body.insertBefore(messageElement, child);
      isInserted = true;
      break;
    }
  }
  if (!isInserted) {
    document.body.appendChild(messageElement);
  }
  return messageElement;
}

function clearMessages() {
  messages.forEach(messageElement => messageElement.remove());
  messages.clear();
}

/**
 * @param {Array} source 
 * @param {Array} target 
 * @param {Function} decorator 
 * @param {Number} limit
 * @returns {Promise<Boolean>}
 */
function chunkRenderer(source, target, decorator, limit = 50) {
  const sourceCount = source.length;
  if (!sourceCount) return Promise.resolve(true);
  if (limit <= 0) return Promise.reject(new Error('Limit must be greater than 0'));

  decorator ??= () => {};
  if (chunkRenderer._rafId) {
    window.cancelAnimationFrame(chunkRenderer._rafId);
    chunkRenderer._rafId = null;
  }
  if (chunkRenderer._controller) {
    chunkRenderer._controller.abort();
    chunkRenderer._controller = null;
  }

  chunkRenderer._controller = new AbortController();

  const signal = chunkRenderer._controller.signal;
  let cursor = 0, done = false;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (chunkRenderer._rafId !== null) {
        window.cancelAnimationFrame(chunkRenderer._rafId);
        chunkRenderer._rafId = null;
      }
      signal.removeEventListener('abort', abortHandler);
      chunkRenderer._controller = null;
    };

    const abortHandler = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('Cancel', { cause: 'signal.aborted' }));
    };

    if (signal.aborted) {
      abortHandler();
      return;
    }

    signal.addEventListener('abort', abortHandler, { once: true });

    const processNextChunk = () => {
      if (done || signal.aborted) {
        abortHandler();
        return;
      }

      const end = Math.min(cursor + limit, sourceCount);
      let shouldStop = false;

      for (let i = cursor; i < end; i++) {
        try {
          const result = decorator(i);
          if (result === false) {
            shouldStop = true;
            break;
          }
          if (result === true) {
            continue;
          }
        } catch (err) {
          console.error(err);
          // Ignore
        }

        target.push(source[i]);
      }

      if (shouldStop || end >= sourceCount) {
        done = true;
        cleanup();
        resolve(true);
        return;
      }

      cursor = end;
      chunkRenderer._rafId = window.requestAnimationFrame(processNextChunk);
    };

    processNextChunk();
  });
}
