const listeners = new Map();

/**
 * @param {Function} handler
 * @param {BrowserWindow} win
 * @returns {Function}
 */
function addListener(handler, win) {
    if (typeof handler !== 'function') {
        throw new TypeError('Handler must be a function');
    }
    if (!listeners.has(win.id)) {
        listeners.set(win.id, new Set());
    }
    listeners.get(win.id).add(handler);

    return () => removeListener(handler, win);
}

/**
 * @param {Function} handler
 * @param {BrowserWindow} win
 * @returns boolean
 */
function removeListener(handler, win) {
    return !listeners.has(win.id) || listeners.get(win.id).delete(handler);
}

/**
 * @param {BrowserWindow} win
 * @returns void
 */
function removeAllListeners(win) {
    win===undefined ? listeners.clear() : listeners.delete(win.id);
}

/**
 * @param {BrowserWindow} win
 * @returns void
 */
function bindCloseEvent(win) {
    win.on('close', (event) => closeListener(event, win));
}

async function closeListener(event, win) {
    const _listeners = listeners.get(win.id);
    if (_listeners && _listeners.size > 0) {
        event.preventDefault();
        await Promise.all(Array.from(_listeners).map(handler => handler(event)));

        removeAllListeners(win);
        win.removeAllListeners('close');

        if (!win.isDestroyed()) {
            win.close();
        }
    }
}

module.exports = {
    addListener,
    removeListener,
    removeAllListeners,
    bindCloseEvent
};