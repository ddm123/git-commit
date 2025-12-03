const listeners = new Map();
const boundWindows = new Map();

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
    bindCloseEvent(win);

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
 * @returns {Function}
 */
function bindCloseEvent(win) {
    var removeCloseListener = boundWindows.get(win.id);
    if (!removeCloseListener) {
        const handler = (event) => closeListener(event, win);
        win.on('close', handler);

        removeCloseListener = () => win.removeListener('close', handler);
        boundWindows.set(win.id, removeCloseListener);
    }

    return removeCloseListener;
}

/**
 * @param {BrowserWindow} win
 * @returns void
 */
function removeCloseEvent(win) {
    const removeCloseListener = boundWindows.get(win.id);
    if (removeCloseListener) {
        removeCloseListener();
        removeAllListeners(win);
        boundWindows.delete(win.id);
    }
}

function closeListener(event, win) {
    const _listeners = listeners.get(win.id);
    if (_listeners && _listeners.size > 0) {
        event.preventDefault();

        Promise.allSettled(Array.from(_listeners).map(handler => Promise.try(handler, event))).then(allResults => {
            allResults.forEach(result => {
                if (result.status === 'rejected') {
                    console.error('Error in window close listener:', result.reason);
                }
            });

            removeCloseEvent(win);
            win.removeAllListeners('close');

            if (!win.isDestroyed()) {
                win.close();
            }
        });
    }
}

module.exports = {
    addListener,
    removeListener,
    removeAllListeners
};