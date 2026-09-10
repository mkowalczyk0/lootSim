# Art tooling setup — Aseprite MCP + PixelLab MCP

The art pipeline uses two MCP servers (see [`art-style-guide.md`](art-style-guide.md) for
what they're for, and the memory `lootsim-art-pipeline-aseprite-migration` for the why).

## 1. Aseprite MCP — committed, no secret

Lives in the repo's [`.mcp.json`](../.mcp.json). It runs a local Python server
(`github.com/diivi/aseprite-mcp`) that drives the Aseprite CLI headlessly — canvas,
layers, palettes, tilemaps, exports, pixel read-back.

**One-time install:**
```bash
git clone https://github.com/diivi/aseprite-mcp.git ~/.claude/mcp-servers/aseprite-mcp
cd ~/.claude/mcp-servers/aseprite-mcp && uv sync
```
`.mcp.json` points at that path and at `/Applications/Aseprite.app/Contents/MacOS/aseprite`
(override with an `ASEPRITE_PATH` env var if yours is elsewhere). `uv` fetches Python 3.13
itself — nothing else to install.

Known: the server's own test suite passes 113/128 against Aseprite 1.3.18.3 (the failures
are in animation/layer-group introspection tools, not drawing/export/palette). The
PixelLab Aseprite *extension* prints harmless `handle-pose.lua` errors on headless launch.

## 2. PixelLab MCP — local scope, carries a secret

PixelLab is a hosted HTTP MCP (`api.pixellab.ai/mcp`) for AI pixel-art generation. It
authenticates with a per-account API token, so it is **not** in the committed `.mcp.json`
— it's added to Claude Code's local (per-user, per-project) config instead:

```bash
claude mcp add --scope local --transport http pixellab \
  https://api.pixellab.ai/mcp \
  --header "Authorization: Bearer YOUR_PIXELLAB_TOKEN"
```

Get `YOUR_PIXELLAB_TOKEN` from your [pixellab.ai](https://pixellab.ai) account settings.
The trial grants 40 generations; raising the limit needs a paid plan.

Verify: `claude mcp get pixellab` → `Status: ✔ Connected`. After adding or changing the
config, **fully restart Claude Code** (or `/mcp` → reconnect) — MCP config is read at
startup, not hot-reloaded.

> Why not an env var in `~/.zshrc`? Claude Code here runs inside the VS Code extension,
> which on macOS is launched from the Dock and does not source `~/.zshrc` — so a shell
> env var is invisible to it. Local-scope config in `~/.claude.json` is read directly and
> is the reliable place for the token.

## Generation budget

The account has since moved off the 40-generation trial onto a paid tier (check
`get_balance` for the current cycle's count and reset date). Don't spend generations on
throwaways regardless of how many are left — each test should target a real
style-guide deliverable (§18 backlog in the style guide).

## Known gotcha: `create_topdown_tileset` will pass your eye and fail the gate

Two colours that look clearly different in a preview thumbnail can still be close in
*luminance*, and the §17.7 floor/wall contrast gate (`npm run smoke`) measures luminance,
not hue — after the render grade desaturates by 50%, only value survives. A prompt built
from colour-family names ("ash grey" floor, "bone-grey" wall) is exactly the failure
mode: describe darkness/brightness explicitly ("dark ... in deep shadow" vs. "pale ...
bright") instead of trusting a colour name to imply a value. Full writeup and the numbers
that moved (raw delta 5.5 → 148) are in `art-style-guide.md` §17.7.

## Mode matters: only `standard` honours the style knobs

`create_character` takes `shading` (`flat shading` … `detailed shading`), `detail` (`low`
… `high`) and `outline`, and **`pro` and `v3` mode silently ignore `shading` and `detail`
— `pro` ignores `outline` too**. They are not soft guidance in those modes; they are
dropped. Only `standard` mode applies them (as soft guidance).

This is worth knowing because it plausibly explains a run of rejected passes. The hero was
redrawn five times, and the recurring verdict was that the art came back **more rendered
than it was asked for** — "too realistic", too many colours, a face carrying more detail
than the reference's two or three pixels. Those generations asked for flat shading and low
detail while running in a mode that discards both. The prompt looked right and the knob was
never connected.

So:

- **Reaching for flat, chunky, limited-palette art → `standard` mode**, and put the palette
  discipline in the *description* as well, since even there the knobs are only guidance.
  `pro`/`v3` bias hard toward clean, polished, high-detail rendering (the same bias
  `art/bosses/finish.ts` records for heroic armour), which is the opposite of what this
  game's §1.4 palette rules want.
- **`v3` is still the right mode for rotating an existing sprite** into 8 directions via
  `reference_image_base64` / `reference_image_url` — that path takes its style from the
  reference, so the ignored knobs cost nothing.
- **Candidate rounds should be `standard`, 4 directions, one generation each.** The owner
  picks a direction from a south view; paying for 8-direction rotations of two sprites that
  are about to be thrown away is the expensive way to ask a cheap question. Rotate the
  winner afterwards.

Derived while generating the v6 hero candidates; see `art/characters/candidates/NOTES.md`.

## Match the reference's generation SETTINGS, not just its prompt

The rule above says which mode honours the style knobs. This is the consequence of it that
actually cost the project six rejected hero passes, and it is a general rule rather than a
hero one.

When the owner said *"go off the existing boss art instead for style"*, the useful answer
turned out not to be a prompt at all. Read straight off the PixelLab records for the two
sets of sprites:

| | directions / size | `style` on record |
| --- | --- | --- |
| every raid boss | 8 directions, 112px | `-, -, -` |
| hero v6 (the shipped base) | 4 directions, 56px | `flat shading, single color black outline, low detail` |

Only `standard` honours `shading`/`detail`, and `pro`/`v3` always produce 8 directions — so
the bosses are `pro`/`v3` with **nothing clamped**, and the hero was `standard` with the
flat and low-detail knobs **actively on**. The hero was being deliberately flattened and
de-detailed while the rest of the cast was not.

**That divergence is invisible in the picture and invisible in the prompt.** Six passes were
judged by eye, described as "too realistic" or "doesn't fit", and re-prompted — while the
setting that made the hero categorically different from everything it stands next to was
never in the conversation. No amount of looking at candidates would have found it; reading
the two records side by side found it in a minute.

So, whenever art is meant to match art that already exists: **fetch the existing sprite's
generation record first and match its mode and its style parameters, before writing a word
of description.** `get_character(character_id)` prints them. A style difference you can see
is usually a settings difference you cannot.

A corollary worth knowing, measured on the v7 candidates: **the mode also decides the
palette.** `v3` from scratch drifted warm and saturated and produced two candidates that
FAIL the §1.4 accent rule (46 and 52 against the lowest monster's 44.7) while reading as
muted brown by eye; `pro` with a boss passed as `style_character_id` inherited the low dirty
palette and produced the fewest colours of the six. Colour counting could not separate them
— the passing candidate had the fewest colours and the worst failure had the most.
