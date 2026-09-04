# lootSim — Depths of the Unspoken

A top-down ARPG loot grinder. Originally a Tkinter "click to open chests" gambling
simulator (`legacy/lootGame_1.2.0.py`); now a real, playable action game in the browser.

## Stack

- **TypeScript + Vite**, no runtime dependencies.
- **HTML5 Canvas 2D** for the dungeon (the action).
- **DOM/CSS** for the town (menus, inventory, equipment, chests). Menu-heavy UI is
  far cheaper and nicer in DOM than hand-rolled on canvas — don't rebuild it in canvas.
- **Sprites are procedural**: pixel grids defined as string arrays in
  `src/render/sprites.ts`, baked into offscreen canvases at boot. There are **no binary
  art assets** and we want to keep it that way. To add art, add a grid + palette.

```
npm install
npm run dev     # http://localhost:5173
npm run build   # typecheck + bundle to dist/
npm run check   # typecheck only (tsc --noEmit)
npm run smoke   # headless simulation test (tools/smoke.ts)
npm run test    # check + smoke
```

`tools/smoke.ts` plays real dungeon floors with a scripted bot and no browser, because
`game/` is DOM-free. **Run it after any balance change.** It plays two twenty-dive
campaigns — a player who dodges telegraphs and one who never does — retrying a floor after
a death and dropping back to farm after two, which is what a real player does and what a
forced 1..12 march does not. It also validates every generated floor and prints the depth
curve and chest odds. It has caught a difficulty curve that outran the player, a crash on
large stash writes, and monsters that stood behind walls forever.

## The game loop (this is the design; respect it)

Town → pick a depth → **dive** → fight waves of auto-spawning monsters → collect loot →
either **extract** at the portal (banks everything) or **die** (lose unbanked loot, keep
the XP) → back in town: open chests, equip upgrades, sell junk → dive deeper.

Depth is the difficulty dial. Each depth scales enemy HP, damage, count and speed, tightens
their attack telegraphs, adds hazards, and shifts the loot rarity weights upward. Clearing a
floor offers **descend** (deeper, richer, more dangerous) or **extract** (bank it). Every 5th
depth is a boss floor.

Risk/reward is the point: unbanked loot is lost on death. Never make death free.

### Every floor is generated

`src/game/level.ts` builds each floor from a seed: a layout of solid blocks, a scatter of
hazards, biome decoration, and the spawn/portal pair. Six layouts (open, pillars, chambers,
gauntlet, rubble, ring), six biomes, and hazards that grow in number with depth. The
generator's one hard promise is that **the portal is always walkable from the spawn** — it
flood-fills to check and carves a corridor if a layout ever seals itself off. The smoke test
verifies this over hundreds of floors; don't add a layout without running it.

Walls block movement, projectiles and line of sight. Monsters that can see you charge; ones
that can't follow a breadth-first flow field rebuilt around the player four times a second
(`FlowField` in `level.ts`). Without that they stand behind pillars and the floor never ends.

### Difficulty philosophy

Pressure, not sponginess. Enemy health is allowed to grow roughly with the gear curve, but
the things that actually make a deep floor frightening are damage (quadratic in depth),
speed, count, hazards, and `aggression`/`telegraph` in `DepthProfile` — deep monsters attack
more often and wind up faster. Reading a telegraph and dashing is the skill the game asks
for, and the smoke test measures exactly that: a bot that never dodges stalls out around
depth 8-10, one that dodges half the time reaches the high teens.

The economy is deliberately slow. Coins per kill, per-kill gear drops, key drops and the
vendor's `SELL_RATE` were all cut hard, and most of a floor's actual pay comes from the
**clear cache** dropped at the portal when the last wave dies — a reward you only get by
finishing, and still lose by dying on the way out.

## Controls — keyboard only, no mouse, ever

This is a hard requirement from the project owner: the game must be **completely playable
without a mouse**, town menus included. Left hand on WASD, right hand resting on the JKL
home row. Never introduce a mechanic that requires pointing, and never make a menu
reachable only by clicking. Clicking may work as a convenience; it is never the only way.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` (or arrows) | Move / navigate menus |
| `J` (or `Space`) | Attack |
| `K` | Dash (grants i-frames) |
| `L` | Drink potion |
| `;` (or `U`) | Special — costs charge built by killing |
| `E` (or `Enter`) | Confirm / interact |
| `Q` (or `Backspace`) | Back / cancel |
| `I` / `O` | Previous / next town tab |
| `Esc` | Pause |

Bindings live in one table in `src/core/input.ts`, and `CONTROL_HINTS` there is the single
source of truth for every on-screen legend — don't hardcode key names in the UI.

## Architecture

```
src/
  core/     rng, input, fixed-timestep loop, localStorage save, math helpers
  data/     rarities, item tables, chest tiers, enemy archetypes, depth curves,
            biomes (palettes + which layouts and hazards they allow), trap specs
  game/     state, player, level generation + pathfinding, the dungeon run
  render/   procedural sprite atlas, camera/draw, particles + damage numbers
  ui/       town screen (DOM), in-run HUD (canvas)
tools/      headless simulation test
legacy/     the original Tkinter game, kept for reference
```

Rules of thumb:
- `data/` is pure data + pure functions. No DOM, no canvas, no `GameState` imports.
- `game/` is simulation only. It must never touch the DOM or draw anything.
- `render/` and `ui/` read state and draw. They never mutate simulation state.
- The sim runs on a **fixed timestep** (60 Hz). Rendering interpolates. Don't put gameplay
  logic in the render path or it will break at other framerates.

## Carried over from the Python original (do not casually change)

These are the identity of the game and were tuned by the owner:

- **Eight rarities**: common, uncommon, rare, epic, legendary, mythic, divine, unspoken —
  with their exact colors and `2^n` stat multipliers (1→128). See `src/data/rarity.ts`.
- **Chest tiers**: Basic / Advanced / Elite / Legendary, their prices, and their per-rarity
  weight multipliers (higher tiers zero out the low rarities).
- **Item name tables**: seven slots × eight rarities, the original names verbatim.
  `weapon` and `staff` share the weapon slot; a staff makes your attack a projectile.
- **Base rarity odds**: unspoken is ~1 in 20,000 from a Basic chest. Keep it absurd —
  the long tail is the hook.

Anything else — combat, adventures, stats, zones — was replaced and is fair game.

## Planned direction (not built yet — check before starting)

The dive is meant to grow into Diablo-style selectable run types rather than a single depth
ladder: one mode that pushes rarity and is brutally hard, another that is easier but pays in
resources, feeding a crafting/combination system. Keep run configuration (loot weighting,
scaling, what a floor drops) in `data/` where a mode can override it, and leave room for
material drops alongside coins, keys and gear.

## Conventions

- Strict TypeScript. No `any` without a comment explaining why.
- Tuning numbers live in `src/data/`, not sprinkled through the sim.
- The save is versioned (`SAVE_VERSION`); bump it and handle migration when the shape of
  the save changes, rather than silently corrupting people's progress.
