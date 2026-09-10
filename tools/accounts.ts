/**
 * Accounts and server-side saves — the half of persistence that runs on the machine
 * serving the game.
 *
 * A username, a scrypt-hashed password, and one save blob per account, in a SQLite file
 * next to the repo. The blob is exactly the string `GameState.save()` used to hand to
 * `localStorage`; the server never looks inside it, which is what keeps `SAVE_VERSION`
 * and the co-op wire format out of this file's business.
 *
 * Like `relay.ts`, it is dependency-free on purpose: `node:sqlite` and `node:crypto` are
 * both built in (Node 24 ships SQLite unflagged), so the project's zero-runtime-deps
 * stance survives growing a database. And like the relay it rides on whatever HTTP
 * server is already running — the Vite dev server in `vite.config.ts`, or the standalone
 * relay — through one `handle(req, res)` that answers `/api/*` and returns false for
 * everything else so the host can fall through.
 *
 * Deliberately small (owner's call): no email, no 2FA, no password reset, no rate
 * limiting, no session expiry management. Passwords are hashed regardless.
 *
 * The `records` table (below) is the global leaderboards (`docs/leaderboards.md`) and is
 * the one deliberate exception to "the server never looks inside a save" — except it
 * isn't an exception at all: it never touches the `saves` table or the blob in it. A
 * record is a short list of plain scalars (`{ classId, board, tier, value, meta? }`) the
 * client computes from its own already-loaded save and posts to its own endpoint,
 * versioned on its own (`RECORDS_VERSION` below, independent of `SAVE_VERSION`). This
 * file validates shape — known class ids, known board ids, numbers in sane ranges — the
 * same kind of check `register` already does on a username, not a save parser.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const API_PREFIX = "/api/";
export const SESSION_COOKIE = "lootsim_session";
/** A save is a few hundred kB at the very most; anything near this is a bug or an attack. */
export const MAX_SAVE_BYTES = 4 * 1024 * 1024;
/** Six months. Nobody should have to log in on the family laptop twice a year. */
const SESSION_MAX_AGE_S = 180 * 24 * 3600;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72;

// --- leaderboards (`docs/leaderboards.md`) -----------------------------------------
// Mirrors `src/net/records.ts` / `src/data/classes.ts` / `src/data/raids.ts`. A small,
// stated duplication rather than an import from `src/` — the same call `ShopRarity`
// already made — so this file's only dependency stays `node:*`. A new board or a new
// class needs one line here and one line there; `tools/leaderboards.ts` asserts the two
// class lists agree.
export const RECORDS_VERSION = 1;
const MAX_RECORD_TIER = 20; // src/data/challenger.ts's MAX_CHALLENGER_TIER
const MAX_RECORD_ENTRIES = 200;
const MAX_META_BYTES = 300;
const MAX_RECORD_VALUE = 1e12;
export const KNOWN_CLASS_IDS = [
  "lancer", "berserker", "swordsman", "magician", "shaman",
  "ranger", "juggernaut", "duelist", "warlock", "monk",
  "necromancer", "corsair", "trickster", "reaper", "stormcaller",
  "paladin", "bard", "alchemist", "engineer", "assassin", "warden",
] as const;
const FIXED_BOARDS = new Set([
  "delve", "tower", "abyss", "hoard", "vigil", "convergence", "memory", "item.score", "damage.max",
]);
const RAID_IDS = new Set([
  "tyrant-of-the-first-heavens", "minotaur-of-the-ninth-labyrinth", "the-ferryman", "queen-of-the-seventh-circle",
]);
function isKnownBoard(board: string): boolean {
  if (FIXED_BOARDS.has(board)) return true;
  return board.startsWith("raid.") && RAID_IDS.has(board.slice("raid.".length));
}

/** Where the database lives unless `LOOTSIM_DB` says otherwise: `data/` next to the repo. */
export function defaultDbPath(root: string = process.cwd()): string {
  return process.env.LOOTSIM_DB ?? resolve(root, "data", "lootsim.sqlite");
}

export interface AccountsOptions {
  /** File path, or `":memory:"` for tests. */
  readonly dbPath: string;
  readonly log?: (message: string) => void;
  /** Injected clock, for tests. Milliseconds. */
  readonly now?: () => number;
}

export interface Accounts {
  /** Answers `/api/*`; returns false for any other path so the host serves it. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  close(): void;
  /** For the acceptance test to look at what was actually stored. */
  readonly db: DatabaseSync;
}

interface AccountRow {
  id: number;
  username: string;
  password: string;
}

export function openAccounts(opts: AccountsOptions): Accounts {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? Date.now;
  if (opts.dbPath !== ":memory:") mkdirSync(dirname(opts.dbPath), { recursive: true });
  const db = new DatabaseSync(opts.dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id         INTEGER PRIMARY KEY,
      username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password   TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saves (
      account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      blob       TEXT NOT NULL,
      version    INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      class_id   TEXT NOT NULL,
      board      TEXT NOT NULL,
      tier       INTEGER NOT NULL,
      value      REAL NOT NULL,
      meta       TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, class_id, board)
    );
  `);
  const secret = sessionSecret(db);
  // A well-formed hash of nothing in particular, so a login attempt against a name that
  // doesn't exist still pays the full scrypt cost — otherwise the *time* a wrong guess
  // takes would say which names are real even though the answer never does.
  const decoyHash = hashPassword(randomBytes(12).toString("base64url"));

  const findByName = db.prepare("SELECT id, username, password FROM accounts WHERE username = ? COLLATE NOCASE");
  const findById = db.prepare("SELECT id, username, password FROM accounts WHERE id = ?");
  const insertAccount = db.prepare("INSERT INTO accounts (username, password, created_at) VALUES (?, ?, ?)");
  const readSave = db.prepare("SELECT blob, updated_at FROM saves WHERE account_id = ?");
  const upsertSave = db.prepare(`
    INSERT INTO saves (account_id, blob, version, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET blob = excluded.blob, version = excluded.version, updated_at = excluded.updated_at
  `);
  const deleteSave = db.prepare("DELETE FROM saves WHERE account_id = ?");
  const findRecord = db.prepare("SELECT value FROM records WHERE account_id = ? AND class_id = ? AND board = ?");
  const upsertRecord = db.prepare(`
    INSERT INTO records (account_id, class_id, board, tier, value, meta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, class_id, board) DO UPDATE SET
      tier = excluded.tier, value = excluded.value, meta = excluded.meta, updated_at = excluded.updated_at
  `);
  const selectBoard = db.prepare(`
    SELECT r.class_id, r.tier, r.value, r.meta, r.updated_at, a.username FROM records r
    JOIN accounts a ON a.id = r.account_id
    WHERE r.board = ? ORDER BY r.value DESC, r.updated_at ASC LIMIT ?
  `);
  const selectBoardByClass = db.prepare(`
    SELECT r.class_id, r.tier, r.value, r.meta, r.updated_at, a.username FROM records r
    JOIN accounts a ON a.id = r.account_id
    WHERE r.board = ? AND r.class_id = ? ORDER BY r.value DESC, r.updated_at ASC LIMIT ?
  `);
  const selectRecent = db.prepare(`
    SELECT r.board, r.class_id, r.tier, r.value, r.meta, r.updated_at, a.username FROM records r
    JOIN accounts a ON a.id = r.account_id
    ORDER BY r.updated_at DESC LIMIT ?
  `);

  // --- sessions ------------------------------------------------------------

  function sign(id: number, issuedAt: number): string {
    return createHmac("sha256", secret).update(`${id}.${issuedAt}`).digest("base64url");
  }

  function sessionCookie(id: number, req: IncomingMessage): string {
    const issuedAt = Math.floor(now() / 1000);
    const value = `${id}.${issuedAt}.${sign(id, issuedAt)}`;
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_S}${secureFlag(req)}`;
  }

  function clearedCookie(req: IncomingMessage): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`;
  }

  /** The account the request's cookie belongs to, or null if there isn't a valid one. */
  function sessionAccount(req: IncomingMessage): AccountRow | null {
    const raw = cookieValue(req.headers.cookie, SESSION_COOKIE);
    if (!raw) return null;
    const [idText, iatText, sig] = raw.split(".");
    if (!idText || !iatText || !sig) return null;
    const id = Number(idText);
    const issuedAt = Number(iatText);
    if (!Number.isInteger(id) || !Number.isInteger(issuedAt)) return null;
    if (issuedAt + SESSION_MAX_AGE_S < Math.floor(now() / 1000)) return null;
    const expected = Buffer.from(sign(id, issuedAt));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return (findById.get(id) as AccountRow | undefined) ?? null;
  }

  // --- routes -----------------------------------------------------------------

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = (req.url ?? "/").split("?")[0]!;
    if (!path.startsWith(API_PREFIX)) return false;
    const route = path.slice(API_PREFIX.length);
    const method = req.method ?? "GET";
    try {
      // Leaderboard reads carry the board id in the path (`leaderboard/<board>`), which a
      // plain `switch (route)` below can't match — handled first, same session/method
      // rules as every other route.
      if (route.startsWith("leaderboard/")) {
        if (method !== "GET") return methodNotAllowed(res, "GET");
        if (!sessionAccount(req)) return notLoggedIn(res);
        const board = decodeURIComponent(route.slice("leaderboard/".length));
        if (!isKnownBoard(board)) return json(res, 404, { error: "not_found", message: "No such board." });
        const q = new URL(req.url ?? "/", "http://internal").searchParams;
        const classId = q.get("class");
        if (classId && !(KNOWN_CLASS_IDS as readonly string[]).includes(classId)) {
          return json(res, 400, { error: "bad_class", message: "Unknown class." });
        }
        const limit = clampLimit(q.get("limit"), 25, 100);
        const rows = classId ? selectBoardByClass.all(board, classId, limit) : selectBoard.all(board, limit);
        return json(res, 200, (rows as unknown as RecordRow[]).map(rowToLeaderboardJson));
      }
      if (route === "leaderboard-recent") {
        if (method !== "GET") return methodNotAllowed(res, "GET");
        if (!sessionAccount(req)) return notLoggedIn(res);
        const q = new URL(req.url ?? "/", "http://internal").searchParams;
        const limit = clampLimit(q.get("limit"), 20, 50);
        const rows = selectRecent.all(limit) as unknown as (RecordRow & { board: string })[];
        return json(res, 200, rows.map((r) => ({ board: r.board, ...rowToLeaderboardJson(r) })));
      }
      switch (route) {
        case "me": {
          if (method !== "GET") return methodNotAllowed(res, "GET");
          const account = sessionAccount(req);
          if (!account) return notLoggedIn(res);
          return json(res, 200, publicInfo(account));
        }
        case "register": {
          if (method !== "POST") return methodNotAllowed(res, "POST");
          const body = await readJson(req, res);
          if (body === undefined) return true;
          const username = typeof body.username === "string" ? body.username.trim() : "";
          const password = typeof body.password === "string" ? body.password : "";
          if (!USERNAME_RE.test(username)) {
            return json(res, 400, { error: "bad_username", message: "A name is 3 to 16 letters, numbers or underscores." });
          }
          if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
            return json(res, 400, { error: "bad_password", message: `A password is ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.` });
          }
          if (findByName.get(username)) {
            return json(res, 409, { error: "username_taken", message: "Somebody already answers to that name." });
          }
          let id: number;
          try {
            id = Number(insertAccount.run(username, hashPassword(password), now()).lastInsertRowid);
          } catch (err) {
            // Two registrations racing for one name: the UNIQUE index decides.
            if (String(err).includes("UNIQUE")) {
              return json(res, 409, { error: "username_taken", message: "Somebody already answers to that name." });
            }
            throw err;
          }
          log(`registered ${username}`);
          res.setHeader("Set-Cookie", sessionCookie(id, req));
          return json(res, 201, { id, username });
        }
        case "login": {
          if (method !== "POST") return methodNotAllowed(res, "POST");
          const body = await readJson(req, res);
          if (body === undefined) return true;
          const username = typeof body.username === "string" ? body.username.trim() : "";
          const password = typeof body.password === "string" ? body.password : "";
          const account = findByName.get(username) as AccountRow | undefined;
          // One answer — and one cost — for a wrong password and an unknown name, so the
          // login box can't be used to list who plays here, by body or by stopwatch.
          const matches = verifyPassword(password, account?.password ?? decoyHash);
          if (!account || !matches) {
            return json(res, 401, { error: "bad_credentials", message: "That name and password don't go together." });
          }
          log(`${account.username} logged in`);
          res.setHeader("Set-Cookie", sessionCookie(account.id, req));
          return json(res, 200, publicInfo(account));
        }
        case "logout": {
          if (method !== "POST") return methodNotAllowed(res, "POST");
          res.setHeader("Set-Cookie", clearedCookie(req));
          return empty(res, 204);
        }
        case "save": {
          const account = sessionAccount(req);
          if (!account) return notLoggedIn(res);
          if (method === "GET") {
            const row = readSave.get(account.id) as { blob: string; updated_at: number } | undefined;
            if (!row) return empty(res, 204);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("X-Save-Updated", String(row.updated_at));
            res.end(row.blob);
            return true;
          }
          if (method === "PUT") {
            const text = await readBody(req, res);
            if (text === undefined) return true;
            const version = saveVersionOf(text);
            if (version === null) {
              return json(res, 400, { error: "bad_save", message: "That isn't a save this server recognises." });
            }
            upsertSave.run(account.id, text, version, now());
            return empty(res, 204);
          }
          if (method === "DELETE") {
            deleteSave.run(account.id);
            log(`${account.username} wiped their save`);
            return empty(res, 204);
          }
          return methodNotAllowed(res, "GET, PUT, DELETE");
        }
        case "records": {
          if (method !== "POST") return methodNotAllowed(res, "POST");
          const account = sessionAccount(req);
          if (!account) return notLoggedIn(res);
          const body = await readJson(req, res);
          if (body === undefined) return true;
          if (body.v !== RECORDS_VERSION) {
            return json(res, 400, { error: "bad_version", message: "This client speaks a records format the server doesn't." });
          }
          const entries = body.entries;
          if (!Array.isArray(entries) || entries.length > MAX_RECORD_ENTRIES) {
            return json(res, 400, { error: "bad_request", message: "That request wasn't shaped right." });
          }
          const now_ = now();
          for (const raw of entries as unknown[]) {
            const e = validateEntry(raw);
            if (!e) return json(res, 400, { error: "bad_entry", message: "One of those records wasn't shaped right." });
            const existing = findRecord.get(account.id, e.classId, e.board) as { value: number } | undefined;
            if (!existing || e.value > existing.value) {
              upsertRecord.run(account.id, e.classId, e.board, e.tier, e.value, e.meta, now_);
            }
          }
          return empty(res, 204);
        }
        default:
          return json(res, 404, { error: "not_found", message: "No such door." });
      }
    } catch (err) {
      log(`error on ${method} ${path}: ${String(err)}`);
      if (!res.headersSent) json(res, 500, { error: "server_error", message: "The server tripped over something. Try again." });
      else res.end();
      return true;
    }
  }

  return {
    handle,
    close: () => db.close(),
    db,
  };
}

// --- passwords ------------------------------------------------------------------
// Stored as "scrypt$N$r$p$<salt>$<hash>" so the parameters can change later without a
// migration: each row says how it was hashed.

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !N || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const given = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// --- helpers ----------------------------------------------------------------------

function sessionSecret(db: DatabaseSync): string {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'session_secret'").get() as { value: string } | undefined;
  if (row) return row.value;
  const secret = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO meta (key, value) VALUES ('session_secret', ?)").run(secret);
  return secret;
}

function publicInfo(account: AccountRow): { id: number; username: string } {
  return { id: account.id, username: account.username };
}

/** `Secure` when the request came in over TLS — the Funnel says so in a header. */
function secureFlag(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const tls = (req.socket as { encrypted?: boolean }).encrypted === true;
  return proto === "https" || tls ? "; Secure" : "";
}

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/** The `version` a save blob claims, or null if the body isn't a save-shaped object. */
function saveVersionOf(text: string): number | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const version = (parsed as { version?: unknown }).version;
    return typeof version === "number" && Number.isFinite(version) ? version : null;
  } catch {
    return null;
  }
}

// --- leaderboards helpers ---------------------------------------------------------

interface RecordRow { class_id: string; tier: number; value: number; meta: string; updated_at: number; username: string }

function rowToLeaderboardJson(r: RecordRow): {
  username: string; classId: string; tier: number; value: number; meta: unknown; updatedAt: number;
} {
  let meta: unknown = {};
  try { meta = JSON.parse(r.meta); } catch { /* stored value is always ours; belt and braces */ }
  return { username: r.username, classId: r.class_id, tier: r.tier, value: r.value, meta, updatedAt: r.updated_at };
}

/** `Number(null)` is `0`, not `NaN` — a bare `Number(raw)` would silently turn "no limit
 *  given" into `LIMIT 1` rather than the fallback. Caught by `npm run leaderboards`. */
function clampLimit(raw: string | null, fallback: number, max: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

interface ValidEntry { classId: string; board: string; tier: number; value: number; meta: string }

/** Everything this server is willing to store about one submitted record: a known class,
 *  a known board, a tier in range, a finite non-negative value under the sanity cap, and
 *  a small `meta` object (display-only — never read back to decide anything). Anything
 *  else about the entry — how the value was computed, what save it came from — is not
 *  this function's business, and never will be; that's the seam `docs/leaderboards.md`
 *  and the file header above are about. */
function validateEntry(raw: unknown): ValidEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const classId = typeof e.classId === "string" ? e.classId : "";
  if (!(KNOWN_CLASS_IDS as readonly string[]).includes(classId)) return null;
  const board = typeof e.board === "string" ? e.board : "";
  if (!isKnownBoard(board)) return null;
  const tier = e.tier;
  if (typeof tier !== "number" || !Number.isInteger(tier) || tier < 0 || tier > MAX_RECORD_TIER) return null;
  const value = e.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_RECORD_VALUE) return null;
  let metaText = "{}";
  if (e.meta !== undefined) {
    if (typeof e.meta !== "object" || e.meta === null || Array.isArray(e.meta)) return null;
    metaText = JSON.stringify(e.meta);
    if (Buffer.byteLength(metaText, "utf8") > MAX_META_BYTES) return null;
  }
  return { classId, board, tier, value, meta: metaText };
}

/** The whole body as text, or undefined after answering 413 itself. */
function readBody(req: IncomingMessage, res: ServerResponse): Promise<string | undefined> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_SAVE_BYTES) {
        done = true;
        json(res, 413, { error: "too_large", message: "That's far bigger than any save should be." });
        req.destroy();
        resolveBody(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", () => {
      if (done) return;
      done = true;
      resolveBody(undefined);
    });
  });
}

/** A JSON object body, or undefined after answering 400 / 413 itself. */
async function readJson(req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | undefined> {
  const text = await readBody(req, res);
  if (text === undefined) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  json(res, 400, { error: "bad_request", message: "That request wasn't shaped right." });
  return undefined;
}

function json(res: ServerResponse, status: number, body: object): true {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
  return true;
}

function empty(res: ServerResponse, status: number): true {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.end();
  return true;
}

function notLoggedIn(res: ServerResponse): true {
  return json(res, 401, { error: "not_logged_in", message: "You're not logged in." });
}

function methodNotAllowed(res: ServerResponse, allow: string): true {
  res.setHeader("Allow", allow);
  return json(res, 405, { error: "method_not_allowed", message: "Not like that." });
}
