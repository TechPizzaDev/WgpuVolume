import { plugin, type BunPlugin, type Server, type ServerWebSocket } from "bun";

type ChangeCallback = (ws: ServerWebSocket<any>, path: string) => Promise<void>;

const changeCallbacks = new Map<ServerWebSocket<any>, ChangeCallback>();
const changeTimers = new Map<string, Timer>();
const changeTimeout = 50; // milliseconds between sending command

const changeCommand = "change";

const makeLiveReloadScript = (wsUrl: string) => `
<!-- start bun live reload script -->
<script type="text/javascript">
    const socket = new WebSocket(\`ws://\${location.host}/${wsUrl}\`);
    socket.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.cmd === '${changeCommand}') {
            location.reload()
        }
    };
    console.log('Live reload enabled.');
</script>
<!-- end bun live reload script -->
`;

const wsPath = "__bun_live_reload_websocket__";

const myPlugin: BunPlugin = {
    name: "hot-reload-plugin",
    target: "bun",
    setup({ onLoad }) {
        const liveReloadScript = makeLiveReloadScript(wsPath);

        const rewriter = new HTMLRewriter();
        rewriter.onDocument({
            end(end) {
                end.append(liveReloadScript, {
                    html: true
                });
            },
        })

        onLoad({ filter: /\.html$/ }, async args => {
            const html = await Bun.file(args.path).text();
            return {
                contents: rewriter.transform(html),
                loader: "html",
            };
        });
    },
};

export function upgrade(
    server: Server,
    request: Request,
): Response | undefined {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname !== '/' + wsPath) {
        return;
    }

    const upgraded = server.upgrade(request);
    if (!upgraded) {
        return new Response(
            "Failed to upgrade websocket connection for live reload.",
            { status: 400 }
        );
    }
}

export function open<T>(ws: ServerWebSocket<T>) {
    changeCallbacks.set(ws, async (ws, path) => {
        let msg = JSON.stringify({ cmd: changeCommand, path });
        ws.send(msg);
    });
}

export function notifyChange(path: string) {
    if (changeTimers.has(path)) {
        return;
    }

    changeTimers.set(path, setTimeout(() => {
        changeTimers.delete(path);

        for (let [ws, callback] of changeCallbacks) {
            callback(ws, path);
        }
    }, changeTimeout));
}

export function close<T>(ws: ServerWebSocket<T>) {
    changeCallbacks.delete(ws);
}

plugin(myPlugin);

export default myPlugin;