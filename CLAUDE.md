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
`game/` is DOM-free. **Run it after any balance change** — it prints the depth curve and a
twelve-floor progression, and it will tell you immediately if the difficulty now outruns
the player. It caught exactly that during the original port.

## The game loop (this is the design; respect it)

Town → pick a depth → **dive** → fight waves of auto-spawning monsters → collect loot →
either **extract** at the portal (banks everything) or **die** (lose unbanked loot, keep
the XP) → back in town: open chests, equip upgrades, sell junk → dive deeper.

Depth is the difficulty dial. Each depth scales enemy HP, damage, count, and speed, and
shifts the loot rarity weights upward. Clearing a floor offers **descend** (deeper, richer,
more dangerous) or **extract** (bank it). Every 5th depth is a boss floor.

Risk/reward is the point: unbanked loot is lost on death. Never make death free.

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
  data/     rarities, item tables, chest tiers, enemy archetypes, depth curves
  game/     state, player, enemies, projectiles, pickups, the dungeon run
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

## Conventions

- Strict TypeScript. No `any` without a comment explaining why.
- Tuning numbers live in `src/data/`, not sprinkled through the sim.
- The save is versioned (`SAVE_VERSION`); bump it and handle migration when the shape of
  the save changes, rather than silently corrupting people's progress.
