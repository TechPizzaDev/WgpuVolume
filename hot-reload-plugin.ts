import { plugin, type BunPlugin, type Server, type ServerWebSocket } from "bun";

export type HotReloadCmdChange = { kind: "change", path: string };
export type HotReloadCmd = HotReloadCmdChange;

const openSockets = new Set<ServerWebSocket<any>>();

const changeTimers = new Map<string, Timer>();
const changeTimeout = 50; // milliseconds between sending command

const myPlugin: BunPlugin = {
    name: "hot-reload-plugin",
    target: "bun",
    setup({ }) {
    },
};

export function upgrade(
    server: Server,
    request: Request,
): Response | undefined {
    const upgraded = server.upgrade(request);
    if (!upgraded) {
        return new Response(
            "Failed to upgrade websocket connection for live reload.",
            { status: 400 }
        );
    }
}

export function open<T>(ws: ServerWebSocket<T>) {
    openSockets.add(ws);
}

export function notifyChange(path: string) {
    if (changeTimers.has(path)) {
        return;
    }

    changeTimers.set(path, setTimeout(() => {
        changeTimers.delete(path);

        const cmd: HotReloadCmdChange = { kind: "change", path };
        const cmdJson = JSON.stringify(cmd);
        
        for (const ws of openSockets) {
            ws.send(cmdJson);
        }
    }, changeTimeout));
}

export function close<T>(ws: ServerWebSocket<T>) {
    openSockets.delete(ws);
}

plugin(myPlugin);

export default myPlugin;