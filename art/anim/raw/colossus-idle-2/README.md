REJECTED idle candidate 2 for `boss.gravebound-colossus`. Seed 21, prompt asked explicitly
for a seamless loop returning to the starting pose, arms not moving in or out, body outline
the same width throughout.

    wrap back to frame 0: 11.8% of the body   (art/anim/loop-check.py, limit 10%)
    step sizes:           4.7% 9.5% 11.3% 8.1%

**Prompting for stillness produced a BUSIER animation than prompting for breathing** — steps
up to 11.3% against candidate 1's 7.7%. Two seeds, two opposed prompts, both over the limit:
this is a property of the sprite and the tool, not of one unlucky draw.

It fails differently from candidate 1, and the difference is worth keeping. Its seam is fine
*relative to its own motion* (1.04x the largest ordinary step — the Ferryman's shipped idle
is 1.04x too), so by the self-relative measure it loops cleanly; it is only over the line on
the absolute measure. **That is the region where `loop-check.py`'s limit is least trustworthy**
— the constant is calibrated by the shipped set below it (max 7.6%) and candidate 1 above it
(14.2%), and 11.8% falls in the gap where there is no evidence either way.

So this one was NOT rejected on the strength of the number. It was put to an eye instead.

## SHIPPED 2026-09-10, on an owner override

The owner reviewed the batch and said the idle looks good, so this is the idle in the strip.

**The limit was not widened to let it through.** `WRAP_LIMIT` stays at 10% where the
measurement put it, and `loop-check.py` carries a named per-sprite entry in `OWNER_APPROVED`
instead, which prints `ALLOWED BY OWNER OVERRIDE — approved by eye, NOT by measurement`. The
distinction is the point: someone reading this in three months has to be able to tell "we
measured this as fine" from "a person looked at it and said ship", and the next candidate
that lands at 11.8% gets its own eye rather than inheriting this one's verdict. The override
also re-measures — if this art is ever regenerated and the number moves, the approval stops
covering it and the check goes red again.

The 14.2% candidate next door still fails, as it should.
