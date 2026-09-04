# Depths of the Unspoken

A top-down, keyboard-only ARPG loot grinder. Dive into a dungeon, kill everything that
spawns, drag the loot back out, gamble it on chests, come back stronger, go deeper.

It started life as `legacy/lootGame_1.2.0.py` — a Tkinter window where you clicked a
button to open a chest and watched a text log fight for you. The eight-rarity ladder,
the chest tiers and the item tables survived that port; everything else is new.

## Play

```
npm install
npm run dev      # then open the printed localhost URL
```

Requires Node 20+. No other setup, no assets to download — every sprite is generated
from code at boot.

## Controls

No mouse. Left hand on WASD, right hand on the home row.

| Key | |
| --- | --- |
| `W` `A` `S` `D` | Move, and navigate every menu |
| `J` | Attack — a melee arc, or a bolt if you're holding a staff |
| `K` | Dash, with brief invulnerability |
| `L` | Drink a potion |
| `;` | Special — a nova that clears the crowd around you, charged by killing |
| `E` | Confirm · descend at the portal |
| `Q` | Back · extract at the portal · sell in the stash |
| `I` `O` | Switch town tab |
| `Esc` | Pause |

## The loop

Pick a depth and dive. Waves spawn automatically and get bigger; clear them all and the
portal lights up for the descent. Every fifth floor is a boss.

The portal is a live exit for the entire floor, so you can always run for it — and you
should, because **dying loses every coin, key and item you picked up on the way down.**
XP is the one thing you always keep.

Back in town: open chests with the keys you found, compare drops against what you're
wearing, sell the junk, and go deeper. Depth is the only difficulty dial, and it raises
enemy health, damage and count while shifting the loot odds toward the top of the ladder.

## Rarities

`common` · `uncommon` · `rare` · `epic` · `legendary` · `mythic` · `divine` · `unspoken`

Each step doubles an item's stat budget, so an unspoken drop is 128× a common one. From a
Basic chest, unspoken lands about once in twenty thousand pulls. That is deliberate.

## Development

```
npm run check    # typecheck
npm run smoke    # headless simulation test — plays real floors, checks the balance curve
npm run test     # both
npm run build    # typecheck + bundle to dist/
```

`npm run smoke` drives the actual game simulation with a scripted bot, no browser
involved, and prints the depth curve and a twelve-floor progression run. It's the fastest
way to see whether a balance change made the game unplayable.

See `CLAUDE.md` for architecture and the rules the code follows.
