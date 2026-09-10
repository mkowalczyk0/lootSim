# What a player would see changed

A running list in the player's terms, not ours, for review in a batch. Newest last.
Commit subjects and mechanism live in the git log; this is only "what looks or behaves
different when you play."

## Your character and wardrobe

- **Your hat fits.** Every cosmetic you can wear — the witch hat, the crown, cat ears,
  horns, glasses, the visor, the cape, the wings — was drawn for an older, larger
  character and had never been resized when the hero changed. The witch hat was two and a
  half times as wide as the hero was, the cape was a tent and the wings were four times
  his width. All eight now fit the character actually in the game.
- **The whole wardrobe is drawn now.** Every hat, ear, face item and back item in the game
  has real artwork on the current character — the straw hat, the beanie, the chef's toque,
  the flower circlet, the tall hat, the halo, bunny and fox ears, antennae, blush, the
  eyepatch, fangs, the cat tail, moth wings, the floating tome and the leathery wings. Half
  of them had never been drawn for this character at all.
- **The character screen isn't mostly empty any more.** Your hero filled about a quarter
  of the width of his own portrait box, because the box had been stretched to hold those
  oversized wings. He now fills about half of it.

## Your weapon

- **Wearing a weapon skin no longer makes your weapon look worse.** Equipping any skin —
  including the mythic one — used to swap your weapon's detailed artwork for a small flat
  shape. Skins that have not been drawn yet now leave your weapon alone instead, so you
  keep the good art. Skins with their own artwork are on the way.
- **The Abyssal Scythe exists.** The first weapon skin that is genuinely its own weapon
  rather than a coat of paint on yours — a scythe whose cutting edge is coming apart into
  nothing. It draws whenever you are holding a scythe. Thirteen more are coming, one per
  weapon type.

## The Tower

- **The Tower has its own monsters.** Climbing used to show you the same roster you fight
  on the way down, renamed. Every band of the climb now has its own creatures, drawn for
  it — the Lower Tower, the Seamless Halls and the Blinding Heights each look like their
  own place rather than a recoloured Delve floor.
- **The Tower has its own bosses.** All five of them, drawn rather than borrowed. The
  Nameless at the top is built out of the space where a figure should be.
- **The First Heavens has a floor and walls.** The raid arena at the top of the climb had
  no artwork of its own at all and was falling back to a flat ash bake. It is now its own
  tileset: a dark floor under bright walls, which is the inversion of every other place in
  the game.

## Fighting things

- **Monsters no longer kill each other.** A boss's fire, a trap, a hazard — anything that
  hurt you also hurt every monster standing in it. That meant a fight could partly clear
  itself while you watched. It does not any more. Two encounters got noticeably harder as
  a result and were deliberately left that way: the Warden and the Choir both used to lose
  a fifth of their own adds to their own abilities.
- **Bosses wind up.** The Ferryman, the War Queen and the Tyrant now visibly draw back
  before an ability rather than casting from a standing pose, and the last frame of the
  wind-up holds right before the blow.
- **The Ferryman raises his pole and the Tyrant lifts his sword.** The tops of those
  motions exist now — the wind-up goes somewhere instead of stopping partway.
- **You can see the boss against the floor.** Nothing had ever checked whether a boss was
  actually legible on the ground it fights you on. Four of fourteen were not. Three were
  brightened; the War Queen is close enough that she was left alone rather than repainted
  to satisfy a number borrowed from a different test.
- **A monster can no longer get permanently lost.** A monster that could not see you
  followed a flow field, and that field gave up if the monster was standing somewhere
  awkward — so it would sit there for the rest of the floor while you hunted for it. This
  is the "one last monster stuck behind a wall" problem, and it was a real bug rather than
  a missing indicator.

## The heads-up display

- **Your class resource is on the bar, not mana.** Most classes have not cast with mana
  for a long time — they run on momentum, meter, or whatever the class actually uses — and
  the bar was still showing mana regardless. It now shows the thing your class spends,
  called what your class calls it.
- **The key hints update when you rebind.** They were printing the shipped defaults no
  matter what your Settings said.
- **Elite health bars stopped covering the floor information.**
- **There is a map.** Bottom-right corner, the shape of the floor you are on. The entrance
  portal is dim; the completion portal lights up the moment it spawns, so you are never
  hunting for the way onward.
- **The map tells you where the last few monsters are.** Once you are down to ten or fewer
  kills remaining, the monsters that still count toward the quota show up as pulsing
  blips. Above ten, they do not — this is meant to end the floor, not to be a radar you
  stare at all run. Chaff a summoner made does not appear, because it never counted.

## The shop

- **There is a shop, and it rotates.** Three tiers in the Quartermaster — Daily, Weekly
  and Monthly — each with a few guaranteed items you can just buy with coins instead of
  gambling at a chest. It is the same stock for everybody on the same day, the same way
  the Vigil is the same floor for everybody.
- **Mythics cost millions.** A common is a thousand coins; a mythic is three million. You
  are paying for certainty, so it costs well above what gambling for the same rarity at a
  chest does.
- **Gems reroll the stock, and get more expensive each time you do it in a period.**
- **Rerolling never gets you more purchases.** Each tier lets you buy a fixed number of
  items per period — one a day, two a week, two a month — and no amount of rerolling
  moves that number. Gems change what is on offer to you; they never change how much you
  can take. That line is the whole reason the shop is safe to sell gems for later.
- **The shop stops at mythic.** Divine and unspoken are not rare in the shop, they are
  absent from it. The top of the ladder stays something you find.

## Nothing you can see, but worth knowing

- A weapon skin will never be able to make your weapon look longer or shorter than it
  actually reaches. That was possible before anyone had drawn one, and is now impossible
  by construction rather than by anybody remembering.
- A named weapon keeps its own identity: a cosmetic skin will not draw over it.
- The map added no multiplayer traffic. Every player's game already builds the identical
  floor from a shared seed, and the portal and the monsters were already being sent for
  other reasons.
- The multiplayer stuttering report was investigated and **not** solved. The host's own
  workload and both ends' drawing were measured under a real fight in real browsers and
  came back clean. What is left needs two actual machines on an actual internet
  connection, which is something only you and the person who reported it can produce.
