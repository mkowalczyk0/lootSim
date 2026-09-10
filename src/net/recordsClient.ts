/**
 * The browser half of the leaderboards' network calls — deliberately its own small file,
 * separate from `AccountClient`/`RemoteSaveStore`, because the whole point of this feature
 * (`docs/leaderboards.md`) is that it never rides the save's endpoint or its version. Same
 * same-origin-cookie session model as `account.ts`; same coalesced-write shape as
 * `savestore.ts`, because "recompute and send the latest, at most every so often" is the
 * right idiom for both, even though what's being sent is nothing alike.
 */

import type { RecordSubmission } from "./records";

export interface LeaderboardRow {
  readonly username: string;
  readonly classId: string;
  readonly tier: number;
  readonly value: number;
  readonly meta: Readonly<Record<string, string | number>>;
  readonly updatedAt: number;
}

export interface RecentRow extends LeaderboardRow {
  readonly board: string;
}

const UNREACHABLE = "Couldn't reach the server. Is it still running?";

export class RecordsClient {
  constructor(private readonly base = "/api") {}

  async submit(payload: RecordSubmission): Promise<void> {
    const res = await this.call("POST", "/records", JSON.stringify(payload));
    if (!res.ok) throw await this.errorOf(res);
  }

  /** Top rows for one board, best first. `classId` narrows to one class; omitted (or
   *  `"all"`) ranks every class on the same board together. */
  async fetchBoard(board: string, classId?: string, limit = 25): Promise<LeaderboardRow[]> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (classId && classId !== "all") q.set("class", classId);
    const res = await this.call("GET", `/leaderboard/${encodeURIComponent(board)}?${q}`);
    if (!res.ok) throw await this.errorOf(res);
    return (await res.json()) as LeaderboardRow[];
  }

  /** The most recently *improved* records across every board and account — the "somebody
   *  just did something" ticker (`docs/leaderboards.md`'s multiplayer-flavour call). */
  async fetchRecent(limit = 20): Promise<RecentRow[]> {
    const res = await this.call("GET", `/leaderboard-recent?limit=${limit}`);
    if (!res.ok) throw await this.errorOf(res);
    return (await res.json()) as RecentRow[];
  }

  private async call(method: string, path: string, body?: string): Promise<Response> {
    try {
      return await fetch(`${this.base}${path}`, {
        method,
        body,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      throw new Error(UNREACHABLE);
    }
  }

  private async errorOf(res: Response): Promise<Error> {
    let message = "The server tripped over something. Try again.";
    try {
      const body = (await res.json()) as { message?: unknown };
      if (typeof body.message === "string") message = body.message;
    } catch {
      /* not JSON — keep the generic wording */
    }
    return new Error(message);
  }
}

/**
 * Coalesces record submissions the same way `RemoteSaveStore` coalesces save writes: the
 * latest computed snapshot wins, one request in flight at a time, a write within `delayMs`
 * of the last one folds into it. Unlike the save, a failed submission is not retried with
 * growing urgency — missing one record push is nothing that "clean up the in-run UI" is
 * going to notice, and the next meaningful action tries again anyway.
 */
export class RecordsSubmitter {
  private pending: RecordSubmission | null = null;
  private lastSent = "";
  private inflight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly client: RecordsClient, private readonly delayMs = 4000) {}

  /** Called from `GameState.recordsHook` with the latest `computeRecords(state)`. */
  write(payload: RecordSubmission): void {
    const json = JSON.stringify(payload.entries);
    if (json === this.lastSent) return;
    this.pending = payload;
    if (this.timer === null && !this.inflight) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.send();
      }, this.delayMs);
    }
  }

  private send(): Promise<void> {
    if (this.inflight) return this.inflight;
    if (this.pending === null) return Promise.resolve();
    const payload = this.pending;
    this.pending = null;
    this.inflight = this.client.submit(payload)
      .then(() => { this.lastSent = JSON.stringify(payload.entries); })
      .catch(() => { /* best-effort; the next meaningful action retries */ })
      .finally(() => {
        this.inflight = null;
        if (this.pending !== null) {
          this.timer = setTimeout(() => { this.timer = null; void this.send(); }, this.delayMs);
        }
      });
    return this.inflight;
  }
}
