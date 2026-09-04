import type { Input } from "../core/input";
import { clamp, formatNumber } from "../core/math";
import { CHESTS, CHEST_TIERS } from "../data/chests";
import { profileFor } from "../data/depth";
import { EQUIP_SLOTS, STAT_KEYS, STAT_LABELS } from "../data/items";
import { RARITIES, RARITY_COLORS, rarityIndex, rarityLabel, type Rarity } from "../data/rarity";
import { itemScore, statLine, type Item } from "../game/item";
import type { GameState } from "../game/state";

const TABS = ["Dive", "Chests", "Stash", "Hero", "Records"] as const;
type Tab = (typeof TABS)[number];

/** Per-tab footer legend. E is always the primary action, Q the secondary. */
const TAB_HELP: Record<Tab, string> = {
  Dive: "W/S choose depth · E dive",
  Chests: "W/S choose chest · E open · Q buy key · A/D bulk 1↔10",
  Stash: "W/S select · A/D filter rarity · E equip · Q sell · ; sell all junk",
  Hero: "W/S select slot · E unequip",
  Records: "Nothing to do here — just numbers.",
};

/**
 * The town hub: dive selection, chest gambling, stash, equipment and lifetime stats.
 * Rendered as DOM because it's menu-shaped, but driven entirely from the keyboard —
 * mouse clicks are a convenience mirror of the key actions, never the only route.
 */
export class TownUI {
  private tab: Tab = "Dive";
  private cursor = 0;
  private bulk = false;
  private rarityFilter: Rarity | "all" = "all";
  private toast: { text: string; color: string; until: number } | null = null;
  private lastPulls: Item[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly state: GameState,
    private readonly onDive: (depth: number) => void,
  ) {
    // Clicking a row selects it and fires its primary action, for anyone who wants it.
    this.root.addEventListener("click", (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
      if (!row) return;
      this.cursor = Number(row.dataset.index);
      this.primary();
      this.render();
    });
  }

  show(): void {
    this.root.hidden = false;
    this.cursor = 0;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private notify(text: string, color = "#e8eef7"): void {
    this.toast = { text, color, until: performance.now() + 3200 };
  }

  // --- input --------------------------------------------------------------

  update(input: Input): void {
    let dirty = false;

    if (input.wasPressed("tabNext")) {
      this.tab = TABS[(TABS.indexOf(this.tab) + 1) % TABS.length]!;
      this.cursor = 0;
      dirty = true;
    }
    if (input.wasPressed("tabPrev")) {
      this.tab = TABS[(TABS.indexOf(this.tab) - 1 + TABS.length) % TABS.length]!;
      this.cursor = 0;
      dirty = true;
    }

    const count = this.rowCount();
    if (input.wasPressedOrRepeated("down") && count > 0) {
      this.cursor = (this.cursor + 1) % count;
      dirty = true;
    }
    if (input.wasPressedOrRepeated("up") && count > 0) {
      this.cursor = (this.cursor - 1 + count) % count;
      dirty = true;
    }
    if (input.wasPressed("left")) dirty = this.adjust(-1) || dirty;
    if (input.wasPressed("right")) dirty = this.adjust(1) || dirty;
    if (input.wasPressed("confirm")) { this.primary(); dirty = true; }
    if (input.wasPressed("cancel")) { this.secondary(); dirty = true; }
    if (input.wasPressed("special")) { this.tertiary(); dirty = true; }

    if (this.toast && performance.now() > this.toast.until) {
      this.toast = null;
      dirty = true;
    }
    if (dirty) this.render();
  }

  private rowCount(): number {
    switch (this.tab) {
      case "Dive": return this.state.maxUnlockedDepth;
      case "Chests": return CHEST_TIERS.length;
      case "Stash": return this.filteredStash().length;
      case "Hero": return EQUIP_SLOTS.length;
      case "Records": return 0;
    }
  }

  private adjust(dir: number): boolean {
    if (this.tab === "Chests") {
      this.bulk = dir > 0;
      return true;
    }
    if (this.tab === "Stash") {
      const options: (Rarity | "all")[] = ["all", ...RARITIES];
      const i = options.indexOf(this.rarityFilter);
      this.rarityFilter = options[clamp(i + dir, 0, options.length - 1)]!;
      this.cursor = 0;
      return true;
    }
    return false;
  }

  private primary(): void {
    switch (this.tab) {
      case "Dive": {
        const depth = this.cursor + 1;
        this.state.player.fullHeal();
        this.onDive(depth);
        break;
      }
      case "Chests": {
        const tier = CHEST_TIERS[this.cursor]!;
        const want = this.bulk ? 10 : 1;
        if (this.state.keys[tier] < want) {
          this.notify(`Not enough ${tier} keys — press Q to buy one.`, "#ef4444");
          break;
        }
        const found = this.state.openChests(tier, want);
        this.lastPulls = found;
        const best = found.reduce<Item | null>(
          (b, it) => (!b || rarityIndex(it.rarity) > rarityIndex(b.rarity) ? it : b), null);
        if (best) this.notify(`${rarityLabel(best.rarity)}: ${best.name}`, RARITY_COLORS[best.rarity]);
        break;
      }
      case "Stash": {
        const item = this.filteredStash()[this.cursor];
        if (!item) break;
        this.state.equipFromInventory(item.id);
        this.notify(`Equipped ${item.name}`, RARITY_COLORS[item.rarity]);
        this.cursor = clamp(this.cursor, 0, Math.max(0, this.filteredStash().length - 1));
        break;
      }
      case "Hero": {
        const slot = EQUIP_SLOTS[this.cursor]!;
        if (this.state.unequipToInventory(slot)) this.notify(`Unequipped ${slot}`);
        break;
      }
      case "Records":
        break;
    }
    this.state.save();
  }

  private secondary(): void {
    switch (this.tab) {
      case "Chests": {
        const tier = CHEST_TIERS[this.cursor]!;
        const count = this.bulk ? 10 : 1;
        const cost = CHESTS[tier].price * count;
        if (this.state.buyKey(tier, count)) {
          this.notify(`Bought ${count} ${tier} key${count > 1 ? "s" : ""}`, CHESTS[tier].color);
        } else {
          this.notify(`Need ${formatNumber(cost)} coins`, "#ef4444");
        }
        break;
      }
      case "Stash": {
        const item = this.filteredStash()[this.cursor];
        if (!item) break;
        const gained = this.state.sell([item.id]);
        this.notify(`Sold ${item.name} for ${formatNumber(gained)}`, "#fbbf24");
        this.cursor = clamp(this.cursor, 0, Math.max(0, this.filteredStash().length - 1));
        break;
      }
      default:
        break;
    }
    this.state.save();
  }

  /** Bulk "sell everything strictly worse than what I'm wearing" — the QoL that makes
   *  a 200-slot stash bearable without a mouse. */
  private tertiary(): void {
    if (this.tab !== "Stash") return;
    const equipped = this.state.player.equipment;
    const junk = this.state.inventory.filter((it) => {
      const worn = equipped[it.slot];
      return worn ? itemScore(it) < itemScore(worn) : false;
    });
    if (junk.length === 0) {
      this.notify("No junk to sell — nothing is worse than what you're wearing.", "#9aa4b2");
      return;
    }
    const gained = this.state.sell(junk.map((i) => i.id));
    this.notify(`Sold ${junk.length} junk items for ${formatNumber(gained)}`, "#fbbf24");
    this.cursor = 0;
    this.state.save();
  }

  private filteredStash(): Item[] {
    const list = this.rarityFilter === "all"
      ? [...this.state.inventory]
      : this.state.inventory.filter((it) => it.rarity === this.rarityFilter);
    return list.sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity) || itemScore(b) - itemScore(a));
  }

  // --- rendering ----------------------------------------------------------

  private render(): void {
    const s = this.state;
    this.root.innerHTML = `
      <div class="town">
        <header class="town-top">
          <div class="brand">DEPTHS OF THE <span>UNSPOKEN</span></div>
          <div class="purse">
            <span class="coin">${formatNumber(s.coins)}</span> coins
            <span class="sep">·</span> LV ${s.player.level}
            <span class="sep">·</span> deepest ${s.stats.deepestDepth}
          </div>
        </header>
        <nav class="tabs">
          ${TABS.map((t) => `<span class="tab ${t === this.tab ? "on" : ""}">${t}</span>`).join("")}
          <span class="tabhint">[I] / [O] switch</span>
        </nav>
        <section class="body">${this.renderTab()}</section>
        <footer class="town-foot">
          <span class="help">${TAB_HELP[this.tab]}</span>
          ${this.toast ? `<span class="toast" style="color:${this.toast.color}">${escapeHtml(this.toast.text)}</span>` : ""}
        </footer>
      </div>`;

    // Keep the highlighted row on screen when the list is longer than the panel.
    this.root.querySelector<HTMLElement>(".row.on")?.scrollIntoView({ block: "nearest" });
  }

  private renderTab(): string {
    switch (this.tab) {
      case "Dive": return this.renderDive();
      case "Chests": return this.renderChests();
      case "Stash": return this.renderStash();
      case "Hero": return this.renderHero();
      case "Records": return this.renderRecords();
    }
  }

  private renderDive(): string {
    const rows: string[] = [];
    for (let depth = 1; depth <= this.state.maxUnlockedDepth; depth++) {
      const p = profileFor(depth);
      const under = this.state.player.level < p.recommendedLevel;
      rows.push(`
        <div class="row ${depth - 1 === this.cursor ? "on" : ""}" data-index="${depth - 1}">
          <div class="row-main">
            <span class="depth">${String(depth).padStart(2, "0")}</span>
            <span class="name">${p.name}</span>
            ${p.isBoss ? '<span class="badge boss">BOSS</span>' : ""}
          </div>
          <div class="row-side ${under ? "warn" : ""}">
            req. lv ${p.recommendedLevel} · ${p.waves} waves · ×${p.coinMultiplier.toFixed(1)} loot
          </div>
        </div>`);
    }
    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <h3>The dive</h3>
        <p>Clear every wave, then step into the portal. <b>Descend</b> to push deeper for
        richer loot, or <b>extract</b> to bank what you're carrying.</p>
        <p class="danger">Die and you lose every coin, key and item you picked up on the
        way down. XP is always kept.</p>
        <p>Clearing a floor unlocks the next one for a direct dive.</p>
      </aside>`;
  }

  private renderChests(): string {
    const rows = CHEST_TIERS.map((tier, i) => {
      const info = CHESTS[tier];
      const n = this.bulk ? 10 : 1;
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="dot" style="background:${info.color}"></span>
            <span class="name">${tier}</span>
            <span class="badge">${this.state.keys[tier]} keys</span>
          </div>
          <div class="row-side">${info.blurb} · ${formatNumber(info.price * n)} for ${n}</div>
        </div>`;
    }).join("");

    const pulls = this.lastPulls.length
      ? this.lastPulls
          .map((it) => `<li style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}
             <em>${statLine(it)}</em></li>`)
          .join("")
      : '<li class="muted">Nothing opened yet.</li>';

    return `<div class="list">${rows}</div>
      <aside class="side">
        <h3>Bulk: <b>${this.bulk ? "10×" : "1×"}</b> <span class="muted">(A / D)</span></h3>
        <h3>Last pull</h3>
        <ul class="pulls">${pulls}</ul>
        <p class="muted">Unspoken is roughly 1 in 20,000 from a Basic chest. Good luck.</p>
      </aside>`;
  }

  private renderStash(): string {
    const items = this.filteredStash();
    if (items.length === 0) {
      return `<div class="list empty">Nothing here. Filter: <b>${this.rarityFilter}</b> (A / D)</div>
        <aside class="side"><h3>Stash</h3><p class="muted">Kill things. Open chests.</p></aside>`;
    }

    const rows = items.slice(0, 300).map((it, i) => {
      const worn = this.state.player.equipment[it.slot];
      const delta = worn ? itemScore(it) - itemScore(worn) : itemScore(it);
      const mark = delta > 0 ? '<span class="up">▲</span>' : delta < 0 ? '<span class="down">▼</span>' : "";
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            ${mark}
            <span class="name" style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}</span>
            <span class="badge">${it.slot}</span>
          </div>
          <div class="row-side">${statLine(it)} · ilvl ${it.ilvl} · ${formatNumber(it.value)}c</div>
        </div>`;
    }).join("");

    const sel = items[this.cursor];
    return `<div class="list">${rows}</div>
      <aside class="side">
        <h3>Filter: <b>${this.rarityFilter}</b> <span class="muted">(A / D)</span></h3>
        ${sel ? this.renderCompare(sel) : ""}
        <p class="muted">${this.state.inventory.length} / 200 slots used.</p>
      </aside>`;
  }

  /** Side-by-side against the equipped piece — the core "is this an upgrade" question. */
  private renderCompare(item: Item): string {
    const worn = this.state.player.equipment[item.slot];
    const lines = STAT_KEYS.filter((k) => item.stats[k] > 0 || (worn?.stats[k] ?? 0) > 0)
      .map((k) => {
        const mine = item.stats[k];
        const theirs = worn?.stats[k] ?? 0;
        const d = mine - theirs;
        const cls = d > 0 ? "up" : d < 0 ? "down" : "muted";
        return `<tr><td>${STAT_LABELS[k]}</td><td>${mine}</td>
          <td class="${cls}">${d > 0 ? "+" : ""}${d}</td></tr>`;
      }).join("");

    return `
      <h3 style="color:${RARITY_COLORS[item.rarity]}">${escapeHtml(item.name)}</h3>
      <p class="muted">${rarityLabel(item.rarity)} ${item.type} · vs ${worn ? escapeHtml(worn.name) : "nothing equipped"}</p>
      <table class="cmp">${lines}</table>`;
  }

  private renderHero(): string {
    const p = this.state.player;
    const rows = EQUIP_SLOTS.map((slot, i) => {
      const it = p.equipment[slot];
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="slot">${slot}</span>
            <span class="name" style="color:${it ? RARITY_COLORS[it.rarity] : "#5a6270"}">
              ${it ? escapeHtml(it.name) : "— empty —"}</span>
          </div>
          <div class="row-side">${it ? statLine(it) : ""}</div>
        </div>`;
    }).join("");

    const s = p.stats;
    const statRows = STAT_KEYS.map((k) => `<tr><td>${STAT_LABELS[k]}</td><td>${s[k]}</td></tr>`).join("");

    return `<div class="list">${rows}</div>
      <aside class="side">
        <h3>Level ${p.level}</h3>
        <p class="muted">${p.xp} / ${p.xpNeeded} XP</p>
        <table class="cmp">${statRows}</table>
        <p class="muted">Damage reduction ${(p.damageReduction * 100).toFixed(0)}% ·
        ${p.attackCooldown.toFixed(2)}s per swing</p>
        <p>${p.usesStaff
          ? "A staff is equipped — your attack fires a bolt instead of swinging."
          : "Melee weapon equipped — attacks sweep an arc in front of you."}</p>
      </aside>`;
  }

  private renderRecords(): string {
    const st = this.state.stats;
    const rarities = RARITIES.map(
      (r) => `<tr><td style="color:${RARITY_COLORS[r]}">${rarityLabel(r)}</td>
        <td>${formatNumber(st.raritiesFound[r])}</td></tr>`).join("");
    const chests = CHEST_TIERS.map(
      (t) => `<tr><td>${t}</td><td>${formatNumber(st.chestsOpened[t])}</td></tr>`).join("");

    return `
      <div class="list records">
        <table class="cmp wide">
          <tr><td>Coins earned</td><td>${formatNumber(st.coinsEarned)}</td></tr>
          <tr><td>Coins spent</td><td>${formatNumber(st.coinsSpent)}</td></tr>
          <tr><td>Items sold</td><td>${formatNumber(st.itemsSold)}</td></tr>
          <tr><td>Enemies killed</td><td>${formatNumber(st.enemiesKilled)}</td></tr>
          <tr><td>Runs extracted</td><td>${formatNumber(st.runsCompleted)}</td></tr>
          <tr><td>Deaths</td><td>${formatNumber(st.deaths)}</td></tr>
          <tr><td>Deepest depth</td><td>${st.deepestDepth}</td></tr>
        </table>
      </div>
      <aside class="side">
        <h3>Rarities found</h3>
        <table class="cmp">${rarities}</table>
        <h3>Chests opened</h3>
        <table class="cmp">${chests}</table>
      </aside>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
