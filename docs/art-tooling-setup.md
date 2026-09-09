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
