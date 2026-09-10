A GOOD wind-up for `boss.corrupted-saint`, not shipped — blocked on a gate ruling, not on
art quality. Seed 7, free-form from `../saint-rest-pad.png`, travel builds 0 -> 2165
peaking at f6. The saint raises both arms, the halo flares into a starburst and a violet
lance forms above it: a strong caster telegraph for a kit of volley/beam/starLance.

It cannot ship because the Saint has TWO hot accents (gold halo hue 40, violet eyes hue
277) and `npm run chroma` assumes one. Violet is the loudest 2+px colour in 6 of these 9
frames while gold leads all 5 idle frames, so the combined strip reads as "the accent was
REPLACED" — a ~125 degree hue jump against a 45 degree tolerance. Neither accent ever
vanishes; measured, gold holds 63.9-74.9 and violet 62.0-80.8 across all 14 frames.

**Do not re-roll this hoping for a luckier seed.** The swap is a property of the sprite's
palette, not of the generation. See docs/animation.md, "a sprite with two accents".
