/**
 * The sharp-vs-reckless campaign comparison, re-run on a **disjoint seed block**.
 *
 * Not part of `npm test` and not a gate. It exists to pay for the one measurement CLAUDE.md
 * names as unpaid: `CAMPAIGN_SEEDS` was widened to 5x its old sample on a single sweep, and
 * **nobody has run a second, disjoint sweep at that same width** to find out whether the new
 * size sits on the noise floor's plateau or its own edge. That is the two-pass discipline the
 * telegraph-check lesson asks for, and the widening never received it.
 *
 * Use it for either of the two questions that need a block rather than an argument:
 *
 *  - **Is the current width enough?** Run it on master. A margin close to the gate's bar of
 *    1 means the 60-seed sample is near its edge, not comfortably past it.
 *  - **Did my change move the comparison, or did the seeds?** Run it on both trees at the
 *    *same* offset. Negative on both is the documented thinness; negative on only yours is a
 *    systematic shift and wants understanding before it ships. A second block on one tree
 *    cannot tell those apart, which is the mistake this file exists to make cheap to avoid.
 *
 * **A written argument is not evidence.** If you are talking a red campaign check down,
 * measure the thing the argument claims.
 *
 * `node tools/run-tool.mjs campaignblock [offset]`  (~14 min at the current width)
 */
import { CAMPAIGN_SEEDS, campaign } from "./bot";

// The block is **derived from `CAMPAIGN_SEEDS`, never authored alongside it**: same count,
// same five-group shape, same 733 stride, displaced clear of it. An authored size is exactly
// how "a second sweep at the same sizes" quietly becomes a sweep at half the size the next
// time somebody widens the constant — the same shape as a bound that grows to fit whatever it
// is handed. If the constant's own layout ever stops matching this, the assertions below say
// so rather than measuring something else.
const GROUPS = 5;
const PER_GROUP = CAMPAIGN_SEEDS.length / GROUPS;
const STRIDE = 733;
const offset = Number(process.argv[2] ?? 1000000);

if (!Number.isInteger(PER_GROUP)) {
  console.error(`CAMPAIGN_SEEDS has ${CAMPAIGN_SEEDS.length} seeds, not a multiple of ${GROUPS} `
    + "groups — this harness mirrors its layout and can no longer derive it. Fix the layout "
    + "assumption here rather than rounding it.");
  process.exit(2);
}

const blockAt = (base: number) => Array.from({ length: GROUPS }, (_, g) =>
  Array.from({ length: PER_GROUP }, (_, i) => base + g * 100000 + i * STRIDE)).flat();

// **The mirror proves itself.** Built at `CAMPAIGN_SEEDS`' own base, this construction must
// reproduce `CAMPAIGN_SEEDS` exactly — so "same shape, displaced" is a verified claim rather
// than a hopeful comment, and a future edit to that constant's layout fails here instead of
// silently yielding a block that is merely similar to it. Free: no campaign runs involved.
const BASE = CAMPAIGN_SEEDS[0]!;
const mirror = blockAt(BASE);
if (mirror.join() !== CAMPAIGN_SEEDS.join()) {
  console.error("this harness no longer mirrors CAMPAIGN_SEEDS' layout — rebuilt at its own "
    + `base ${BASE} it produces a different set, so a displaced block would not be the same `
    + "sample shape. Re-derive GROUPS/STRIDE from the constant before trusting a margin.");
  console.error(`  expected: ${CAMPAIGN_SEEDS.join(",")}`);
  console.error(`  rebuilt:  ${mirror.join(",")}`);
  process.exit(2);
}

const BLOCK = blockAt(offset);

const overlap = BLOCK.filter((s) => CAMPAIGN_SEEDS.includes(s));
if (overlap.length > 0) {
  console.error(`block is not disjoint from CAMPAIGN_SEEDS: ${overlap.join(", ")}. `
    + "Pick a different offset — a block that overlaps measures the sample it is meant to be "
    + "independent of.");
  process.exit(2);
}
if (BLOCK.length !== CAMPAIGN_SEEDS.length) {
  console.error(`block is ${BLOCK.length} seeds against the gate's ${CAMPAIGN_SEEDS.length}`);
  process.exit(2);
}

console.log(`=== disjoint campaign block: ${BLOCK.length} seeds from ${offset} ===`);
console.log(`   matches the gate's width (${CAMPAIGN_SEEDS.length} seeds, ${GROUPS}x${PER_GROUP}), overlap 0`);

const mean = (ns: number[]) => ns.reduce((a, n) => a + n, 0) / ns.length;

const sharp = BLOCK.map((seed) => campaign(seed, 0.55, 20));
const reckless = BLOCK.map((seed) => campaign(seed, 0, 20));
const sharpDeepest = mean(sharp.map((r) => r.deepest));
const recklessDeepest = mean(reckless.map((r) => r.deepest));
const margin = sharpDeepest - recklessDeepest;

console.log(`   sharp    average deepest depth ${sharpDeepest.toFixed(2)}`);
console.log(`   reckless average deepest depth ${recklessDeepest.toFixed(2)}`);
console.log(`   margin ${margin.toFixed(2)} against the gate's bar of 1`);
console.log(margin >= 1 ? "   -> this block clears the bar" : "   -> this block does NOT clear the bar");
// Per-seed, so two runs can be diffed seed-for-seed. A mean can hide one seed swinging
// wildly while the average holds, which is the failure mode that makes a thin comparison
// look stable right up until it inverts.
console.log(`   per-seed sharp:    ${sharp.map((r) => r.deepest).join(",")}`);
console.log(`   per-seed reckless: ${reckless.map((r) => r.deepest).join(",")}`);
