/**
 * The pixels themselves. Every piece of art in the game is a rectangular grid of
 * characters plus a palette that maps those characters to colours; '.' is always
 * transparent. There are no binary art assets in this project and there never will be.
 *
 * This module is deliberately **pure** — no DOM, no canvas — so the headless smoke test
 * can walk every grid and shout about a ragged row before a player ever sees it. Baking,
 * compositing and caching all live next door in `sprites.ts`.
 *
 * ## The look
 *
 * Small, simple pixel art — the smaller and plainer the grid, the better. The hero is
 * meant to be pleasant to look at, not dangerous-looking: a calm, small-eyed face, no
 * sharp brows or slit pupils. The monsters are the half that still gets to be a problem —
 * horns, plate, spines, hoods and slit or glowing eyes — just drawn with fewer pixels,
 * not more. One shared dark outline so nothing looks pasted in. A resolution-doubling
 * pass was tried and rolled back because it made the hero read as scary rather than cool;
 * don't repeat that without checking first.
 *
 * ## Resolution
 *
 * The draw scales in `render/draw.ts` (`SPRITE_SCALE`, `WEAPON_SCALE`) and `spriteScale`
 * in `data/bosses.ts` are tuned against the grid sizes below. Change the authoring
 * resolution and you must change those in the same commit, or every hitbox will lie about
 * what's on screen.
 *
 * ## The character grid
 *
 * A character is not one sprite, it is a stack of layers baked into one canvas of
 * `CHAR_W` x `CHAR_H`. The body is authored 20 wide and 22 tall and sits at
 * (`BODY_DX`, `BODY_DY`), which leaves rows above it for hats and columns either side for
 * wings — a pair of wings that only peeks out from behind the shoulders isn't a pair of
 * wings, so the field is deliberately wider than the character.
 * Every other layer — hair, hat, ears, face, back — is authored in that same space and
 * placed with an offset, so a horned helm lands on a head whichever hair is underneath.
 *
 * Palette keys are shared across layers on purpose, so the same grid recolours into a
 * different monster (or a different cosmetic) without duplicating the artwork.
 */

import {
  type Appearance, type Cosmetic, EYE_COLORS, HAIR_COLORS, OUTFIT_DYES, SKIN_TONES,
  type WeaponPalette,
} from "../data/cosmetics";
import { RARITY_COLORS, rarityIndex, type Rarity } from "../data/rarity";

/** '.' is transparent. Every row in a grid must be the same length. */
export type Grid = readonly string[];
export type Palette = Record<string, string>;

/** The canvas a character is composed into, and where the body sits inside it. */
export const CHAR_W = 30;
export const CHAR_H = 26;
export const BODY_DX = 5;
export const BODY_DY = 4;

/**
 * How tall the character actually is inside that field: `BODY`'s opaque rows, which run
 * from `BODY_DY` to the field's own bottom row. The four rows of difference from `CHAR_H`
 * are headroom a hat grows up into.
 *
 * Anything scaling a hero to a fixed on-screen size wants this rather than `CHAR_H`,
 * because the pipeline art's stage pads its body by a quite different fraction — see
 * `HeroSprite.bodyHeight`. The smoke test re-measures the grid against this, so it can't
 * quietly stop being true if the body is ever redrawn.
 */
export const BODY_H = CHAR_H - BODY_DY;

// --- the character body ---------------------------------------------------

/**
 * The bare character: skin, face and clothes, no hair. Hair is its own layer so it can
 * be styled, which is the whole point of a wardrobe.
 *
 * Small and plain on purpose: a one-pixel white-and-iris eye each side, a faint brow, a
 * small mouth, no sharp angles anywhere on the face — calm, not dangerous-looking. The
 * rest is a simple collared coat with a belt and boots.
 *
 * S skin · s skin shade · O outline · W eye shine · E iris · e lash · w brow · M mouth
 * C cloth · T trim · L belt · P trouser · B boot
 */
export const BODY: Grid = [
  ".......OOOOOO.......",
  "......OSSSSSSO......",
  ".....OSSSSSSSSO.....",
  ".....OSSSSSSSSO.....",
  ".....OwSSSSSSwO.....",
  ".....OSWESSEWSO.....",
  ".....OSSSSSSSSO.....",
  "......OOSSSSOO......",
  "........OMMO........",
  ".....OOOCCCCOOO.....",
  "...OOTCCCCCCCCCOO...",
  "..OOOCCCCTTCCCCOOO..",
  ".OCOOCCCCTTCCCCOOCO.",
  ".OCOOCCCCTTCCCCOOCO.",
  "..OOOCCCCTTCCCCOOO..",
  "..OSOCCCCCCCCCCOSO..",
  "..OOOLLLLTTLLLLOOO..",
  ".....OCCCOOCCCO.....",
  ".....OPPO..OPPO.....",
  ".....OPPO..OPPO.....",
  ".....OBBO..OBBO.....",
  ".....OOOO..OOOO.....",
];

/**
 * Hair styles, authored over the body's head, keyed by the ids in `data/cosmetics.ts`.
 * The fringe stops above the brow line on purpose — hair that covers the eyes covers the
 * only part of the face that is doing any work.
 *
 * H hair · h shade · g glint · O outline.
 */
export const HAIR: Record<string, Grid> = {
  bob: [
    ".......OOOOOO.......",
    ".....OOHHHHHHOO.....",
    "....OHgHHHHHHgHO....",
    "....OHHHHHHHHHHO....",
    "....OHO......OHO....",
    "....OHO......OHO....",
    "....OHO......OHO....",
    "....OHO......OHO....",
    ".....O........O.....",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  long: [
    ".......OOOOOO.......",
    ".....OOHHHHHHOO.....",
    "....OHgHHHHHHgHO....",
    "....OHHHHHHHHHHO....",
    "....OHO......OHO....",
    "....OHO......OHO....",
    "....OHO......OHO....",
    "....OHO......OHO....",
    "....OHO......OHO....",
    "....OHO......OHO....",
    "....OHO......OhO....",
    "....OHO......OhO....",
    "....OHO......OhO....",
    "....OHO......OhO....",
    "....OHO......OhO....",
    "....OHO......OhO....",
    ".....hO......Oh.....",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  short: [
    "......OOOOOOOO......",
    ".....OOHHHHHHOO.....",
    "....OHHHHHHHHHHO....",
    "....OHHHHHHHHHHO....",
    "....OHhhhhhhhhHO....",
    "....OO........OO....",
    ".....O........O.....",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  twintails: [
    ".......OOOOOO.......",
    ".....OOHHHHHHOO.....",
    "..OOOHHHHHHHHHHOOO..",
    ".OHHHHHHHHHHHHHHHHO.",
    ".OHHHHO......OHHHHO.",
    ".OHhHHO......OHHhHO.",
    ".OHhOh........hOhHO.",
    ".OHhO..........OhHO.",
    ".OHhO..........OhHO.",
    ".OHhO..........OhHO.",
    ".OHhO..........OhHO.",
    ".OHhO..........OhHO.",
    ".OHhO..........OhHO.",
    ".OHhO..........OhHO.",
    "..OhO..........OhO..",
    "...h............h...",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
  pony: [
    ".......OOOOOO.......",
    ".....OOHHHHHHOOOO...",
    "....OHHHHHHHHHHHO...",
    "....OHHHHHHHHHHHO...",
    "....OHO......OHHO...",
    "....OHO......OHhO...",
    "....OHO......OHhHO..",
    "..............OhHO..",
    "..............OhHO..",
    "..............OhHO..",
    "...............OHO..",
    "...............OHO..",
    "...............OHO..",
    "...............OHO..",
    "...............OHO..",
    "...............OHO..",
    "................OO..",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
};

// --- cosmetic art ---------------------------------------------------------

/**
 * A cosmetic's pixels plus where they sit on the character canvas. `data/cosmetics.ts`
 * owns what a cosmetic *is* — its name, price and colours — and points at one of these
 * by key, which keeps the data layer free of artwork and the render layer free of prices.
 *
 * Palette convention: 1 primary, 2 secondary, 3 accent, W highlight, O outline.
 */
export interface CosmeticArt {
  readonly grid: Grid;
  readonly dx: number;
  readonly dy: number;
}

export const COSMETIC_ART: Record<string, CosmeticArt> = {
  // --- hats ---
  hatWitch: {
    dx: BODY_DX, dy: 0,
    grid: [
      ".........OO.........",
      ".........11.........",
      "........O11O........",
      ".......O1111O.......",
      "......O111111O......",
      ".....O33333333O.....",
      ".O2211111111111122O.",
      ".OOOOOOOOOOOOOOOOOO.",
    ],
  },
  hatCrown: {
    dx: BODY_DX, dy: 4,
    grid: [
      ".....O.O.OO.O.O.....",
      ".....O11111111O.....",
      ".....OOOOOOOOOO.....",
    ],
  },
  hatHalo: {
    dx: BODY_DX, dy: 2,
    grid: [
      "....OOOOOOOOOOOO....",
      "....OOOOOOOOOOOO....",
    ],
  },
  hatChef: {
    dx: BODY_DX, dy: 2,
    grid: [
      "....OOOOOOOOOOOO....",
      "...O111111111111O...",
      "....111111111111....",
      "....OOOOOOOOOOOO....",
    ],
  },
  hatStraw: {
    dx: BODY_DX, dy: 4,
    grid: [
      ".......111111.......",
      "..O22211111111222O..",
      "OOOOOOOOOOOOOOOOOOOO",
    ],
  },
  hatBeanie: {
    dx: BODY_DX, dy: 2,
    grid: [
      ".........33.........",
      ".......O1331O.......",
      "....111111111111....",
      "...O111111111111O...",
      "...OOOOOOOOOOOOOO...",
    ],
  },
  hatTop: {
    dx: BODY_DX, dy: 2,
    grid: [
      ".....OOOOOOOOOO.....",
      ".....O11111111O.....",
      ".....O11111111O.....",
      ".....O22222222O.....",
      ".O3O111111111111O3O.",
      ".OOOOOOOOOOOOOOOOOO.",
    ],
  },
  hatFlower: {
    dx: BODY_DX, dy: 5,
    grid: [
      "......33.33.33......",
      ".....2332332332.....",
      "....OOOOOOOOOOOO....",
    ],
  },
  hatHeadband: {
    dx: BODY_DX, dy: 3,
    grid: [
      "....OOOOOOOOOOOOOO..",
      "....O111111111111O..",
      "....OOOOOOOOOOOOOO..",
    ],
  },

  // --- ears ---
  earsCat: {
    dx: BODY_DX, dy: 2,
    grid: [
      "......O......O......",
      ".....O1O....O1O.....",
      ".....121....121.....",
      "....OOOOO..OOOOO....",
    ],
  },
  earsFox: {
    dx: BODY_DX, dy: 1,
    grid: [
      "......O......O......",
      ".....OO......OO.....",
      ".....12O....O11.....",
      "....OOOO....OOOO....",
    ],
  },
  earsBunny: {
    dx: BODY_DX, dy: 0,
    grid: [
      "......OOO..OOO......",
      "......O2O..O2O......",
      "......O2O..O2O......",
      "......O2O..O2O......",
      "......OOO..OOO......",
    ],
  },
  earsHorn: {
    dx: BODY_DX, dy: 2,
    grid: [
      "....OO........OO....",
      "....O2O......O1O....",
      ".....O2O....O1O.....",
      ".....OOO....OOO.....",
    ],
  },
  earsWolf: {
    dx: BODY_DX, dy: 1,
    grid: [
      "......O......O......",
      ".....O1O....O1O.....",
      "....O111O..O111O....",
      "....OOOOO..OOOOO....",
    ],
  },
  earsAntenna: {
    dx: BODY_DX, dy: 1,
    grid: [
      ".....O........O.....",
      "....................",
      "....................",
      "........OOOO........",
    ],
  },

  // --- face ---
  faceGlasses: {
    dx: BODY_DX, dy: 8,
    grid: [
      ".....OOOOOOOOOO.....",
      ".....OOOO..OOOO.....",
    ],
  },
  faceEyepatch: {
    dx: BODY_DX, dy: 8,
    grid: [
      ".OOOOOOOOOOOOOOOOOO.",
      "....OOOOOO..........",
      "....O1111O..........",
      "....OOOOOO..........",
    ],
  },
  faceBlush: {
    dx: BODY_DX, dy: 10,
    grid: [
      ".....33......33.....",
    ],
  },
  faceFangs: {
    dx: BODY_DX, dy: 11,
    grid: [
      ".........OO.........",
    ],
  },
  faceVisor: {
    dx: BODY_DX, dy: 8,
    grid: [
      ".OOOOOOOOOOOOOOOOOO.",
      ".OOOOOOOOOOOOOOOOOO.",
    ],
  },

  // --- back (drawn behind the body) ---
  wingsAngel: {
    dx: 0, dy: 11,
    grid: [
      "..O11....................11O..",
      ".11111..................11111.",
      "O11W111................111W11O",
      "O1111111..............1111111O",
      "O1111111O............O1111111O",
      ".O11W111O............O111W11O.",
      "...11111O............O11111...",
      ".....111O............O111.....",
      ".......1O............O1.......",
    ],
  },
  wingsDemon: {
    dx: 0, dy: 11,
    grid: [
      "..O2O....................O2O..",
      ".1222O..................O2221.",
      "O221221................122222O",
      "O2212221..............1222222O",
      "O2212222O............O1222222O",
      ".1222222O............O1222221.",
      "..O222221............122222O..",
      "....O1222............1222O....",
      "......O2O............O2O......",
      "........O............O........",
    ],
  },
  wingsButterfly: {
    dx: 0, dy: 11,
    grid: [
      "..111O..................O111..",
      "O11W111................111W11O",
      "O111111O..............O111111O",
      ".111111O..............O111111.",
      "..21111O..............O11112..",
      "O222222O..............O222222O",
      "O222222O..............O222222O",
      "..22222O..............O22222..",
      "....222O..............O222....",
      "......2O..............O2......",
    ],
  },
  cape: {
    dx: 0, dy: 14,
    grid: [
      ".........OOOOOOOOOOOO.........",
      "........11111111111111........",
      ".......1111111111111111.......",
      "......O1111111111111111O......",
      ".....O222222222222222222O.....",
      ".....O222222222222222222O.....",
      ".....OOOO.OOOO.OOOO.OOOO......",
    ],
  },
  tailCat: {
    dx: 0, dy: 15,
    grid: [
      "..........................OO..",
      ".........................11...",
      ".......................O1O....",
      ".....................OOO......",
      "...................OO.........",
    ],
  },
  tome: {
    dx: 0, dy: 13,
    grid: [
      "OOOOOOO.......................",
      "OWWWWWO.......................",
      "OWWWWWO.......................",
      "OOOOOOO.......................",
    ],
  },
};

// --- weapons --------------------------------------------------------------

/**
 * Weapons, authored pointing right along +x and rotated to the swing at draw time.
 * `ax`/`ay` is the grip — the pixel that sits in the character's hand.
 *
 * These are drawn at the size they hit at: an axe bit really is wider than a torso and
 * a spear really does out-reach a sword, because the reach is the difference between the
 * families and it should be legible before the numbers are.
 *
 * O outline · E edge · e shade · W shine · G grip · g wrap · J stone
 */
export interface WeaponArt {
  readonly grid: Grid;
  readonly ax: number;
  readonly ay: number;
}

export const WEAPON_ART: Record<string, WeaponArt> = {
  sword: {
    ax: 4, ay: 3,
    grid: [
      "......O.............",
      "OO...OEOOOOOOOOOO...",
      "OGOOOEEEWWWWWWWWWEO.",
      "OJGGGEEEWWWWWWWWWWOO",
      "OOOOOOEEOOOOOOOOOO..",
      ".....OOO............",
      "....................",
    ],
  },
  axe: {
    ax: 4, ay: 7,
    grid: [
      "..........OOOOOO.",
      ".........OeeEEEWO",
      "........OeeeEEEWO",
      "........OeeeEEEWO",
      ".......OeeeeEEEWO",
      ".......OeeeeEEEWO",
      "OOOOOOOEeeeWEEWWO",
      "OJGGGGGEWWWWWWWWO",
      "OOOOOOOOWWWWWWWWO",
      ".......OeeeeEEEWO",
      "........OeeeEEEWO",
      "........OeeeEEEWO",
      ".........OeeEEEWO",
      "..........OOOOOO.",
      ".................",
    ],
  },
  spear: {
    ax: 3, ay: 3,
    grid: [
      "........................",
      ".................OOO....",
      "OOOOOOOOOOOOOOOOOEEEWOO.",
      "OOOOOOOOOOOOOOOEJEWWWWOO",
      "................OEEEOO..",
      "..................O.....",
      "........................",
    ],
  },
  daggers: {
    ax: 3, ay: 5,
    grid: [
      "OO...OOOOOOO...",
      "OGGOOEEWWWWWEOO",
      "OJGOOEEEEEEEEOO",
      "OO...OOOOOOO...",
      "...............",
      "...............",
      "OO...OOOOOOO...",
      "OGGOOEEeeeeeEOO",
      "OJGOOEEEEEEEEOO",
      "OO...OOOOOOO...",
    ],
  },
  staff: {
    ax: 3, ay: 6,
    grid: [
      ".............OOOO...",
      "............WOOOEO..",
      "...........EO....WO.",
      "..........OO.JJJ..O.",
      "..........OOJWWWJ.OO",
      "GGGGGGGGGGEOJJJJJ.OO",
      "GJGGGGGGGGEOJJJJJ.OO",
      "..........OO.JJJJ.OO",
      "..........Oe..JJ.OO.",
      "...........OeO.OOe..",
      "............OOOOO...",
      "....................",
    ],
  },
  talisman: {
    ax: 1, ay: 5,
    grid: [
      ".......O.....",
      ".....OOEOO...",
      "....OWOOOWW..",
      "...OWO....WO.",
      "GGGOWOWWW.OO.",
      "GGEEE.JJJ.OEO",
      "...OeO.ee.OO.",
      "....eeO.OOeO.",
      ".....eeEeeO..",
      "......OOOO...",
      ".......O.....",
    ],
  },
  hammer: {
    ax: 3, ay: 3,
    grid: [
      "........OOOOOOO...",
      ".......OWWWWWWWO..",
      "OOOOOOOOEEEEEEEEO.",
      "OJGGGGGOEeeeeeeeEO",
      "OOOOOOOOEEEEEEEEO.",
      ".......OWWWWWWWO..",
      "........OOOOOOO...",
    ],
  },
  bow: {
    ax: 5, ay: 5,
    grid: [
      "......OO.......",
      ".....O.eO......",
      "....O...eO.....",
      "GGO.O....eO....",
      "GJGGO.....O....",
      "GGO..O....eO...",
      "....O...eO.....",
      ".....O.eO......",
      "......OO.......",
    ],
  },
  whip: {
    ax: 1, ay: 2,
    grid: [
      "..........................O.",
      ".........................OeO",
      "GGO......................OeO",
      "GJGOOOOOOOOOOOOOOOOOOOOOOOe.",
      "GGO......................O..",
      "..........................O.",
    ],
  },
  claws: {
    ax: 4, ay: 4,
    grid: [
      "OO.......OO..OO..OO.",
      "OGO.....OEWO.OEWO.OW",
      "OJO....OEEEO.OEEEO.O",
      "OGO...OEEEE...OEEEEO",
      "OO...OEEE.....OEEE..",
      "....OE.........OE...",
    ],
  },
  chakram: {
    ax: 6, ay: 6,
    grid: [
      "....OOOOO....",
      "..OOEeeeEOO..",
      ".OEeeJJJeeEO.",
      "OEeJJggJJeEO.",
      "OEeJgOOgJeEO.",
      "OEeJJggJJeEO.",
      ".OEeeJJJeeEO.",
      "..OOEeeeEOO..",
      "....OOOOO....",
    ],
  },
  scythe: {
    ax: 2, ay: 6,
    grid: [
      ".............OOOOOOOOO",
      "...........OOEEEEEEEEO",
      ".........OOEE.......OO",
      ".......OOEE...........",
      ".....OOEE.............",
      "OOOOOEE...............",
      "OJGGGE................",
      "OOOOOO................",
    ],
  },
  rapier: {
    ax: 3, ay: 3,
    grid: [
      "........................",
      "OOOOOOOOOOOOOOOOOOOOEWOO",
      "OJGGGGGGGGGGGGGGGGGGEEOO",
      "OGOOOOOOOOOOOOOOOOOOOOO.",
      "........................",
    ],
  },
  fists: {
    ax: 3, ay: 3,
    grid: [
      ".OOOOOO.",
      "OEWWWWEO",
      "OEWJWWEO",
      "OEWWWWEO",
      ".OOOOOO.",
    ],
  },
};

// --- monsters -------------------------------------------------------------
//
// The monsters are the half of the art that had to stop being cute. Nothing here has a
// round face or a highlight in its eye: what a floor sends at you should read as a
// problem from across the room, and the shapes do the work — horns, plate, spines, hoods
// and slit eyes rather than pupils.

/** Crawler: low, wide and mostly mouth. Four slit eyes
 * over a maw that does not close, and a ridge of spines it leads with. */
export const MOB_CRAWLER: Grid = [
  "........OO........",
  ".....OOO11O.O.....",
  "..OO.111111O1O.O..",
  "..11O11111111WO1O.",
  ".O11111111111111O.",
  "..OeE11e11eE11eO..",
  ".O11e11e111e11e1O.",
  "O1111111111111111O",
  "O11MMTMMTMMTMMT11O",
  ".11MMMMMMMMMMMM11.",
  "..1MTMMTMMTMMTM1..",
  "...OOMMMMMMMMOO...",
  ".....OOOOOOOO.....",
];

/** Marauder: lean, horned and all elbows — long arms, one heavy
 * talon on each, and a jaw it never shuts. */
export const MOB_IMP: Grid = [
  "..OO............OO..",
  "..11O..........O11..",
  "...O1O........O1O...",
  "....O1OOOOOOOO1O....",
  ".....SSSSSSSSSS.....",
  "....OSSSSSSSSSSO....",
  "....OSEESSSSEESO....",
  "....OSSSSSSSSSSO....",
  ".....OSSSSSSSSO.....",
  "......SMMMMMMS......",
  ".......OSSSSO.......",
  ".......OOSSOO.......",
  "...OOOCCCCCCCCOOO...",
  ".OOOCCCTTTTTTCCCOOO.",
  "OCO.OCCCCCCCCCCO.OCO",
  "OCO.OCCLLLLLLLCO.OCO",
  "OCO..CCLLLLLLLC..OCO",
  "OSO..OCLLOOLLCO..OSO",
  "OSO..OSSO..OSSO..OSO",
  "O1O...SSO..OSS...O1O",
  ".O....OSO..OSO....O.",
  "....OOOOO..OOOOO....",
];

/** Skirmisher: a hood with two lit slits where a face should be,
 * spiked at the shoulders and hemmed in shadow. */
export const MOB_RANGER: Grid = [
  "....................",
  ".........OO.........",
  ".......O1111O.......",
  "......11111111......",
  ".....1111111111.....",
  "....O1111111111O....",
  "....O1222222221O....",
  "....O1222222221O....",
  "....O12ee22ee21O....",
  "....O1222222221O....",
  ".....1222222221.....",
  ".OOOO.11111111.OOOO.",
  "OOTT1OCCCCCCCCO1TTOO",
  "..OCCCTTTTTTTTCCCO..",
  "..OCCCCCCCCCCCCCCO..",
  "..OCCCCCTTTTCCCCCO..",
  "...CCCCCTTTTCCCCC...",
  "...OCCCCTTTTCCCCO...",
  "...OCCCCTTTTCCCCO...",
  "....OCCCTOOTCCCO....",
  ".....OBBO..OBBO.....",
  ".....OOOO..OOOO.....",
];

/** Juggernaut: a wall of plate with a burning line across the
 * visor. No eyes, no face, no way around it. */
export const MOB_BRUTE: Grid = [
  "..........OOOO..........",
  ".........O1111O.........",
  "..........K11K..........",
  "........OKKKKKKO........",
  ".......OKKKKKKKKO.......",
  ".......OKKKKKKKKO.......",
  ".O.....OEEEEEEEEO.....O.",
  "O11....OKKKKKKKKO....11O",
  "O111O..OKKKKKKKKO..O111O",
  "O11111O.OKKKKKKO.O11111O",
  "O111111OKKKKKKKKO111111O",
  "O111111KKKKKKKKKKK11111O",
  ".OKKKKKTTTTTTTTTTKKKKKO.",
  ".OKKKKKTTTWWWWTTTKKKKKO.",
  ".OKKKKKTTTWWWWTTTKKKKKO.",
  "OKKKKKKTTTTTTTTTTKKKKKKO",
  "OKKKKKKKKKKKKKKKKKKKKKKO",
  "OKKKKKKKKKKKKKKKKKKKKKKO",
  ".OOOKKKKKKKOOKKKKKKKOOO.",
  "....OLLLLLO..OLLLLLO....",
  "....OLLLLLO..OLLLLLO....",
  "....OLLLLLO..OLLLLLO....",
  "...OBBBBBBO..OBBBBBBO...",
  "...OOOOOOOO..OOOOOOOO...",
];

/** Void Adept: a robe with a sigil burning where a head is not,
 * hovering, hem frayed into strands. */
export const MOB_CASTER: Grid = [
  ".........OO.........",
  ".......OO11OO.......",
  "......O111111O......",
  ".....O11111111O.....",
  ".....1111111111.....",
  "....O1222222222O....",
  "....O122EWWE222O....",
  "....O122EWWE222O....",
  ".....2222222222.....",
  ".....O22222222O.....",
  "....O1111111111O....",
  "...O111111111111O...",
  "..O221111TTT11112O..",
  ".O2221111TTT111122O.",
  ".O2221111TTT111122O.",
  ".12211111TTT1111221.",
  "O1SS11111TT11111SS1O",
  ".1SS111111111111SS1.",
  ".OOOOOOOOOOOOOOOOOO.",
  ".OOOO..OOOOOOO..OOO.",
  "....O........O......",
  "....................",
];

// --- bosses ---------------------------------------------------------------
//
// Raid bosses are drawn on a roughly 26x26 field and blown up by `spriteScale` in
// `data/bosses.ts`. They are the one place the art is allowed to be outright grim: a
// raid boss is the floor telling you it is serious, and it should look it before the
// first telegraph goes down.

/** Warden of the First Seal: a helm the size of a door, two horns swept
 * back off it, and one burning line where the visor is. */
export const BOSS_WARDEN: Grid = [
  ".OO........OOOO........OO.",
  ".555......O1111O......555.",
  "..555.....111111.....555..",
  "...O55..O44444444O..55O...",
  ".....O54444444444445O.....",
  "......O444444444444O......",
  ".....O44444444444444O.....",
  ".....O22222222222222O.....",
  ".....O27777722777772O.....",
  ".....O22222222222222O.....",
  ".....O22222222222222O.....",
  ".OOO..O444444444444O..OOO.",
  "O5555OOO4444444444OOO5555O",
  "O555554222222222222455555O",
  ".O5555422222222222245555O.",
  "..O22222211111111222222O..",
  "..O22222211111111222222O..",
  "..O22222211777711222222O..",
  "...O222221111111122222O...",
  "....222222222222222222....",
  ".....2222222222222222.....",
  "......22222OOOO22222......",
  "......O2222O..O2222O......",
  "......O2222O..O2222O......",
  ".....O66666O..O66666O.....",
  ".....OOOOOOO..OOOOOOO.....",
];

/** The Hollow Choir: three robes fused into one, ringed with eyes, and
 * nothing at all holding any of them up. */
export const BOSS_CHOIR: Grid = [
  "..........................",
  ".........OOOOOOOO.........",
  "........O44444444O........",
  "...OOOO3333eeee3333OOOO...",
  ".O44444433777e7733344444O.",
  "O43333443e777e77e33433333O",
  "O4e77e4433777e77e334e7ee4O",
  ".O777e4433e77e7e3334e7e7O.",
  ".OOOO3O2333eeee3332O3OOOO.",
  "....O2222222222222222O....",
  "...O22ee2222222222ee22O...",
  "..22e777722222222e7e7e22..",
  ".O22e7777e222222277e7e22O.",
  "O2222777e22eeee22e7e72222O",
  "O22222e222e77e7e222e22222O",
  "O2eee22222e77e7722222eee2O",
  "O2777e2222e77e7e2222e7e7eO",
  "O2e77e22222eeee22222e7ee2O",
  ".O2ee22e7ee2222e77e22ee2O.",
  "..22222e7e7e222777e22222..",
  "...22222eee2222eee22222...",
  ".OOO22O22O22OO22O22O22OOO.",
  "OOOO3OO3OOOOOOOOOO3OO3OOOO",
  "...O3OO3O...OO...O3OO3O...",
  "....O.O3O........O3O.O....",
  "......OO..........OO......",
];

/** Gravebound Colossus: grave stone with the light getting out through
 * the cracks, and arms that reach the floor. */
export const BOSS_COLOSSUS: Grid = [
  "..........................",
  ".........OOOOOOOO.........",
  "........O44444444O........",
  "........O55444455O........",
  "........O54444445O........",
  ".........O444444O.........",
  ".......OOO244442OOO.......",
  "...OOOO222222222222OOOO...",
  "OO2222222222222222222222OO",
  "O222222222222222222222222O",
  "O222222222225522222222222O",
  "O222555555555555555555222O",
  "O444222222225222222222244O",
  "O444222222225522222222444O",
  "O444225555525522555522444O",
  "O444422222225222222222444O",
  "O444422222225522222224444O",
  "O455542222225522222224555O",
  "O444422222225222222224444O",
  ".OOOO2222222222222222OOOO.",
  ".....O22222OOOO22222O.....",
  ".....O11111O..O11111O.....",
  ".....O11111O..O11111O.....",
  ".....311111O..O111113.....",
  "....O333333O..O333333O....",
  "....OOOOOOOO..OOOOOOOO....",
];

/** Herald of the Unspoken: gilded, winged, and already on fire. */
export const BOSS_HERALD: Grid = [
  "..........OOOOOO..........",
  ".........O555555O.........",
  "..OOO....O555555O....OOO..",
  ".O5555...O444444O...5555O.",
  "O555555.O44444444O.555555O",
  "O777555511111111115555577O",
  "O77755551eee11eee14555577O",
  "O777555511111111115555577O",
  ".O7755551111111111555557O.",
  "...O555552444444255555O...",
  ".....5222222222222225.....",
  "....O2222255555522222O....",
  "...O222222557775222222O...",
  "...O222222557775222222O...",
  "....222222555555222222....",
  "....O2222222222222222O....",
  ".....2222221111222222.....",
  ".....O22222111122222O.....",
  "......22222111122222......",
  ".......22221OO12222.......",
  ".......O111O..O111O.......",
  ".......O111O..O111O.......",
  "........O11O..O11O........",
  ".......O666O..O666O.......",
  ".......O666O..O666O.......",
  ".......OOOOO..OOOOO.......",
];

/** That Which Has No Name: mostly eyes, trailing into tendrils, and
 * none of it blinks. */
export const BOSS_NAMELESS: Grid = [
  "....OO.....OOOO.....OO....",
  "....OOO..O3e7ee3O..OOO....",
  "......OO33e77e7e33OO......",
  "....OO7e33377e7e33e7OO....",
  "...O7777e33eeee33377e7O...",
  "..Oe77773333333333e7e7eO..",
  ".O33eee3333eeee3333eee33O.",
  ".O3333333e777e77e3333333O.",
  "O3333333e7777e777e3333333O",
  "O3333333e7777e77773333333O",
  "O3333333e7777e777e3333333O",
  "O332222227777e777e2222223O",
  "O3e222222e777e77e222222e3O",
  "Oe7e7e22222eeee222222777eO",
  "Oe7e7e22222222222222e7777O",
  ".e7ee2e7ee222222e77e2ee7e.",
  ".O322277e7e2222e7777e222O.",
  "..O222e7e7e2222e7777222O..",
  "...O223eee222222eee322O...",
  "OOOOO22O2222222222O22OOOOO",
  "O22OO22OO22222222OO22OO22O",
  "O22OO22OO22222222OO22OO22O",
  ".O2O.O2.O22.OO.22O.2O.O2O.",
  ".O2O.OO.O2O....O2O.OO.O2O.",
  ".O2O....O2O....O2O....O2O.",
  ".OOO.....OO....OO.....OOO.",
];

// --- pickups, icons and props ---------------------------------------------

export const ICON_COIN: Grid = [
  "...OOOO...",
  "..O1111O..",
  ".OW1111WO.",
  "O111JJ11WO",
  "O111JJ11WO",
  "O111JJ11WO",
  "O111JJ11WO",
  ".OW1JJ1WO.",
  "..OWWWWO..",
  "...OOOO...",
];

export const ICON_KEY: Grid = [
  "..OO........",
  ".O111O......",
  "O1OOO1......",
  "OO..O1WOOOOO",
  "OO..O11O111O",
  "O1OOO1..OOOO",
  ".O111O...OOO",
  "..OO.......O",
];

export const ICON_POTION: Grid = [
  "...OOOO...",
  "...O11O...",
  "...O11O...",
  "...O11O...",
  "..O1111O..",
  ".O1W3331O.",
  ".13W33331.",
  "O13333333O",
  "O13333333O",
  ".O333333O.",
  "..333333..",
  "...OOOO...",
];

export const ICON_GEM: Grid = [
  "...OOOO...",
  ".OWW1111O.",
  "O1W111111O",
  ".1111W111.",
  ".O111W11O.",
  "..O11W1O..",
  "...O1WO...",
  "....OO....",
  "..........",
  "..........",
];

export const ICON_CAPSULE: Grid = [
  "....OOOO....",
  "...O1111O...",
  "..OWW1111O..",
  ".OWW111111O.",
  ".O11111111O.",
  ".OOOOOOOOOO.",
  ".OOOOOOOOOO.",
  ".O22222222O.",
  ".O22222222O.",
  "..O222222O..",
  "...O2222O...",
  "....OOOO....",
];

export const ICON_ARMOR: Grid = [
  "..OOOOOOOO..",
  "O2111111112O",
  "O2211111122O",
  ".1111111111.",
  ".O111JJ111O.",
  ".O111JJ111O.",
  ".O11112111O.",
  ".O11112111O.",
  "..O111111O..",
  "...111111...",
  "....OOOO....",
  "............",
];

export const ICON_SHIELD: Grid = [
  "OOOOOOOOOO",
  "O22222222O",
  "O21111112O",
  "O21133112O",
  "O21133112O",
  ".21133112.",
  ".O111111O.",
  "..O2222O..",
  "...O11O...",
  "....OO....",
  "..........",
  "..........",
];

export const ICON_RING: Grid = [
  "...OO...",
  "..OJJO..",
  ".O1OO1O.",
  ".1O..O1.",
  "O1O..O1O",
  "O1O..O1O",
  ".O1OO1O.",
  "..OOOO..",
];

export const ICON_GLOVES: Grid = [
  "..OOOOOOO.",
  ".O11O1O1O.",
  ".O1111111O",
  ".O1222211O",
  ".O1222211.",
  ".O111111O.",
  "O2222222O.",
  ".OOOOOOOO.",
  "..........",
  "..........",
];

export const ICON_NECKLACE: Grid = [
  ".O......O.",
  "..O....O..",
  "...O..O...",
  "....OO....",
  "...OJJO...",
  "..OJWJJO..",
  "...OJJO...",
  "....OO....",
  "..........",
  "..........",
];

export const PROP_TORCH: Grid = [
  "..OO..",
  ".OW3O.",
  ".O33O.",
  "..OO..",
  "..OO..",
  "..OO..",
  "..OO..",
  "..OO..",
  "..OO..",
  "..OO..",
  "..OO..",
  "..OO..",
];

export const PROP_BONES: Grid = [
  "...OO.......",
  ".O111OOO..O.",
  "O1OOOO11OO1O",
  "O1OOOO11OO1O",
  ".11111OO..OO",
  "..OOOO......",
  "..OOO.......",
  "............",
];

export const PROP_MUSHROOM: Grid = [
  ".........",
  "..OOOOO..",
  ".11111W1.",
  "O1W11111O",
  "O111W11WO",
  ".O12221O.",
  "..OOOOO..",
  "...O2O...",
  "...OOO...",
];

export const PROP_CRYSTAL: Grid = [
  "....OO...",
  "...W11O..",
  "..OWW11O.",
  ".O1WW11O.",
  "O11WW11O.",
  "O11WW111O",
  ".OOWW111O",
  "...O11OO.",
  "....O....",
  ".........",
  ".........",
];

export const PROP_ROCK: Grid = [
  "...........",
  "...OOOOO...",
  ".O1WWW111O.",
  "O111111111O",
  "O111111221O",
  "OOOOOOOOOOO",
  "...........",
];

export const PROP_CHEST: Grid = [
  "................",
  "....OOOOOOOO....",
  "..OWWWW111111O..",
  ".O111111111111O.",
  "OOOOOOO11OOOOOOO",
  "OOOOOO1JJ1OOOOOO",
  "O222222JJ122222O",
  "O22222211122222O",
  "O22222211222222O",
  "O22222222222222O",
  ".OOOOOOOOOOOOOO.",
];

/**
 * Boss grids under the names `data/bosses.ts` uses for them, so a typo in a `sprite`
 * field is a failed smoke test rather than a blank monster in somebody's raid.
 */
/** The Ferryman: a drowned column of rotting robe under a hood, poling a boat that
 * isn't there. Narrow and vertical — nothing else in the roster has that silhouette. */
export const BOSS_FERRYMAN: Grid = [
  "..........OOOO............",
  ".........O2222O...........",
  "........O222222O.....OO...",
  "........O22eeee2O....O1O..",
  "........O22eeee2O....O1O..",
  ".......O222222222O...O1O..",
  ".......O222222222O...O1O..",
  "......O33222222233O..O1O..",
  ".....O3332222222333OOO1O..",
  "....O33332222222333O11O...",
  "....O333332222233333OO1O..",
  "....O33333333333333OOO1O..",
  "...O333333333333333OOO1O..",
  "...O3333333333333333OO1O..",
  "...O33333333333333333O1O..",
  "...O3333333333333333O.O1O.",
  "..O33333333333333333O.O1O.",
  "..O33333333333333333O.O1O.",
  "..O3333333333333333O..O1O.",
  "..O333333333333333O...O1O.",
  "..O33333333333333O....O1O.",
  "..O3333333333333O.....O1O.",
  "..O333O3333O333O......O1O.",
  "..OOO..OOO..OOO.......O1O.",
  "......................O1O.",
  "......................OOO.",
];

/** Queen of the Seventh Circle: a war goddess wearing the regalia of five dead
 * civilisations at once. Crested, and the widest shoulders in the game. */
export const BOSS_WARQUEEN: Grid = [
  "............OO............",
  "...........O55O...........",
  "..........O5555O..........",
  "..........O5555O..........",
  ".........O111111O.........",
  "........O11111111O........",
  "........O1eeeeee1O........",
  "........O11111111O........",
  ".......O2211111122O.......",
  "....OO222222222222222OO...",
  "..OO2222222222222222222OO.",
  ".O222222222222222222222222",
  ".O332222222222222222223333",
  ".O33322222211112222233333O",
  ".O3332222211111122223333O.",
  "..O33222211111111222333O..",
  "..O3322221111111122233O...",
  "...O22221111111112222O....",
  "...O2222211111112222O.....",
  "...O2222221111O22222O.....",
  "...O3333322222222333O.....",
  "...O33333322222233333O....",
  "...O33333O22222OO3333O....",
  "...O333O..O222O..O333O....",
  "...OOO....O222O....OOO....",
  "..........OOOOO...........",
];

/** Minotaur of the Ninth Labyrinth: horns first — the spread is the read — over a body
 * of maze masonry that doesn't quite line up with itself. */
export const BOSS_LABYRINTH: Grid = [
  "OO......................OO",
  "O11O..................O11O",
  "O111O................O111O",
  ".O111O..............O111O.",
  ".O1111O....OOOO....O1111O.",
  "..O1111O..O2222O..O1111O..",
  "..O11111OO222222OO11111O..",
  "...O1111O22eeee22O1111O...",
  "...O111OO2222222OO111O....",
  "....OOO.O2222222O.OOO.....",
  ".......O222222222O........",
  "....OOO333333333333OOO....",
  "..OO33333333333333333OO...",
  ".O3333333333333333333333O.",
  "O333333333333333333333333O",
  "O333322222222222222333333O",
  "O333322222222222222333333O",
  "O333333222222222233333333O",
  ".O3333333333333333333333O.",
  ".O3333333333333333333333O.",
  "..O33333333333333333333O..",
  "..O3333O33333333O333333O..",
  "..O333O..O3333O..O3333O...",
  "..O333O..O3333O..O333O....",
  "..OOOO...OOOOO...OOOO.....",
  "..........................",
];

/** Tyrant of the First Heavens: rigid bilateral symmetry, a faceless slit helm and a
 * greatsword planted point-down. Heaven's geometry, tarnished. */
export const BOSS_TYRANT: Grid = [
  "...........OO.............",
  "..........O44O............",
  "..........O44O............",
  ".........O4444O...........",
  ".........O4444O...........",
  "........O411114O..........",
  "........O4eeee4O..........",
  "........O411114O..........",
  "........OO4444OO..........",
  ".....OOO44444444OOO.......",
  "...OO4444444444444OO......",
  "..O44444111111144444O.....",
  "..O444111111111111444O....",
  ".O444111111111111111444O..",
  ".O44111111111111111114OOO.",
  ".O4411111111111111111O7O..",
  ".O441111177711111111O7O...",
  "..O4411117771111114O7O....",
  "..O44111177711111O7O......",
  "...O4411111111114O7O......",
  "...O441111111111447O......",
  "...O44411111111447O.......",
  "...O444O11111O444O....O7..",
  "...O444O.....O444O...O7...",
  "...OOOO.......OOOO...O7...",
  ".....................OOO..",
];

export const BOSS_GRIDS: Record<string, Grid> = {
  boss: BOSS_WARDEN,
  bossChoir: BOSS_CHOIR,
  bossColossus: BOSS_COLOSSUS,
  bossHerald: BOSS_HERALD,
  bossNameless: BOSS_NAMELESS,
  // The four raid encounters (§2.1 of docs/art-manifest.md). Raids shipped reusing a
  // floor boss's sprite wholesale, so "an enormous mythological event" looked like an
  // ordinary depth-16 fight; these give each one a silhouette of its own.
  bossFerryman: BOSS_FERRYMAN,
  bossWarQueen: BOSS_WARQUEEN,
  bossLabyrinth: BOSS_LABYRINTH,
  bossTyrant: BOSS_TYRANT,
};

// --- palettes -------------------------------------------------------------
//
// Colours are art, so they live here with the pixels rather than in `sprites.ts`. That
// also means a headless tool — the smoke test, or the contact-sheet previewer — can ask
// for the real colours a sprite is baked with instead of guessing at them.
//
// The monster palettes are deliberately low and dirty: bruised purples, dried blood,
// cold steel, grave green. The only bright colours on a monster are the ones that are
// looking at you, which is what makes an eye read as a threat at a glance.

/** The one dark used for every outline in the game, so nothing looks pasted in. */
export const OUTLINE = "#1a1422";

// --- colour helpers -------------------------------------------------------

/** Mixes a hex colour toward black (t < 0) or white (t > 0). Used for cheap shading. */
export function shift(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = t > 0 ? 255 : 0;
  const a = Math.abs(t);
  const r = Math.round(((n >> 16) & 255) * (1 - a) + to * a);
  const g = Math.round(((n >> 8) & 255) * (1 - a) + to * a);
  const b = Math.round((n & 255) * (1 - a) + to * a);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export const PALETTES = {
  crawler: {
    O: OUTLINE, "1": "#7a2f6a", "2": "#3f1338", W: "#c98fd8",
    E: "#ff3b6b", e: "#180208", M: "#2a0713", T: "#f2e6d8",
  },
  imp: {
    O: OUTLINE, "1": "#e8dcc4", S: "#a8382c", W: "#fff0dd", E: "#ffd84a",
    e: "#1c0402", M: "#160303", C: "#33202a", T: "#b8431f", L: "#41190f",
    B: "#201218",
  },
  ranger: {
    O: OUTLINE, "1": "#2b4a3a", "2": "#050b09", C: "#22392e", T: "#40705a",
    E: "#9dff5c", e: "#12300a", B: "#161f1b", W: "#dff5cc",
  },
  brute: {
    O: OUTLINE, "1": "#8e8ea0", K: "#5f5f6e", T: "#33333f", E: "#ff7a2a",
    e: "#210800", W: "#ffd9a0", L: "#332b33", B: "#1e1c26",
  },
  caster: {
    O: OUTLINE, "1": "#3a2168", "2": "#08031a", E: "#b45cff", W: "#f4e2ff",
    T: "#553099", S: "#d3c6ec",
  },
  warden: {
    O: OUTLINE, "1": "#c9a14a", "2": "#332f42", "4": "#8f97ad", "5": "#e6ebf5",
    "6": "#22202b", "7": "#ff4a3a", W: "#ffc9a0", e: "#1d0300",
  },
  choir: {
    O: OUTLINE, "2": "#3b1f7a", "3": "#150826", "4": "#8a63e0", "7": "#ffc2ff",
    e: "#0b0416",
  },
  colossus: {
    O: OUTLINE, "1": "#3b3429", "2": "#5b5245", "3": "#28231b", "4": "#7b7260",
    "5": "#b6f24a",
  },
  herald: {
    O: OUTLINE, "1": "#43100a", "2": "#7a1c10", "4": "#f0c050", "5": "#ff8a2a",
    "6": "#2a0d09", "7": "#fff3c4", e: "#230502",
  },
  nameless: {
    O: OUTLINE, "2": "#0e0518", "3": "#37195c", "7": "#ff4ab0", e: "#08020e",
  },
  // The four raids. Each keeps §1.4: everything low and dirty, and `e` — the part that is
  // looking at you — is the only saturated colour, in the raid's own element.
  ferryman: {
    O: OUTLINE, "1": "#4a4036", "2": "#3f4a44", "3": "#2b332f", e: "#7dd3fc",
  },
  warQueen: {
    O: OUTLINE, "1": "#5a4632", "2": "#3a3630", "3": "#241f1c", "5": "#4a2f28",
    e: "#ff7a2f",
  },
  labyrinth: {
    O: OUTLINE, "1": "#4a4238", "2": "#2a2733", "3": "#35313b", e: "#c084fc",
  },
  tyrant: {
    O: OUTLINE, "1": "#8a836f", "4": "#6f6139", "7": "#5f6772", e: "#fde047",
  },
  coin: { O: "#6b4a10", W: "#fff6d0", "1": "#f0c040", J: "#c88a10" },
  key: { O: "#41474f", W: "#f4f8ff", "1": "#b7c2cf" },
  potion: { O: "#2f2130", "1": "#cfd9e8", W: "#ffffff", "3": "#4ade80" },
  gem: { O: "#2f2150", "1": "#8b5cf6", W: "#ffffff" },
  capsule: { O: "#41352a", "1": "#ffd9e8", "2": "#e08ab0", W: "#ffffff" },
  torch: { O: "#31241a", W: "#fff3c4", "1": "#ffb020", "3": "#ff5c1a", "2": "#4e331d" },
  bones: { O: "#6f6759", "1": "#ddd6c2" },
  mushroom: { O: "#3f141d", "1": "#c04a5e", W: "#ffe8f0", "2": "#d8ccb4" },
  crystal: { O: "#2f2150", "1": "#a78bfa", W: "#f0e8ff" },
  rock: { O: "#333940", "1": "#78818f", W: "#b2bac6", "2": "#4c545f" },
  chest: { O: "#31200e", "1": "#c8912f", W: "#ffe9a8", "2": "#6b4019", J: "#ffd34d" },
  armor: { O: OUTLINE, "1": "#8f96a8", "2": "#525869", J: "#ffd34d" },
  shield: { O: OUTLINE, "1": "#9aa2b4", "2": "#525869", "3": "#ffd34d" },
  ring: { O: OUTLINE, "1": "#e0b060", J: "#7dd3fc", W: "#ffffff" },
  gloves: { O: OUTLINE, "1": "#95613e", "2": "#e0b060" },
  necklace: { O: OUTLINE, "2": "#e0b060", J: "#7dd3fc", W: "#ffffff" },
} satisfies Record<string, Palette>;

/**
 * The palette the body grid is painted with, derived from a character's choices.
 *
 * The brow takes the hair's shade rather than a fixed dark, because an angled brow is
 * the single most expressive thing on the face and it has to belong to the head it is on.
 */
export function bodyPalette(a: Appearance): Palette {
  const skinTone = SKIN_TONES[a.skin] ?? SKIN_TONES[0]!;
  const eye = EYE_COLORS[a.eyes] ?? EYE_COLORS[0]!;
  const dye = OUTFIT_DYES[a.dye] ?? OUTFIT_DYES[0]!;
  const hair = HAIR_COLORS[a.hair] ?? HAIR_COLORS[0]!;
  return {
    O: OUTLINE,
    S: skinTone.skin,
    s: shift(skinTone.skin, -0.2),
    W: "#ffffff",
    E: eye.eye,
    // The lash line above the iris, not an outline around it: at two pixels of iris an
    // outline eats the whole eye, and the hard line on top is what makes it a glare.
    e: shift(eye.eye, -0.6),
    w: hair.shade,
    M: shift(skinTone.skin, -0.55),
    C: dye.cloth,
    T: dye.trim,
    L: dye.belt,
    P: shift(dye.cloth, -0.45),
    B: shift(dye.belt, -0.35),
  };
}

export function hairPalette(a: Appearance): Palette {
  const hair = HAIR_COLORS[a.hair] ?? HAIR_COLORS[0]!;
  return { O: OUTLINE, H: hair.hair, h: hair.shade, g: shift(hair.hair, 0.35) };
}

/** A cosmetic's three colour slots, plus the shared outline and highlight. */
export function cosmeticPalette(c: Cosmetic): Palette {
  const [one, two, three] = c.colors;
  return {
    O: OUTLINE,
    "1": one ?? "#ffffff",
    "2": two ?? shift(one ?? "#ffffff", -0.35),
    "3": three ?? two ?? "#ffffff",
    W: "#ffffff",
  };
}

/**
 * A weapon's colours when no cosmetic skin is equipped. The blade stays steel at every
 * rarity on purpose — a green sword at uncommon looks broken, whereas a steel sword with
 * a green stone in the pommel reads as "this one is a bit better", which is the truth.
 */
export function rarityWeaponPalette(rarity: Rarity | null): WeaponPalette {
  const color = rarity ? RARITY_COLORS[rarity] : "#9aa0a6";
  const tier = rarity ? rarityIndex(rarity) : 0;
  return {
    edge: "#dbe3ef",
    shade: "#79839a",
    grip: "#4e3828",
    jewel: color,
    glow: tier >= 3 ? color : null,
  };
}

export function weaponPalette(p: WeaponPalette): Palette {
  return {
    O: OUTLINE,
    E: p.edge,
    e: p.shade,
    W: shift(p.edge, 0.5),
    G: p.grip,
    g: shift(p.grip, -0.3),
    J: p.jewel,
    "1": p.edge,
    "2": p.shade,
  };
}

// --- validation -----------------------------------------------------------

/** Every grid in the game, keyed by a name a test can print when one is wrong. */
export function allGrids(): Record<string, Grid> {
  const out: Record<string, Grid> = {
    BODY,
    MOB_CRAWLER, MOB_IMP, MOB_RANGER, MOB_BRUTE, MOB_CASTER,
    BOSS_WARDEN, BOSS_CHOIR, BOSS_COLOSSUS, BOSS_HERALD, BOSS_NAMELESS,
    ICON_COIN, ICON_KEY, ICON_POTION, ICON_GEM, ICON_CAPSULE,
    ICON_ARMOR, ICON_SHIELD, ICON_RING, ICON_GLOVES, ICON_NECKLACE,
    PROP_TORCH, PROP_BONES, PROP_MUSHROOM, PROP_CRYSTAL, PROP_ROCK, PROP_CHEST,
  };
  for (const [k, v] of Object.entries(HAIR)) out[`HAIR.${k}`] = v;
  for (const [k, v] of Object.entries(COSMETIC_ART)) out[`COSMETIC_ART.${k}`] = v.grid;
  for (const [k, v] of Object.entries(WEAPON_ART)) out[`WEAPON_ART.${k}`] = v.grid;
  return out;
}

/**
 * Returns a complaint for every grid that isn't a rectangle, so the smoke test can fail
 * on a miscounted row rather than letting the baker throw in somebody's browser.
 */
export function gridProblems(): string[] {
  const problems: string[] = [];
  for (const [name, grid] of Object.entries(allGrids())) {
    if (grid.length === 0) {
      problems.push(`${name}: empty grid`);
      continue;
    }
    const w = grid[0]!.length;
    if (w === 0) problems.push(`${name}: zero-width grid`);
    grid.forEach((row, y) => {
      if (row.length !== w) problems.push(`${name}: row ${y} is ${row.length} wide, expected ${w}`);
    });
  }
  return problems;
}
