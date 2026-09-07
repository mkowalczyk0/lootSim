/**
 * The combat vocabulary — the reusable primitives every class's content is built out
 * of. Nothing in here knows about a specific class; a class is a bundle of `Ability`
 * data, a `ResourceSpec` or two, and a handful of `registerStatus` calls.
 *
 * The layers, bottom up:
 *   tags       — the semantic labels the tree targets
 *   damage     — the packet: type, channel, source, and THE ULTIMATE RULE
 *   status     — one framework for DoTs, CC, debuffs and buffs; generic tick
 *   resources  — Mana is one instance; generation / decay / thresholds / overflow
 *   triggers   — the typed event bus, depth-guarded
 *   targeting  — self / ally / point / line / cone / marked / corpse / ...
 *   ability    — the data schema for a skill or ultimate: ordered effect steps
 *   host       — the seam the executor talks to instead of the dungeon
 *   runtime    — castAbility + the one generic runEffect dispatcher
 */

export * from "./tags";
export * from "./damage";
export * from "./status";
export * from "./resources";
export * from "./triggers";
export * from "./targeting";
export * from "./ability";
export * from "./host";
export * from "./runtime";
