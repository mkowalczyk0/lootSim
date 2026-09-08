# Accounts and server-side saves

Design first, ledger at the bottom. Branch `feature/accounts`, worktree `../lootSim-accounts`.

The owner's cousins play through a Tailscale Funnel and need to keep their characters
across sessions and devices, so the save moves off `localStorage` and onto the machine
that's already serving the game. Owner's constraints, final: everyone starts fresh (no
import of browser saves), username + password only, no email, no 2FA, passwords hashed.
No expiry gymnastics, rate limiting or forgot-password.

## Shape of the thing

- **Zero runtime dependencies stays true.** `node:sqlite` (`DatabaseSync`) is available
  unflagged on this machine's Node 24.14 — verified, it only prints one
  `ExperimentalWarning` line at boot — and `node:crypto`'s `scrypt` does the hashing.
- **The save blob is untouched.** The server stores exactly the string `saveRaw` used to
  hand `localStorage` — `JSON.stringify({ ...state.toJSON(), version: SAVE_VERSION })` —
  and never looks inside it. `SAVE_VERSION` does not change; `playerToJSON`'s double duty
  (save sheet and co-op wire payload) is unaffected; the wire protocol is untouched.
- **One process.** The routes ride on the Vite dev server (`npm run host`, the funneled
  one) through the same `configureServer` seam `partyRelay()` uses, and the same handler
  is mounted in `tools/relay.ts`'s standalone server, so it isn't dev-only. Logic lives in
  `tools/accounts.ts`; both hosts call `accounts.handle(req, res)` and fall through when
  it returns false.
- **Login is required. There is no guest mode.** Design call, taken: a "play locally"
  path would mean two saves per browser and a "which copy is real" bug class the whole
  feature exists to remove; the owner said everyone starts fresh anyway. The one place
  this bites is the dev `?dive=8` shortcut, which now runs after login like everything
  else. (PM informed; proceeding unless overruled.)

## Storage

`data/lootsim.sqlite` next to the repo (gitignored; `LOOTSIM_DB` overrides the path).

```sql
CREATE TABLE accounts (
  id         INTEGER PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- displayed as typed, unique case-insensitively
  password   TEXT NOT NULL,                        -- "scrypt$N$r$p$<salt b64>$<hash b64>"
  created_at INTEGER NOT NULL
);
CREATE TABLE saves (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  blob       TEXT NOT NULL,       -- the SavedGame JSON, opaque
  version    INTEGER NOT NULL,    -- lifted out of the blob for ops visibility only
  updated_at INTEGER NOT NULL
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- the cookie secret
```

Passwords: `scrypt` with N=16384, r=8, p=1, 64-byte key, 16-byte random salt, compared
with `timingSafeEqual`. Parameters are written into the stored string so they can change
later without a migration.

## Session

One signed cookie, `lootsim_session` = `<accountId>.<issuedAt>.<HMAC-SHA256(secret, "id.issuedAt")>`
in base64url. `HttpOnly; SameSite=Lax; Path=/; Max-Age=180 days`, plus `Secure` when the
request arrived over https (`x-forwarded-proto`, which is what the Funnel sets). The
secret is generated once and kept in `meta`, so a server restart doesn't log anyone out.
Stateless: logout just clears the cookie. CSRF is covered by SameSite=Lax plus
JSON-only bodies; there is no CORS and no cross-origin access.

## API — the contract with the login screen (lootsim-9f)

All routes are same-origin under `/api/`, JSON in and out, `credentials: "same-origin"`.
Every error body is `{ "error": "<code>", "message": "<one sentence for the player>" }`.
Anything that needs a session returns **401 `not_logged_in`** without one.

| Route | Body | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/me` | — | 200 `{ id, username }` | 401 |
| `POST /api/register` | `{ username, password }` | 201 `{ id, username }` + cookie | 400 `bad_username` / `bad_password`, 409 `username_taken` |
| `POST /api/login` | `{ username, password }` | 200 `{ id, username }` + cookie | 401 `bad_credentials` |
| `POST /api/logout` | — | 204, cookie cleared | — |
| `GET /api/save` | — | 200 the SavedGame JSON; 204 if none yet | 401 |
| `PUT /api/save` | the SavedGame JSON (≤ 4 MB) | 204 | 400 `bad_save`, 413 `too_large`, 401 |
| `DELETE /api/save` | — | 204 | 401 |

Rules: username 3–16 characters of `[A-Za-z0-9_]`, unique case-insensitively, shown as
typed. Password 6–72 characters, anything. Unknown `/api/*` → 404 `{ error: "not_found" }`.
Wrong method → 405.

### The client-side seam

`src/net/account.ts` (mine) exports:

```ts
export interface AccountInfo { readonly id: number; readonly username: string }
export class AccountError extends Error { readonly code: string; readonly status: number }
export class AccountClient {
  me(): Promise<AccountInfo | null>;                      // null on 401, throws on network failure
  register(username: string, password: string): Promise<AccountInfo>;  // throws AccountError
  login(username: string, password: string): Promise<AccountInfo>;     // throws AccountError
  logout(): Promise<void>;
  fetchSave(): Promise<string | null>;                    // the raw JSON text, or null when 204
  pushSave(json: string, opts?: { keepalive?: boolean }): Promise<void>;
  deleteSave(): Promise<void>;
}
```

`src/ui/login.ts` (9f; a `window.prompt` placeholder sits there until then) exports `showLogin(root: HTMLElement, account: AccountClient): Promise<AccountInfo>`
— renders the register/login screen into `#login` (9f adds the element to `index.html`
and its styles), resolves once a session exists, and shows `AccountError.message` on
failure. 9f also adds a **Log out** row to Settings in `town.ts`, calling a new
`onLogout` callback that `main.ts` wires to `account.logout()` + `location.reload()`.
Keyboard rules apply: the fields must be typeable (`isEditableTarget` in `core/input.ts`
already keeps bound keys out of text fields) and the screen must be mouse-usable.

## The save seams

`src/core/save.ts` stops knowing about `localStorage`:

- `parseSaved(text): SavedGame | null` — the existing parse + future-version guard.
- `serializeSave(data): string` — `JSON.stringify({ ...data, version: SAVE_VERSION })`.
- `interface SaveStore { write(json: string): void; flush(final?: boolean): Promise<void>; clear(): Promise<void> }`
  and `GameState.saveStore`, defaulting to an in-memory no-op so tests and tools behave.
- `GameState.fromSaved(saved: SavedGame | null)` replaces `load()`'s inner half;
  `save()` writes to the store; `wipe()` calls `store.clear()`.

`src/net/savestore.ts`: `RemoteSaveStore(account)` coalesces writes — `state.save()` is
called on every meaningful action, so writes within one second collapse into one `PUT`,
one in flight at a time, retry with backoff on failure, and an `onStatus` callback so
`main.ts` can flash "couldn't reach the server — progress not saved" once and "saved
again" when it recovers. `pagehide` / `visibilitychange` trigger a `keepalive` flush;
browsers cap keepalive bodies at 64 kB, so a large save may not make the unload flush —
acceptable because the previous action already saved a second ago.

## Boot

`main.ts` becomes `boot()`: `account.me()` → if no session, `await showLogin(...)` →
`fetchSave()` → `GameState.fromSaved(parseSaved(text))` → install the remote store →
`start(state)`, which is today's module body wrapped in a function. Nothing about the
game loop, scenes or co-op changes.

## Not in scope, on purpose

Migration of browser saves (owner: everyone starts fresh), email / 2FA / password reset,
rate limiting, session expiry management, multiple characters per account beyond what the
save already holds, serving `dist/` from the standalone server, conflict resolution for
the same account playing on two devices at once (last write wins, documented).

## Acceptance checks (`tools/smoke.ts`, `=== accounts ===`)

An in-memory database behind a real `http.createServer` on an ephemeral port, driven with
Node's `fetch`: register → cookie set and `me` works; duplicate and case-variant usernames
are 409; bad username / short password are 400; wrong password is 401; the stored
password is a scrypt string, never the plaintext; save PUT/GET round-trips byte-identical;
GET before any save is 204; DELETE then GET is 204; a forged or tampered cookie is 401;
an oversize body is 413; a non-JSON save is 400; the route handler returns false for
non-`/api` paths so the host falls through. Plus `parseSaved` / `serializeSave` /
`fromSaved` round-trip a `GameState`.

## Ledger

| Date | Item | Status |
| --- | --- | --- |
| 2026-09-08 | Design written; API contract sent to lootsim-9f; login-required call approved by PM | done |
| 2026-09-08 | **Server + seams built** | `tools/accounts.ts` (SQLite, scrypt, signed cookie, routes), mounted in `vite.config.ts` (`accounts()` plugin, dev + preview) and `tools/relay.ts` standalone. `src/net/account.ts` (`AccountClient`), `src/net/savestore.ts` (`RemoteSaveStore`, coalesced writes, retry, status). `core/save.ts` → `parseSaved` / `serializeSave` / `SaveStore` / `MemorySaveStore`, no `localStorage` anywhere. `GameState.fromSaved`, `GameState.saveStore`, `wipe()` async (reset row in Settings reloads after the DELETE lands). `main.ts` → `boot()` + `start(state, who)`; `flash` hoisted so boot can report. `src/ui/login.ts` is a **prompt() placeholder** until lootsim-9f's screen replaces it wholesale. `data/` gitignored. Verified: `=== accounts ===` smoke section (32 checks over a real HTTP server + in-memory DB) and a real `vite --port 5999` run answering `/api/*` through the middleware chain while still serving `index.html`. `SAVE_VERSION` unchanged at 16; wire untouched. |
| — | Waiting on | lootsim-9f: `src/ui/login.ts`, `#login` in `index.html` + styles, the Settings **Log out** row + `onLogout` callback. `main.ts` wiring for `onLogout` is mine once their row exists. |
