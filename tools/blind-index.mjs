#!/usr/bin/env node
/**
 * `docs/blind-instruments.md`'s index, checked against the entries it claims to index.
 *
 * The index exists because two entries were written past each other — near-identical
 * opening sentences, each announcing a new species — with no list for either author to
 * check against. An index that can quietly fall out of step with the file it indexes
 * would be that same defect one level up: a table reporting a completeness it no longer
 * has, which is the "scope had silently emptied" failure the file itself catalogues.
 *
 * The property, and the reason it is worth a tool rather than a habit: **the two counts
 * are derived independently.** Entries are parsed from the prose (the numbered paragraphs
 * under "The six", plus every `## A <ordinal> instance` heading); rows are parsed from the
 * table. Neither is derived from the other, so the check cannot be satisfied by the table
 * agreeing with itself — the bound comes from somewhere the thing under test cannot move,
 * which is the rule this document spends four entries arriving at.
 *
 * It also **prints what it walked**, for the same reason `tools/check-scripts.mjs` does.
 *
 * Plain `.mjs` on purpose: it reads one markdown file and imports nothing from `src/`, so
 * routing it through the bundler would buy nothing and put a docs check on the shared
 * bundle path that is item 6 of the very file it is checking.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "docs/blind-instruments.md";
const text = readFileSync(join(root, DOC), "utf8");
const lines = text.split("\n");

const ONES = [
  "zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
  "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth",
  "sixteenth", "seventeenth", "eighteenth", "nineteenth",
];
/** Ordinal word -> number, for "a seventh instance" through "a thirty-ninth instance". */
const ORDINALS = new Map();
for (let i = 1; i < ONES.length; i++) ORDINALS.set(ONES[i], i);
// The round ones are irregular ("twentieth", not "twentyth"), so they are spelled out; the
// compounds are regular and built from the cardinal prefix.
const TENS = [
  [20, "twenty", "twentieth"], [30, "thirty", "thirtieth"], [40, "forty", "fortieth"],
];
const UNITS = [
  "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth",
];
for (const [base, prefix, round] of TENS) {
  ORDINALS.set(round, base);
  for (let u = 1; u <= 9; u++) ORDINALS.set(`${prefix}-${UNITS[u]}`, base + u);
}

/* ---- side A: the entries, read from the prose ---------------------------------- */

/** The six are bold numbered paragraphs, and only inside their own section. */
function sixEntries() {
  const start = lines.findIndex((l) => l.trim() === "## The six");
  if (start < 0) return { found: [], sectionMissing: true };
  const found = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    const m = /^\*\*(\d+)\.\s/.exec(lines[i]);
    if (m) found.push({ n: Number(m[1]), line: i + 1, head: lines[i].slice(0, 70) });
  }
  return { found, sectionMissing: false };
}

/** Everything after them is its own section, titled with an ordinal word. */
function sectionEntries() {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^## An? ([a-z]+(?:-[a-z]+)?) instance\b/.exec(lines[i]);
    if (!m) continue;
    const n = ORDINALS.get(m[1]);
    if (n === undefined) {
      found.push({ n: null, word: m[1], line: i + 1, head: lines[i].slice(0, 90) });
      continue;
    }
    found.push({ n, line: i + 1, head: lines[i].slice(0, 90) });
  }
  return found;
}

/* ---- side B: the index rows, read from the table -------------------------------- */

const IN_FLIGHT = "*in flight*";
function indexRows() {
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\|\s*(\d+)\s*\|(.+?)\|(.+?)\|\s*$/.exec(lines[i]);
    if (!m) continue;
    rows.push({
      n: Number(m[1]),
      shape: m[2].trim(),
      inFlight: m[2].trim() === IN_FLIGHT,
      line: i + 1,
    });
  }
  return rows;
}

/* ---- compare -------------------------------------------------------------------- */

const fails = [];
const six = sixEntries();
if (six.sectionMissing) fails.push(`${DOC} has no "## The six" section — this check cannot find the first entries.`);
const sections = sectionEntries();
const entries = [...six.found, ...sections.filter((s) => s.n !== null)];
const rows = indexRows();

console.log("=== blind-instruments: the index against the entries ===");
console.log(`  walked ${entries.length} entries (${six.found.length} in "The six", ${sections.length} sections) and ${rows.length} index rows`);

// A scope that has emptied. Either side reading zero means this check stopped measuring.
if (entries.length === 0 || rows.length === 0) {
  console.error(`  FAIL  one side is empty (${entries.length} entries, ${rows.length} rows) — this check is measuring nothing.`);
  process.exit(1);
}

for (const s of sections) {
  if (s.n === null) fails.push(`line ${s.line}: "${s.word}" is not an ordinal this check knows — extend ORDINALS in tools/blind-index.mjs.\n        ${s.head}`);
}

// The collision that started all of this: two entries claiming one number.
const byNumber = new Map();
for (const e of entries) {
  const prior = byNumber.get(e.n);
  if (prior) fails.push(`entries ${prior.line} and ${e.line} both claim number ${e.n} — a duplicate ordinal is a collision git will merge cleanly.\n        ${prior.head}\n        ${e.head}`);
  else byNumber.set(e.n, e);
}
const rowByNumber = new Map();
for (const r of rows) {
  if (rowByNumber.has(r.n)) fails.push(`index rows ${rowByNumber.get(r.n).line} and ${r.line} both number ${r.n}.`);
  else rowByNumber.set(r.n, r);
}

// Every entry has a row, and it is filled in.
for (const e of entries) {
  const row = rowByNumber.get(e.n);
  if (!row) {
    fails.push(`entry ${e.n} (line ${e.line}) has no index row — adding an entry means adding its row.\n        ${e.head}`);
  } else if (row.inFlight) {
    fails.push(`entry ${e.n} is in this file but its index row (line ${row.line}) still reads "${IN_FLIGHT}" — the branch that lands an entry fills in its own row.`);
  }
}

// Every filled row has an entry. An in-flight row is allowed to have none; that is its job.
for (const r of rows) {
  if (byNumber.has(r.n)) continue;
  if (r.inFlight) continue;
  fails.push(`index row ${r.n} (line ${r.line}) names a shape with no entry in this file — name a shape from the text, not from a branch.\n        ${r.shape}`);
}

// Contiguous from 1: a gap means a number was assigned and then lost.
const max = Math.max(...rows.map((r) => r.n));
for (let n = 1; n <= max; n++) {
  if (!rowByNumber.has(n)) fails.push(`the index has no row ${n}, but has ${max} — a missing number is an entry nobody can find.`);
}

if (fails.length > 0) {
  console.error("");
  for (const f of fails) console.error(`  FAIL  ${f}`);
  console.error("");
  console.error(`  The index at the top of ${DOC} is one row per entry, naming the failure`);
  console.error("  shape. It exists so an author about to write \"a new species\" can check in");
  console.error("  ten seconds whether that species is already in the file. An index that has");
  console.error("  fallen out of step reports a completeness it does not have.");
  console.error("");
  process.exit(1);
}

const flight = rows.filter((r) => r.inFlight);
console.log(`  ok   every entry has a filled index row, and every filled row has an entry`);
console.log(`  ok   numbers 1-${max} are contiguous and unique on both sides`);
console.log(`  ok   ${flight.length} row(s) reserved for entries on unmerged branches: ${flight.map((r) => r.n).join(", ") || "none"}`);
console.log("");
console.log("ALL BLIND-INDEX CHECKS PASSED");
