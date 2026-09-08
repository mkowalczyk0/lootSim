/**
 * The save's new home: the server, through `AccountClient`, instead of `localStorage`.
 *
 * `GameState.save()` is called on every meaningful action — a bank, a purchase, an
 * equip — often several times a second in town. Writes are coalesced: the latest blob
 * wins, one request is in flight at a time, and a write within `delayMs` of the last
 * folds into it. A failed write is retried with backoff and reported through `onStatus`
 * so the game can tell the player their progress isn't landing, once, and that it is
 * again when it recovers.
 *
 * `flush(true)` is for `pagehide`: a `keepalive` request that outlives the tab. Browsers
 * cap those at 64 kB, so a large save may not make that particular trip — acceptable,
 * because the action before it already saved within the second.
 */

import type { SaveStore } from "../core/save";
import type { AccountClient } from "./account";

export type SaveStatus = "saved" | "saving" | "unsaved";

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;

export class RemoteSaveStore implements SaveStore {
  /** Fires on every transition; `detail` is the error's message when `unsaved`. */
  onStatus: (status: SaveStatus, detail?: string) => void = () => {};
  status: SaveStatus = "saved";

  private pending: string | null = null;
  private acked: string | null = null;
  private inflight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryMs = RETRY_MIN_MS;

  constructor(private readonly account: AccountClient, private readonly delayMs = 1000) {}

  write(json: string): void {
    if (json === this.acked && this.pending === null) return;
    this.pending = json;
    this.schedule(this.delayMs);
  }

  async flush(final = false): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inflight) await this.inflight;
    await this.send(final);
  }

  async clear(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
    if (this.inflight) await this.inflight;
    await this.account.deleteSave();
    this.acked = null;
  }

  private schedule(ms: number): void {
    if (this.timer !== null || this.inflight) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.send(false);
    }, ms);
  }

  private send(keepalive: boolean): Promise<void> {
    if (this.inflight) return this.inflight;
    if (this.pending === null) return Promise.resolve();
    const json = this.pending;
    this.pending = null;
    this.setStatus("saving");
    this.inflight = this.account.pushSave(json, { keepalive })
      .then(() => {
        this.acked = json;
        this.retryMs = RETRY_MIN_MS;
        this.setStatus("saved");
      })
      .catch((err: unknown) => {
        // Nothing newer arrived while we were out: this blob is still the one to land.
        if (this.pending === null) this.pending = json;
        this.setStatus("unsaved", err instanceof Error ? err.message : String(err));
        this.retryMs = Math.min(RETRY_MAX_MS, this.retryMs * 2);
      })
      .finally(() => {
        this.inflight = null;
        if (this.pending !== null) this.schedule(this.status === "unsaved" ? this.retryMs : this.delayMs);
      });
    return this.inflight;
  }

  private setStatus(status: SaveStatus, detail?: string): void {
    const changed = status !== this.status;
    this.status = status;
    if (changed) this.onStatus(status, detail);
  }
}
