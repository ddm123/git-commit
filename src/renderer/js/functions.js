const messages = new Map();
const loadJsFileCache = new Map();
var messagesTimeoutId = null;
var disableBodyCounter = 0;

function disableBody(flag, enforce) {
    const body = document.body;
    if (flag || flag === undefined) {
        if (enforce) {
            body.classList.add('disable');
        } else {
            if (disableBodyCounter === 0) {
                body.classList.add('disable');
            }
            disableBodyCounter++;
        }
    } else {
        if (enforce) {
            body.classList.remove('disable');
        }else if(disableBodyCounter<=1) {
            body.classList.remove('disable');
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

async function compileComponents() {
    for (const component of document.querySelectorAll('component[src]')) {
        await fetch(component.getAttribute('src'), {cache: 'no-store', headers: {'Cache-Control': 'no-cache'}})
        .then(response => response.text())
        .then(html => {
            let attributes = {};
            for (const attr of component.attributes) {
                attributes[attr.name] = attr.value;
            }
            attributes = JSON.stringify(attributes);

            html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, p1, p2) => {
                const newScript = document.createElement('script');

                if (p1) {
                    const attrRegex = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^'"\s>]+)))?/g;
                    let attrMatch;
                    while ((attrMatch = attrRegex.exec(p1)) !== null) {
                        newScript.setAttribute(attrMatch[1], attrMatch[2] || attrMatch[3] || attrMatch[4] || '');
                    }
                }
                if (p2 && (p2 = p2.trim())) {
                    newScript.textContent = `(function(props) { ${p2} })(${attributes});`;
                }
                document.head.appendChild(newScript);
                return '';
            });
            component.insertAdjacentHTML('beforebegin', html);
            component.remove();
        })
        .catch(error => console.error('Error loading component '+component.getAttribute('src')+':', error));
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
    for(child of childrens) {
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
