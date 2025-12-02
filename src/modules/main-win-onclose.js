const listeners = new Set();

function addListener(handler) {
    if (typeof handler !== 'function') {
        throw new TypeError('Handler must be a function');
    }
    listeners.add(handler);

    return () => removeListener(handler);
}

function removeListener(handler) {
    return listeners.delete(handler);
}

function removeAllListeners() {
    listeners.clear();
}

/**
 * @param {BrowserWindow} win
 */
function bindCloseEvent(win) {
    win.on('close', (event) => closeListener(event, win));
}

async function closeListener(event, win) {
    if (listeners.size === 0) {
        return;
    }

    event.preventDefault();
    await emitCloseEvent(event);

    removeAllListeners();
    win.removeAllListeners('close');

    if (!win.isDestroyed()) {
        win.close();
    }
}

async function emitCloseEvent(event) {
    return await Promise.all(Array.from(listeners).map(handler => handler(event)));
}

module.exports = {
    addListener,
    removeListener,
    removeAllListeners,
    bindCloseEvent
};