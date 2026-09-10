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

So this one was NOT rejected on the strength of the number, and nobody should later "fix" it
by moving the constant. It was left unshipped because a boss going from static to a real
wind-up is a clear gain, while shipping an idle past a check written an hour earlier, on
thin evidence, is how a bar stops meaning anything. **It wants an eye, not another
generation.** If the owner looks at it and likes it, ship it and widen the check's evidence
in the same commit.
