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
- **The Seamless Sword.** The second one, and Heaven's answer to the Abyssal Scythe: a
  blade with no join, no forge mark and no wear anywhere on it, held in a heavy gold
  collar. It draws whenever you are holding a sword.
- **Your wardrobe now remembers a skin for each weapon type, not one skin overall.** This
  is the change that makes the drawn skins actually usable. Before, the Weapon Skin slot
  held a single choice — so owning both of the above meant picking one and seeing nothing
  when you carried the other. Now you set a look per weapon type and the right one appears
  for whatever is in your hand. The Style screen's Weapon Skin row tells you which weapon
  it is choosing for, and only offers skins that fit it.
- **Nothing you already own was taken away.** The seven original skins — Bonecarved,
  Confection, Frostbound, Neon Signal, Petalfall, Abyssal and Starforged — were painted
  over any weapon rather than drawn as one, so they still go on every weapon type, exactly
  as before. If you had one equipped, it comes back equipped everywhere.
- **A skin now shows its real picture in the wardrobe.** The Abyssal Scythe used to
  preview as a *sword* wearing its colours, which is not a thing you can hold.

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
- **The Tower works in co-op now.** Trying to climb with a friend used to drop both of you
  into an ordinary Delve floor instead — the lobby and the on-screen prompt even said
  "Delve depth N," not "Tower." The party now actually goes wherever whoever's hosting
  picked.

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
- **A boss commits to its swing instead of quietly re-aiming at the last second.** Six
  abilities — a cleave, a charge, a beam, a spinning strike, a star-shaped burst and a
  sweeping slash — used to keep tracking whoever was closest right up to the moment they
  landed, even after the telegraph had already shown you where they were going. In co-op
  this looked like the boss snapping onto a different player at the last instant. Playing
  solo, it meant sidestepping a telegraphed line or cone during the wind-up sometimes did
  nothing, because the attack was still quietly following you the whole time it looked
  like it had already committed. Now it hasn't moved once the wind-up starts, so stepping
  out of it during the wind-up actually works.
- **Most abilities that used to hit the entire floor now only reach the room you're
  standing in.** Roughly twenty abilities across sixteen classes — a paladin's charge, a
  juggernaut's taunt and his ultimate, a warden's stance, a stormcaller's ultimate, a
  reaper's hook, a corsair's powder keg, and a string of self-cast auras and reprisals —
  used to instantly hit every monster on the floor regardless of distance. They now reach
  about a room's width. Five traps and mines also used to catch things standing near
  *you*, even long after you'd planted them and walked away; they now catch things
  standing near the trap, which is where a trap should be watching. Two abilities still
  hit the whole floor on purpose — both are ultimates now, down from four, and both say so
  in their own description. **One thing to watch for that nobody asked for:** a tree
  upgrade for one class had quietly done nothing since it was added, because the ability
  it was supposed to widen had no reach of its own to widen. Giving that ability a real
  reach to build on means the upgrade finally works — and it now makes that ability's
  area the single largest of any non-ultimate skill in the game. That's a buff, not a fix,
  and it landed as a side effect of closing the bug above.

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

## Leaderboards

- **There are leaderboards.** Fourteen of them, in the Quartermaster: furthest depth and
  furthest height, the Abyssal Rift, every raid, the Memories, the Vigil and the
  Convergence, plus the odd ones you asked for — strongest item currently in the game, and
  highest single hit ever recorded.
- **You can filter every board by class.**
- **A record says how hard it actually was.** A depth on a board carries the Challenger
  tier it was banked at, so clearing depth 20 with the dial off and clearing depth 20 on
  Death March are not the same line. A Tower height never shows up on a depth board.
- **The depth boards are going to look clustered, and that is the honest result.** Almost
  everyone will sit inside a narrow range, because that is where the game currently stops
  people. It was left uncompressed on purpose rather than stretched to look more
  interesting — see the note below.
- **There is a "recent records" ticker** so you can see what other people just did.

## Named items and relics

- **Named items and relics/artifacts have their own screen now, called Collection.** They
  used to be two lists buried in the Quartermaster's Records tab; they're a proper grid
  now, browsed and navigated with WASD the same way the Stash is. Everything shows up
  whether you've found it yet or not, so you can still see what a piece does and where it
  comes from before you've ever seen one drop — that was always the point of listing them,
  and it's why they moved rather than getting deleted from Records.

## What raids and the Abyssal Rift pay

- **A raid hands you a relic or artifact about half as often as it used to.** A bug meant
  a raid clear was quietly rolling for one twice instead of once. This is a real cut, not
  a rounding fix — if raids felt generous with these before, they're going to feel
  noticeably less so now.
- **The Abyssal Rift hands one out far less often too, and this is the bigger of the two
  changes tonight.** It used to be close to a sure thing on every single clear, no matter
  how deep you'd already gone into a run. Most clears won't have one any more. Nobody ever
  actually decided a relic should be nearly guaranteed there — it crept up on its own,
  a little more each time a new one was added to the game, until pulling one apart became
  almost the expected outcome rather than the reason to go. Early in building a
  collection you'll still see them fairly often; the rate drops off the more of the
  roster you already own, the same as it always did.

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
- Your leaderboard records are sent as their own small message, not by handing the server
  your save file. The server has never been able to read a save and still can't. That is
  worth keeping — it is the reason adding the shop and adding the leaderboards each cost
  the server nothing at all.
- **The depth boards will show everyone bunched together, and there is a real question
  underneath that.** An attentive character currently clears somewhere around depth 13-19
  and then stops, so a "furthest depth" board is going to show most of the playerbase
  inside a six-depth window. Nothing was done to hide that, because deciding whether that
  band is where the game should stop people is your call, not something to quietly paper
  over on a chart. `docs/reachable-band.md` has the measurements and three priced options.
