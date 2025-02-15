import { watch, type FSWatcher } from "fs";
import { join, normalize } from "path";

import homepage from "./src/index.html";
import * as hotReload from "./hot-reload-plugin";
import { WS_PATH } from "./src/HotReload";

function registerWatcher(path: string, onChange: (path: string) => Promise<void>): FSWatcher {
  let listener = async (_ev: string, filename: string | Buffer) => {
    if (filename as string) {
      let fullPath = join(path, filename as string);
      let normPath = normalize(fullPath).replaceAll('\\', '/');
      await onChange(normPath);
    }
  };

  let watcher = watch(path, { recursive: true });
  watcher.on("change", listener);
  watcher.on("rename", listener);
  return watcher;
}

registerWatcher("./src", async (path) => hotReload.notifyChange(path));
registerWatcher("./assets", async (path) => hotReload.notifyChange(path));

Bun.serve({
  port: 3000,

  // Enable development mode for:
  // - Detailed error messages
  // - Rebuild on request
  development: true,

  // Add HTML imports to `static`
  static: {
    // Bundle & route index.html to "/"
    "/": homepage,
  },

  async fetch(request) {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname === '/' + WS_PATH) {
      const upgraded = hotReload.upgrade(this, request);
      if (upgraded) {
        return upgraded;
      }
    }

    const file = Bun.file("." + reqUrl.pathname);
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(ws) {
      hotReload.open(ws);
    },
    message(ws, message) {
    },
    close(ws, code, reason) {
      hotReload.close(ws);
    }
  }
});