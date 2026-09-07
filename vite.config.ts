import type { Plugin } from "vite";

import { attachRelay } from "./tools/relay";

/**
 * The multiplayer relay rides along on the dev server.
 *
 * This is the whole reason there is nothing to set up: `npm run host` serves the game
 * *and* the party relay on one port, so a cousin opens the URL on their laptop and the
 * WebSocket they connect back to is the same origin they loaded the page from. No
 * second process, no config file, no account, no third-party service.
 *
 * Vite's own HMR socket lives on this port too — the handler only ever answers requests
 * for `NET_PATH` and leaves every other upgrade alone.
 */
function partyRelay(): Plugin {
  return {
    name: "lootsim-party-relay",
    configureServer(server) {
      if (!server.httpServer) return;
      attachRelay(server.httpServer, (m) => server.config.logger.info(`  [party] ${m}`));
      // Worth saying out loud: whoever runs the dev server is also hosting multiplayer,
      // and the address below is the one to read out to everybody else.
      server.config.logger.info("  party relay ready — share the Network address to play together");
    },
    configurePreviewServer(server) {
      if (server.httpServer) attachRelay(server.httpServer, (m) => console.log(`[party] ${m}`));
    },
  };
}

export default {
  plugins: [partyRelay()],
  server: {
    // `npm run host` is the intended way in, but plain `npm run dev` should be reachable
    // from another laptop on the same network too — that's the entire point.
    host: true,
  },
};
