# Ashes of Purgatory

A top-down, keyboard-only ARPG loot grinder. Dive into a dungeon, kill everything that
spawns, drag the loot back out, gamble it on chests, come back stronger, go deeper.

It started life as `legacy/lootGame_1.2.0.py` — a Tkinter window where you clicked a
button to open a chest and watched a text log fight for you. The eight-rarity ladder,
the chest tiers and the item tables survived that port; everything else is new.

## Play

```
npm install
npm run dev      # then open the printed localhost URL
npm run host     # the same thing, reachable from other laptops on your network
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

Pick a depth and dive. Waves spawn automatically and get bigger; clear them all and a
cache drops at the portal, which is where most of a floor's pay actually comes from.
Every fifth floor is a boss.

The portal is a live exit for the entire floor, so you can always run for it — and you
should, because **dying loses every coin, key and item you picked up on the way down.**
XP is the one thing you always keep.

Back in town: buy potions, open chests with the keys you found, compare drops against what
you're wearing, sell the junk, and go deeper. Depth is the difficulty dial — it raises enemy
health, damage, speed and count, tightens their attack telegraphs, adds hazards, and shifts
the loot odds toward the top of the ladder.

## Multiplayer

Up to four people, one room code, nothing to install and nothing to sign up for.

```
npm run host
```

That serves the game *and* the party relay on one port. Read out the **Network** address
it prints; anybody on the same wifi opens it in a browser and they're playing your copy
of the game with their own save.

Then, in the game: walk to the **Comms Relay** on the ship. One of you opens a room and
reads out the four letters; everybody else types them in. You'll see each other walking
around the deck. When every one of you is standing in the **Party Portal**, the run
starts — nobody can start it for somebody who wandered off to the stash.

- The floor scales with the party: monsters get tougher and there are more of them. They
  don't hit much harder, because you can't dodge for each other.
- Everyone keeps their own loot, their own XP and their own stash. Drops go to whoever
  picks them up. XP is shared in full — nobody loses out on the last hit.
- Running out of health puts you **down**, not out. An ally standing over you brings you
  back, and clearing the floor picks everybody up. If the last one standing falls, the
  whole party loses the floor.
- The host calls it at the portal: descending needs everybody standing in it, extracting
  is theirs alone to call and banks everyone's loot.

The host's browser runs the whole simulation and everyone else draws what it sends, so
there is exactly one place where a hit lands or doesn't. If the host closes the tab, the
room closes. Playing with somebody who isn't on your network needs a tunnel to your
machine (`cloudflared`, `ngrok` and friends) pointed at port 5173 — the game itself
doesn't care, since the relay lives on whatever address the page was loaded from.

## Floors

No two floors are the same. Each one is generated from a seed: a layout — open hall,
pillared hall, broken chambers, the gauntlet, collapsed warren, sealed rotunda — scattered
through one of six biomes, with hazards that multiply as you descend.

Hazards hurt monsters too, which is the whole reason to learn where they are:

| | |
| --- | --- |
| **Spike Plate** | Cycles. Telegraphs in red, then fires. |
| **Tar Pool** | Always on. Slows you to a crawl and chews on you. |
| **Flame Vent** | Cycles, wide and hot. |
| **Blade Runner** | Always live, and it patrols. The only hazard that comes to you. |
| **Bone Turret** | Fires a bolt down a fixed lane on a timer. |

Walls block movement, shots and line of sight. Monsters that lose sight of you path around
them rather than giving up, so a corridor is cover, not an exploit.

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
involved. It plays two twenty-dive campaigns — one player who dodges telegraphs and one
who never does — checks that every generated floor has a reachable portal, and prints the
depth curve and chest odds. It also plays a two-player co-op floor with both characters
driven by bots, and runs a real host/client pair in one process to check a snapshot
carries the whole floor across. It's the fastest way to see whether a balance change made
the game unplayable, or a new layout unfinishable.

`npm run relay` runs the party relay on its own, for serving a built `dist/` from
somewhere that isn't the dev server.

See `CLAUDE.md` for architecture and the rules the code follows.
