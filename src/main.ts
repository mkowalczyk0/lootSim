import { GameLoop } from "./core/loop";
import { Input } from "./core/input";
import { formatNumber } from "./core/math";
import { ELEMENT_COLORS } from "./data/elements";
import { delveConfig, MODES, riftConfig, type RunConfig, type RunModeId } from "./data/modes";
import { PLANETS_BY_ID, nextFloorConfig, planetConfig } from "./data/planets";
import { RARITY_COLORS } from "./data/rarity";
import { Dungeon, type HeroSetup } from "./game/dungeon";
import { Hub } from "./game/hub";
import { Party } from "./net/party";
import { GameState } from "./game/state";
import { WorldRenderer } from "./render/draw";
import { Fx } from "./render/fx";
import { renderHub } from "./render/hub";
import { buildSprites, preloadArt } from "./render/sprites";
import { Hud } from "./ui/hud";
import { LootBanner } from "./ui/lootbanner";
import { PUNCH } from "./ui/rarityfx";
import { TownUI, type Tab } from "./ui/town";

type Scene = "hub" | "town" | "dive";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const townRoot = document.querySelector<HTMLElement>("#town")!;
const ctx = canvas.getContext("2d", { alpha: false })!;

buildSprites();

const state = GameState.load();
const input = new Input(state.settings);
const fx = new Fx();
const world = new WorldRenderer();
const hud = new Hud();
const hub = new Hub();
const lootBanner = new LootBanner(document.body);
/** The co-op session. Idle and inert until somebody opens or joins a room. */
const party = new Party(state);

let scene: Scene = "hub";
let dungeon: Dungeon | null = null;
let paused = false;
let viewW = 0;
let viewH = 0;

const town = new TownUI(
  townRoot, state,
  (config) => enterDungeon(config),
  (planet, tier) => {
    // The Reliquary Gate doesn't dive — it spawns a portal for you to walk into.
    hub.setExpedition(planet.id, tier);
    enterHub();
  },
  party,
);

// --- the party ------------------------------------------------------------
// Everything co-op reaches the rest of the game through these four callbacks. Nothing
// else in this file knows whether it is running one character or four.

party.onChange = () => town.refresh();
party.onNotice = (text) => flash(text);

party.onStart = (config, seed, heroes) => {
  enterDungeon(config, { seed, role: party.isHost ? "host" : "client", heroes });
  party.attach(dungeon!);
};

party.onEnd = (how) => {
  const d = dungeon;
  if (!d) return;
  if (how === "wipe") {
    state.save();
    returnToTown();
    flash("The party went down. Everything you were carrying stayed on the floor.");
    return;
  }
  const coins = d.loot.coins;
  const items = d.loot.items.length;
  d.bankLoot();
  state.save();
  if (how === "descend") {
    // Banked, and the host's next floor is already on its way — hold the current one on
    // screen rather than flashing through the ship for a frame.
    flash(`Floor banked: ${formatNumber(coins)} coins, ${items} items. Going deeper.`);
    return;
  }
  returnToTown();
  flash(`Extracted with ${formatNumber(coins)} coins and ${items} items.`);
};

/** Cosmetic options only ever change in town, so the dungeon picks them up on entry. */
function applySettings(): void {
  fx.setOptions(state.settings);
}

/** The ship — the real "home" scene. Every non-combat system is reached from here. */
function enterHub(): void {
  scene = "hub";
  canvas.hidden = false;
  lootBanner.clear();
  town.hide();
}

/** Opened by walking up to a hub station; `tab` is which one, `riftMode` pins a
 *  specific rift portal instead of whichever the Rifts screen last had selected. */
function enterTown(tab?: Tab, riftMode?: RunModeId): void {
  scene = "town";
  canvas.hidden = true;
  town.show(tab, riftMode);
}

function enterDungeon(
  config: RunConfig,
  net?: { seed: number; role: "host" | "client"; heroes: HeroSetup[] },
): void {
  applySettings();
  dungeon = net
    ? new Dungeon(state, config, { seed: net.seed, role: net.role, heroes: net.heroes })
    : new Dungeon(state, config);
  scene = "dive";
  paused = false;
  town.hide();
  lootBanner.clear();
  fx.clear();
  world.reset();
  canvas.hidden = false;
}

/** A dive always ends back at the ship, not straight into a town tab — the hub is the
 *  "you're safe now" landing spot, and every management screen is a walk away from it. */
function returnToTown(): void {
  dungeon = null;
  party.detach();
  state.player.fullHeal();
  state.save();
  // Back on the ship with whatever the run left you holding — the rest of the room
  // needs the new numbers, since the host builds everyone's character from these.
  party.sendHello();
  enterHub();
}

/** Confirm, pressed near a hub station. */
function handleHubInteraction(): void {
  const station = hub.nearStation();
  if (!station) return;
  // While a party room is open, every other portal has to wait — walking into the
  // Delve (or a rift, the Reliquary Gate, a sector portal or the forge) would launch a solo run out
  // from under the room and strand whoever joined. The Party Portal and the screens
  // that don't start a run (Comms Relay, the Quartermaster) stay open.
  if (party.inRoom && station.kind !== "party" && station.kind !== "comms" && station.kind !== "quartermaster") {
    flash("You're in a party — walk into the Party Portal to dive together.");
    return;
  }
  switch (station.kind) {
    case "dive": enterTown("Dive"); break;
    case "abyss": enterTown("Rifts", "abyss"); break;
    case "hoard": enterTown("Rifts", "hoard"); break;
    case "starmap": enterTown("StarMap"); break;
    case "forge": enterTown("Craft"); break;
    case "quartermaster": enterTown("Stash"); break;
    case "comms": enterTown("Party"); break;
    // The party portal isn't opened by pressing anything — standing in it is the ready
    // signal, and the host's run starts when the last person is inside. Pressing confirm
    // on it just opens the room screen, which is where you'd look anyway.
    case "party": enterTown("Party"); break;
    case "expedition": {
      const expedition = hub.expedition;
      const planet = expedition ? PLANETS_BY_ID[expedition.planetId] : undefined;
      if (!expedition || !planet) break;
      state.player.fullHeal();
      hub.clearExpedition();
      enterDungeon(planetConfig(planet, expedition.tier, 1, state.challengerTier));
      break;
    }
  }
}

/** Resolution follows the window, with a devicePixelRatio backing store for crisp text. */
function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// The mouse only ever drives the dungeon (aim and attack) in "mouse" control scheme;
// `Input.handleMouseButton` itself no-ops the buttons in "keyboard" scheme, and a click
// while a town screen is open is caught by `TownUI`'s own listener on `#town`, not this
// one, so exclusive keyboard stays exactly that everywhere it's chosen.
let mouseViewX = 0;
let mouseViewY = 0;
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseViewX = e.clientX - rect.left;
  mouseViewY = e.clientY - rect.top;
});
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) input.handleMouseButton("left", true);
  else if (e.button === 2) input.handleMouseButton("right", true);
});
canvas.addEventListener("mouseup", (e) => {
  if (e.button === 0) input.handleMouseButton("left", false);
  else if (e.button === 2) input.handleMouseButton("right", false);
});
// The right button is a real bindable action here, not a browser context menu.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

/** Turn simulation events into particles, numbers and shake. */
function consumeEvents(d: Dungeon): void {
  for (const ev of d.drainEvents()) {
    // A few events belong to one specific member of the party. Somebody else's
    // level-up doesn't take over your screen, and their unspoken drop is their moment.
    if ("owner" in ev && ev.owner !== d.localHero.index) continue;
    switch (ev.kind) {
      case "damage": {
        // Elemental hits are coloured by their element, so you can see at a glance
        // which half of your gear is actually doing the work.
        const color = ev.onPlayer ? "#ff6b6b"
          : ev.crit ? "#ffd34d"
          : ev.element === "physical" ? "#ffffff"
          : ELEMENT_COLORS[ev.element];
        fx.text(ev.x, ev.y, String(ev.amount), color, ev.crit ? 16 : 12);
        if (!ev.onPlayer) {
          // A four-pointed flash on every landed hit, bigger and gold on a crit. This
          // is the single cheapest thing that makes combat feel like it connects.
          fx.star(ev.x, ev.y, ev.crit ? 16 : 9, ev.crit ? "#ffd34d" : color);
          fx.burst(ev.x, ev.y, ev.crit ? "#ffd34d" : color, ev.crit ? 10 : 5, 120);
          if (ev.crit) fx.sparkle(ev.x, ev.y, "#ffd34d", 8, 150);
        }
        break;
      }
      case "death": {
        const color = ev.elite ? RARITY_COLORS[ev.elite] : "#ff6b6b";
        fx.burst(ev.x, ev.y, color, ev.elite ? 26 : 14, 190);
        fx.ring(ev.x, ev.y, ev.elite ? 46 : 28, color, 2);
        fx.sparkle(ev.x, ev.y, ev.elite ? color : "#ffd9e8", ev.elite ? 14 : 6, 160);
        break;
      }
      /**
       * A swing. The simulation hands over the arc it actually hit along, so the
       * crescent on screen is the hitbox rather than an approximation of it.
       */
      case "swing": {
        if (ev.pattern === "bolt") break;
        const element = ev.element;
        const base = ev.ultimate ? "#ffd34d"
          : element === "physical" ? "#e8f4ff"
          : ELEMENT_COLORS[element];
        if (ev.pattern === "thrust") {
          fx.slash(ev.x, ev.y, ev.angle, 0, 8, ev.reach, base, true);
        } else if (ev.pattern === "orb") {
          fx.slash(ev.x, ev.y, ev.angle, Math.PI * 2, ev.reach * 0.55, ev.reach, base);
        } else {
          fx.slash(ev.x, ev.y, ev.angle, ev.arc, ev.reach * 0.34, ev.reach, base);
        }
        break;
      }
      case "pickup":
        fx.text(ev.x, ev.y, ev.label, ev.color, 11);
        fx.sparkle(ev.x, ev.y, ev.color, 5, 80);
        break;
      case "loot": {
        // An ordinary drop reads its own rarity colour and gets out of the way. Anything
        // from legendary up takes the screen instead — the world flashes, the camera is
        // knocked, and `LootBanner` puts the word up. Watching the top-right corner
        // should never be how you find out you got the thing you were grinding for.
        const color = RARITY_COLORS[ev.item.rarity];
        fx.text(ev.x, ev.y, ev.item.name, color, 11);
        fx.sparkle(ev.x, ev.y, color, 5, 80);
        if (LootBanner.wants(ev.item.rarity)) {
          const p = PUNCH[ev.item.rarity];
          fx.ring(ev.x, ev.y, 120, color, 4);
          fx.ring(ev.x, ev.y, 70, "#ffffff", 2);
          fx.burst(ev.x, ev.y, color, 40, 300);
          fx.sparkle(ev.x, ev.y, "#ffffff", 26, 240);
          fx.addShake(p.shake === 2 ? 18 : 10);
          lootBanner.show(ev.item);
        }
        break;
      }
      case "levelUp":
        fx.text(d.avatar.x, d.avatar.y - 40, `LEVEL ${d.player.level}`, "#7dd3fc", 20);
        fx.ring(d.avatar.x, d.avatar.y, 90, "#7dd3fc", 4);
        fx.burst(d.avatar.x, d.avatar.y, "#7dd3fc", 30, 220);
        fx.sparkle(d.avatar.x, d.avatar.y, "#ffd34d", 22, 200);
        break;
      case "nova":
        fx.ring(ev.x, ev.y, ev.radius, "#ff1493", 6);
        fx.ring(ev.x, ev.y, ev.radius * 0.7, "#ffffff", 3);
        fx.burst(ev.x, ev.y, "#ff1493", 40, 320);
        break;
      case "shake":
        fx.addShake(ev.amount);
        break;
      case "trap": {
        // Hazards get their own colored puff so a hit reads as "the floor did that".
        const color = ev.trap === "flame" ? "#ff8a3c"
          : ev.trap === "turret" ? "#fca5a5"
          : ev.trap === "mire" ? "#4ade80"
          : "#e2e8f0";
        fx.burst(ev.x, ev.y, color, ev.trap === "flame" ? 18 : 10, ev.trap === "flame" ? 150 : 110);
        fx.ring(ev.x, ev.y, ev.radius, color, 2);
        break;
      }
      case "wave":
        fx.text(d.avatar.x, d.avatar.y - 56, `WAVE ${ev.wave}`, "#fbbf24", 16);
        break;
      case "boom":
        // A mechanic landing. The ring is the same shape the telegraph promised.
        fx.ring(ev.x, ev.y, Math.max(24, ev.radius), ev.color, 5);
        fx.burst(ev.x, ev.y, ev.color, 22, 240);
        fx.star(ev.x, ev.y, Math.min(34, Math.max(14, ev.radius * 0.3)), "#ffffff");
        break;
      case "bolt": {
        // Chain lightning: a line of sparks between the two bodies it jumped across.
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          fx.burst(ev.x1 + (ev.x2 - ev.x1) * t, ev.y1 + (ev.y2 - ev.y1) * t, ev.color, 2, 40);
        }
        break;
      }
      case "cast":
        // A spell leaving your hands gets a ring and a spray of its own colour, so a
        // cast is visible even when whatever it did happens on the far side of the room.
        fx.text(ev.x, ev.y, ev.label, ev.color, 12);
        fx.ring(ev.x, ev.y, 40, ev.color, 3);
        fx.sparkle(ev.x, ev.y, ev.color, 10, 130);
        break;
      case "bossSpawn":
        fx.text(d.avatar.x, d.avatar.y - 70, ev.name.toUpperCase(), "#ff2d2d", 22);
        fx.text(d.avatar.x, d.avatar.y - 46, ev.title, "#9aa4b2", 12);
        fx.addShake(12);
        break;
      case "bossPhase":
        fx.text(d.avatar.x, d.avatar.y - 62, ev.name.toUpperCase(), "#ffd34d", 20);
        fx.ring(d.avatar.x, d.avatar.y, 160, "#ffd34d", 4);
        break;
      case "bossCast":
        break;
      case "bossDown":
        fx.burst(ev.x, ev.y, "#ffd34d", 60, 340);
        fx.ring(ev.x, ev.y, 220, "#ffd34d", 6);
        fx.ring(ev.x, ev.y, 140, "#ffffff", 3);
        fx.sparkle(ev.x, ev.y, "#ffffff", 40, 300);
        fx.text(ev.x, ev.y - 40, "DOWN", "#ffd34d", 26);
        break;
      case "ultimate":
        // The one button that is entirely yours deserves to be unmissable.
        fx.text(ev.x, ev.y - 52, ev.name.toUpperCase(), ev.color, 22);
        fx.ring(ev.x, ev.y, 150, ev.color, 5);
        fx.ring(ev.x, ev.y, 90, "#ffffff", 2);
        fx.burst(ev.x, ev.y, ev.color, 34, 280);
        fx.sparkle(ev.x, ev.y, "#ffffff", 26, 220);
        break;
      case "trail":
        fx.burst(ev.x, ev.y, ev.color, 3, 70);
        break;
      case "totem":
        fx.ring(ev.x, ev.y, 34, ev.color, 3);
        fx.burst(ev.x, ev.y, ev.color, 12, 120);
        fx.sparkle(ev.x, ev.y, ev.color, 8, 90);
        break;
      case "cleared":
        fx.text(d.portal.x, d.portal.y - 40, "PORTAL OPEN", "#7dd3fc", 16);
        fx.ring(d.portal.x, d.portal.y, 120, "#7dd3fc", 3);
        break;
      case "playerDied":
        fx.addShake(20);
        fx.burst(d.avatar.x, d.avatar.y, "#ef4444", 40, 260);
        break;
    }
  }
}

/**
 * Portal choices and the death screen are handled here, outside the simulation.
 *
 * The delve descends one floor at a time forever. A rift walks its fixed sequence and
 * ends when its boss is dead — at which point the whole run banks and the next tier
 * opens. Extracting works identically in both: you keep what you carried and the rift
 * stays where it was.
 */
function handleRunDecisions(d: Dungeon): void {
  // In a party only the host decides. A client at the portal is told to wait, which is
  // the honest answer: there is one simulation and it is not theirs.
  if (d.role === "client") return;

  if (d.atPortal) {
    if (d.canDescend && input.wasPressed("confirm")) {
      const config = d.config;
      // Nobody gets dragged down a floor while they're still picking up the last room.
      if (d.isParty && d.partyAtPortal < d.heroes.length) {
        flash(`Waiting for the party — ${d.partyAtPortal}/${d.heroes.length} at the portal.`);
        return;
      }
      d.bankLoot();
      state.save();
      if (d.isParty) {
        party.endRun("descend");
        party.descend(config);
        return;
      }
      if (!config.mode.isRift || !config.lastFloor) {
        // Derived from the floor you just cleared, so the challenger tier, the rift
        // tier and the planet all survive the descent.
        enterDungeon(nextFloorConfig(config));
        return;
      }
      const tier = state.riftTiers[config.mode.id];
      returnToTown();
      flash(`${config.mode.name} tier ${config.tier} closed. Tier ${tier} is open.`);
      return;
    }
    if (input.wasPressed("cancel")) {
      const coins = d.loot.coins;
      const items = d.loot.items.length;
      const gems = d.loot.gems;
      // Extracting is the safe call, so the host can make it alone — everybody's loot
      // banks, wherever they happen to be standing.
      if (d.isParty) party.endRun("extract");
      d.bankLoot();
      state.save();
      returnToTown();
      flash(
        `Extracted with ${formatNumber(coins)} coins, ${items} items`
        + `${gems > 0 ? ` and ${formatNumber(gems)} gems` : ""}.`,
      );
      return;
    }
  }
  if (d.phase === "dead" && input.wasPressed("confirm")) {
    // Loot is deliberately not banked — dying costs you the whole dive.
    if (d.isParty) party.endRun("wipe");
    state.save();
    returnToTown();
  }
}

function update(dt: number): void {
  if (scene === "dive") {
    const worldMouse = world.screenToWorld(mouseViewX, mouseViewY, viewW, viewH);
    input.setMouseWorld(worldMouse.x, worldMouse.y);
  }
  input.beginTick();
  fx.update(dt);

  if (scene === "hub") {
    hub.update(dt, input);
    // Tells the room where you're standing, draws everybody else on the deck, and —
    // if you're hosting — starts the run once the last person is in the portal.
    party.syncHub(hub, dt);
    if (input.wasPressed("confirm")) handleHubInteraction();
    return;
  }
  if (scene === "town") {
    town.update(input);
    // Escape backs all the way out to the ship — town has nowhere else to go now that
    // it's reached by walking to a station rather than being the default screen.
    if (input.wasPressed("pause")) enterHub();
    return;
  }
  const d = dungeon;
  if (!d) return;

  // An unspoken drop stops the world. Nothing simulates, nothing decides, nothing can
  // hit you — the rarest thing in a game named after it gets to interrupt whatever you
  // were in the middle of, and it holds until you acknowledge it.
  if (lootBanner.halting) {
    if (input.anyPressed()) lootBanner.dismiss();
    return;
  }

  // Pausing is a solo luxury: three other people are still fighting, so in a party the
  // key does nothing rather than freezing your own screen out of a live floor.
  if (input.wasPressed("pause") && d.phase !== "dead" && !d.isParty) paused = !paused;
  // The simulation is frozen while paused, but decisions still respond so the player
  // can read the control list and then act without an extra keypress to unpause.
  party.beforeSim();
  if (!paused) d.update(dt, input);
  // Before the events are drained: the host has to forward them to the people they
  // belong to, and `consumeEvents` empties the list.
  party.afterSim(d, input);
  consumeEvents(d);
  if (!paused) handleRunDecisions(d);
}

function render(alpha: number): void {
  if (scene === "hub") {
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, viewW, viewH);
    renderHub(ctx, hub, state.appearance, viewW, viewH);
    return;
  }
  if (scene !== "dive" || !dungeon) return;
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, viewW, viewH);
  world.render(ctx, dungeon, fx, alpha, viewW, viewH);
  hud.draw(ctx, dungeon, viewW, viewH, paused);
}

/** Brief banner over the town, for extract confirmations. */
function flash(text: string): void {
  const el = document.querySelector<HTMLElement>("#flash")!;
  el.textContent = text;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 3400);
}

// Typing in a field (the Comms Relay's name/room-code boxes) must never drive the
// character. "focusout" re-enables input once the field loses focus — without it,
// blurring the field (Escape, Enter, or a click elsewhere) left the keyboard dead,
// including Escape itself, so there was no way back to the ship.
function isTextField(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}
window.addEventListener("focusin", (e) => {
  input.setEnabled(!isTextField(e.target));
});
window.addEventListener("focusout", () => {
  // The element about to gain focus isn't known yet at "focusout" time, so check on
  // the next tick once `document.activeElement` has actually moved.
  window.setTimeout(() => input.setEnabled(!isTextField(document.activeElement)), 0);
});

applySettings();

// The pipeline PNGs (`render/atlas/`) decode asynchronously. Hold the first frame until
// they're in so a boss never flashes its procedural stand-in; anything that fails to load
// just stays procedural rather than blocking the game. (No top-level await — Vite's build
// target doesn't allow it.)
preloadArt()
  .catch((err) => console.error(err))
  .finally(() => {
    // Dev-only shortcut for art review: `?dive=8` drops straight onto a Delve floor
    // at that depth, `?planet=<id>&tier=2` onto a Reliquary sector floor, and
    // `?rift=abyss&tier=2` (or `hoard`) onto a rift's first floor, instead of
    // walking the hub.
    const params = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams();
    const devDive = params.get("dive");
    const devPlanet = params.get("planet");
    const devRift = params.get("rift");
    if (devPlanet && PLANETS_BY_ID[devPlanet]) {
      const tier = Math.max(1, Number(params.get("tier")) || 1);
      enterDungeon(planetConfig(PLANETS_BY_ID[devPlanet]!, tier, 1, state.challengerTier));
    } else if (devRift && devRift in MODES && MODES[devRift as RunModeId].isRift) {
      const tier = Math.max(1, Number(params.get("tier")) || 1);
      enterDungeon(riftConfig(devRift as RunModeId, tier, 1, state.challengerTier));
    } else if (devDive) {
      enterDungeon(delveConfig(Math.max(1, Number(devDive) || 1), state.challengerTier));
    } else {
      enterHub();
    }
    new GameLoop(update, render).start();
  });

window.addEventListener("beforeunload", () => state.save());
