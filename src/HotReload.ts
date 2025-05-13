import type { HotReloadCmd, HotReloadCmdChange } from "../hot-reload-plugin";

export const WS_PATH = "__bun_live_reload_websocket__";

function logDebug(...params: any[]) {
    console.debug(`[HotReload]`, ...params);
}

function logInfo(...params: any[]) {
    console.log(`[HotReload]`, ...params);
}

function logWarn(...params: any[]) {
    console.warn(`[HotReload]`, ...params);
}

function logError(...params: any[]) {
    console.error(`[HotReload]`, ...params);
}

export function connect() {
    const wsProto = document.location.protocol == "https:" ? "wss:" : "ws:";
    const wsUrl = new URL(WS_PATH, `${wsProto}//${location.host}`);
    logInfo(`Connecting to \"${wsUrl}\"...`);

    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
        logInfo("Connection opened.");
    };
    socket.onmessage = (msg) => {
        const cmd: HotReloadCmd = JSON.parse(msg.data);
        switch (cmd.kind) {
            case "change":
                onCmdChange(cmd);
                break;

            default:
                logError(`Unknown message command (kind ${cmd.kind}):`, msg.data);
                break;
        }
    };
    socket.onclose = (evt) => {
        if (evt.wasClean) {
            logInfo(`Connection closed (code ${evt.code}):`, evt.reason);
        } else {
            logWarn(`Connection closed unexpectedly (code ${evt.code}):`, evt.reason);
        }
    };
    socket.onerror = (evt) => {
        if (socket.readyState == 1) {
            logError("Connecton error:", evt);
        }
    };
}

type AssetChangeCallback = (path: string) => void;

const assetChangeListeners: AssetChangeCallback[] = [];

function onCmdChange(cmd: HotReloadCmdChange) {
    const path = cmd.path;
    logDebug(`Change at \"${path}\"`);

    if (path.startsWith("assets")) {
        for (const callback of assetChangeListeners) {
            callback(path);
        }
    } else if (path.startsWith("src")) {
        location.reload();
    }
}

export function observeAssetChange(callback: AssetChangeCallback) {
    assetChangeListeners.push(callback);
}