import { watch } from "fs";

import homepage from "./src/index.html";
import * as hotReload from "./hot-reload-plugin";

let watcher = watch("./src");
watcher.on("change", () => {
  hotReload.reloadAll();
});

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

  async fetch(req) {
    const upgraded = hotReload.upgrade(this, req);
    if (upgraded) {
      return upgraded;
    }

    // Return 404 for unmatched routes
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