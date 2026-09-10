/**
 * `npm run leaderboards` — the global leaderboards' acceptance gate (`docs/leaderboards.md`,
 * docket item 4). Part of `npm test`.
 *
 * Two things this exists to hold, corresponding to the two halves of the feature:
 *
 * 1. **`computeRecords` reduces a `GameState` honestly** — the "hardest thing actually
 *    done" rule (a depth or height carries the Challenger tier it was really banked at,
 *    never a bare number), a fresh/untouched class contributes nothing, and "strongest
 *    item" reuses `itemScore` rather than a second notion of "best" (Section 1).
 * 2. **The server enforces what `docs/accounts.md`/the design record promise**: a record
 *    can only ever improve, never regress (Section 2 — the direct assertion, not inferred
 *    from "a higher value was submitted" and "the row changed" each being individually
 *    true); unknown boards/classes/versions are refused rather than silently stored
 *    (Section 3); the ranking, the class filter and the recent feed all read back exactly
 *    what was written (Section 4).
 */
import { createServer } from "node:http";
import { GameState } from "../src/game/state";
import { Rng } from "../src/core/rng";
import { rollItem, itemScore, type Item } from "../src/game/item";
import { CLASSES } from "../src/data/classes";
import { computeRecords, RECORDS_VERSION } from "../src/net/records";
import { openAccounts } from "./accounts";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string): void {
  console.log(`\n=== ${name} ===`);
}

function testItem(rarity: Item["rarity"] = "mythic", ilvl = 30): Item {
  return rollItem({ rarity, type: "sword", ilvl, rng: new Rng(42) });
}

// --- 1. computeRecords ----------------------------------------------------------------

section("computing records from a GameState");

{
  const s = new GameState(1);
  const entries = computeRecords(s).entries;
  check("a fresh account submits nothing", entries.length === 0, `${entries.length} entries`);
}

{
  const s = new GameState(1);
  const p = s.players.lancer;
  p.deepestDepth = 24;
  p.delveChallengerBadges[4] = 24; // banked at Challenger tier 5
  p.delveChallengerBadges[9] = 12; // a shallower depth at a much higher tier — irrelevant here
  const entries = computeRecords(s).entries;
  const row = entries.find((e) => e.board === "delve");
  check("the Delve board reports the account's real deepest depth", row?.value === 24, JSON.stringify(row));
  check("…stamped with the hardest tier it was actually banked at, not just any tier that could hold it",
    row?.tier === 5, `tier ${row?.tier}`);
}

{
  const s = new GameState(1);
  const p = s.players.berserker;
  p.deepestDepth = 18; // reached with the dial off — no badge matches it
  const entries = computeRecords(s).entries;
  const row = entries.find((e) => e.board === "delve");
  check("a depth only ever reached at Challenger off reports tier 0, not a guess",
    row?.value === 18 && row.tier === 0, JSON.stringify(row));
}

{
  const s = new GameState(1);
  const p = s.players.paladin;
  p.highestHeight = 15;
  p.towerChallengerBadges[0] = 15;
  const entries = computeRecords(s).entries;
  check("a height reports on the tower board, never the delve board",
    entries.some((e) => e.board === "tower" && e.value === 15)
    && !entries.some((e) => e.board === "delve"),
    JSON.stringify(entries));
}

{
  const s = new GameState(1);
  s.players.warlock.challengerBadges.abyss = 7;
  s.players.warlock.raidChallengerBadges["the-ferryman"] = 3;
  const entries = computeRecords(s).entries;
  check("a fixed-mode badge becomes its own board, valued as the tier itself",
    entries.some((e) => e.board === "abyss" && e.value === 7 && e.tier === 7));
  check("a raid badge becomes a namespaced board of its own",
    entries.some((e) => e.board === "raid.the-ferryman" && e.value === 3 && e.tier === 3));
  check("an untouched raid/mode never contributes a zero row",
    entries.filter((e) => e.board.startsWith("raid.")).length === 1
    && entries.filter((e) => ["abyss", "hoard", "vigil", "convergence", "memory"].includes(e.board)).length === 1);
}

{
  const s = new GameState(1);
  const item = testItem("mythic");
  s.players.magician.equipment.weapon = item;
  const weak = testItem("common", 5);
  s.players.magician.equipment.armor = weak;
  const entries = computeRecords(s).entries;
  const row = entries.find((e) => e.board === "item.score" && e.classId === "magician");
  const expected = Math.max(itemScore(item, CLASSES.magician), itemScore(weak, CLASSES.magician));
  check("\"strongest item\" is the best *equipped* item, scored by the game's own itemScore",
    row?.value === expected && row.meta?.name === item.name, JSON.stringify(row));
}

{
  const s = new GameState(1);
  s.players.assassin.lifetimeMaxHit = 88420;
  const entries = computeRecords(s).entries;
  check("the max-hit board reads the persistent lifetime record",
    entries.some((e) => e.board === "damage.max" && e.classId === "assassin" && e.value === 88420));
}

// --- 2. the server never lets a record regress -----------------------------------------

section("a submitted record can only ever improve");

async function withServer<T>(fn: (base: string, accounts: ReturnType<typeof openAccounts>) => Promise<T>): Promise<T> {
  const accounts = openAccounts({ dbPath: ":memory:" });
  const server = createServer((req, res) => {
    accounts.handle(req, res).then((handled) => { if (!handled) { res.writeHead(404); res.end(); } });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    return await fn(base, accounts);
  } finally {
    server.close();
    accounts.close();
  }
}

function client(base: string) {
  const jar = { cookie: "" };
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(jar.cookie ? { cookie: jar.cookie } : {}) },
    });
    const set = res.headers.get("set-cookie");
    if (set) jar.cookie = set.split(";")[0]!;
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, json };
  };
}

await withServer(async (base) => {
  const call = client(base);
  await call("POST", "/api/register", { username: "Rec_One", password: "hunter22222" });

  let r = await call("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "delve", classId: "lancer", tier: 3, value: 20 }],
  });
  check("a well-formed submission is accepted", r.status === 204);

  r = await call("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "delve", classId: "lancer", tier: 1, value: 12 }],
  });
  check("a worse resubmission is accepted (not rejected)…", r.status === 204);

  r = await call("GET", "/api/leaderboard/delve");
  const rows = r.json as { classId: string; value: number; tier: number }[];
  const row = rows.find((x) => x.classId === "lancer");
  check("…but the stored record never actually moved backward", row?.value === 20 && row.tier === 3, JSON.stringify(row));

  r = await call("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "delve", classId: "lancer", tier: 5, value: 27 }],
  });
  r = await call("GET", "/api/leaderboard/delve");
  const better = (r.json as { classId: string; value: number }[]).find((x) => x.classId === "lancer");
  check("a genuinely better submission does replace it", better?.value === 27);
});

// --- 3. validation ----------------------------------------------------------------------

section("the server refuses what it doesn't recognise, rather than storing it");

await withServer(async (base) => {
  const call = client(base);
  await call("POST", "/api/register", { username: "Rec_Two", password: "hunter22222" });

  let r = await call("POST", "/api/records", { v: 999, entries: [] });
  check("an unrecognised payload version is refused", r.status === 400 && (r.json as { error: string }).error === "bad_version");

  r = await call("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "not-a-real-board", classId: "lancer", tier: 1, value: 1 }],
  });
  check("an unknown board id is refused", r.status === 400);

  r = await call("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "delve", classId: "not-a-class", tier: 1, value: 1 }],
  });
  check("an unknown class id is refused", r.status === 400);

  r = await call("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "delve", classId: "lancer", tier: 99, value: 1 }],
  });
  check("a Challenger tier past the ceiling is refused", r.status === 400);

  r = await call("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "delve", classId: "lancer", tier: 1, value: -5 }],
  });
  check("a negative value is refused", r.status === 400);

  r = await call("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "delve", classId: "lancer", tier: 1, value: 1e20 }],
  });
  check("an absurd value past the sanity cap is refused", r.status === 400);

  r = await call("POST", "/api/records", {
    v: RECORDS_VERSION,
    entries: Array.from({ length: 500 }, () => ({ board: "delve", classId: "lancer", tier: 1, value: 1 })),
  });
  check("an oversized batch is refused", r.status === 400);

  r = await call("GET", "/api/leaderboard/not-a-real-board");
  check("reading an unknown board is a 404, not an empty list masquerading as one", r.status === 404);

  const jar2 = client(base);
  r = await jar2("POST", "/api/records", { v: RECORDS_VERSION, entries: [] });
  check("submitting without a session is refused, same as every other write", r.status === 401);
  r = await jar2("GET", "/api/leaderboard/delve");
  check("reading a board without a session is refused too — no guest mode, same as everywhere else", r.status === 401);
});

// --- 4. ranking, class filter and the recent feed ----------------------------------------

section("ranking, the class filter, and the recent-records feed");

await withServer(async (base) => {
  const alice = client(base);
  await alice("POST", "/api/register", { username: "Alice_LB", password: "hunter22222" });
  let setup = await alice("POST", "/api/records", {
    v: RECORDS_VERSION,
    entries: [
      { board: "tower", classId: "lancer", tier: 2, value: 30 },
      { board: "tower", classId: "paladin", tier: 0, value: 10 },
    ],
  });
  check("(setup) Alice's two-entry submission is accepted", setup.status === 204, String(setup.status));
  const bob = client(base);
  await bob("POST", "/api/register", { username: "Bob_LB", password: "hunter22222" });
  setup = await bob("POST", "/api/records", {
    v: RECORDS_VERSION, entries: [{ board: "tower", classId: "lancer", tier: 6, value: 45 }],
  });
  check("(setup) Bob's submission is accepted", setup.status === 204, String(setup.status));

  let r = await alice("GET", "/api/leaderboard/tower");
  const all = r.json as { username: string; value: number }[];
  check("the board ranks best first, across every account",
    all[0]?.username === "Bob_LB" && all[0]?.value === 45 && all[1]?.username === "Alice_LB" && all[1]?.value === 30,
    JSON.stringify(all));

  r = await alice("GET", "/api/leaderboard/tower?class=paladin");
  const filtered = r.json as { username: string; classId: string }[];
  check("the class filter narrows to just that class, across every account",
    filtered.length === 1 && filtered[0]?.username === "Alice_LB" && filtered[0]?.classId === "paladin",
    JSON.stringify(filtered));

  r = await alice("GET", "/api/leaderboard-recent?limit=2");
  const recent = r.json as { board: string; username: string }[];
  check("the recent feed reads back the newest rows first", recent.length === 2, JSON.stringify(recent));
});

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
