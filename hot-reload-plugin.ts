import { plugin, type BunPlugin, type Server, type ServerWebSocket } from "bun";

type ChangeCallback = (ws: ServerWebSocket<any>) => Promise<void>;

const callbackMap = new Map<ServerWebSocket<any>, ChangeCallback>();

const reloadCommand = "reload";

const makeLiveReloadScript = (wsUrl: string) => `
<!-- start bun live reload script -->
<script type="text/javascript">
    const socket = new WebSocket(\`ws://\${location.host}/${wsUrl}\`);
    socket.onmessage = (msg) => {
        if (msg.data === '${reloadCommand}') {
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
    callbackMap.set(ws, async (ws) => {
        ws.send(reloadCommand);
    });
}

export function reloadAll() {
    for (let [ws, callback] of callbackMap) {
        callback(ws);
    }
}

export function close<T>(ws: ServerWebSocket<T>) {
    callbackMap.delete(ws);
}

plugin(myPlugin);

export default myPlugin;