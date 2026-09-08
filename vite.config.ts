import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

import { defaultDbPath, openAccounts } from "./tools/accounts";
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

/**
 * Accounts and saves ride along the same way (`docs/accounts.md`): `/api/*` is answered
 * by `tools/accounts.ts` before Vite's own middleware sees it, against a SQLite file in
 * `data/` next to this config. Same reason as the relay — the funneled dev server is the
 * one process everybody actually reaches, so that's where the saves have to live.
 */
function accounts(): Plugin {
  const dbPath = defaultDbPath(fileURLToPath(new URL(".", import.meta.url)));
  return {
    name: "lootsim-accounts",
    configureServer(server) {
      const store = openAccounts({ dbPath, log: (m) => server.config.logger.info(`  [accounts] ${m}`) });
      server.middlewares.use((req, res, next) => {
        store.handle(req, res).then((handled) => { if (!handled) next(); }, next);
      });
      server.httpServer?.once("close", () => store.close());
      server.config.logger.info(`  accounts ready — saves in ${dbPath}`);
    },
    configurePreviewServer(server) {
      const store = openAccounts({ dbPath, log: (m) => console.log(`[accounts] ${m}`) });
      server.middlewares.use((req, res, next) => {
        store.handle(req, res).then((handled) => { if (!handled) next(); }, next);
      });
    },
  };
}

export default {
  plugins: [partyRelay(), accounts()],
  server: {
    // `npm run host` is the intended way in, but plain `npm run dev` should be reachable
    // from another laptop on the same network too — that's the entire point.
    host: true,
    port: 5173,
    // Fail loudly instead of quietly moving to 5174. Vite's default is to hunt for the
    // next free port, which meant a second `npm run dev` in another terminal came up as
    // a whole second copy of the game rather than an error — and since the two are
    // usually different checkouts, you end up playing a build you didn't just change and
    // concluding the change didn't work. One port, one game, one relay.
    strictPort: true,
    // Vite checks the request's Host header against this list (DNS-rebinding guard) and
    // otherwise only allows localhost — a Tailscale Funnel request arrives with the
    // tailnet hostname, so it's rejected without this. The leading dot covers every
    // machine name on the tailnet, present or future, rather than one hardcoded host.
    allowedHosts: [".tailb8527c.ts.net"],
  },
};
