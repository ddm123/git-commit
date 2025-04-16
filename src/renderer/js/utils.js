const messages = new Map();
var messagesTimeoutId = null;

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

function createMessageElement(message) {
    const messageElement = document.createElement('div');
    const textElement = document.createElement('div');
    const closeElement = document.createElement('div');
    messageElement.classList.add('message');
    textElement.classList.add('text');
    textElement.innerHTML = message;
    closeElement.classList.add('close');
    closeElement.innerHTML = '&times;';
    closeElement.msgIndex = messages.size;
    closeElement.addEventListener('click', (event) => {
        messages.get(event.target.msgIndex)?.remove();
        messages.delete(event.target.msgIndex);
    });
    messageElement.appendChild(textElement);
    messageElement.appendChild(closeElement);
    messages.set(closeElement.msgIndex, messageElement);
    return messageElement;
}

function insertMessageElement(messageElement) {
    const messagesElement = document.getElementById('messages');
    if (messagesElement) {
        let classList = messagesElement.classList;
        if(!messagesElement.getAttribute('has-listener-animationend')){
            messagesElement.setAttribute('has-listener-animationend', 'true');
            messagesElement.addEventListener('animationend', function(event){
                if (event.animationName === 'slideOut') {
                    this.classList.remove('slide-out');
                    this.innerHTML = '';
                    messages.clear();
                }
            });
        }
        messagesElement.appendChild(messageElement);
        classList.remove('slide-out');
        classList.add('slide-in');
        if(messagesTimeoutId) {
            window.clearTimeout(messagesTimeoutId);
        }
        messagesTimeoutId = window.setTimeout(() => {
            classList.remove('slide-in');
            classList.add('slide-out');
            messagesTimeoutId = null;
        }, 8000);
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
