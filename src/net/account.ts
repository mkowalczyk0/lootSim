/**
 * The browser half of accounts: one same-origin JSON client for the routes in
 * `tools/accounts.ts`. It knows nothing about the game — the save it moves is an opaque
 * string — and it holds no token: the session is an HttpOnly cookie the server sets, so
 * every call here just rides `credentials: "same-origin"`.
 *
 * Two kinds of failure, deliberately distinct: the server *answering* with an error is an
 * `AccountError` carrying the server's own player-facing `message`; the server not being
 * reachable at all is a plain `Error`, so a screen can say "is it still running?" instead
 * of "wrong password".
 */

export interface AccountInfo {
  readonly id: number;
  readonly username: string;
}

export class AccountError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "AccountError";
  }
}

const UNREACHABLE = "Couldn't reach the server. Is it still running?";

export class AccountClient {
  constructor(private readonly base = "/api") {}

  /** Who the cookie says we are, or null when nobody. Throws only if the server is unreachable. */
  async me(): Promise<AccountInfo | null> {
    const res = await this.call("GET", "/me");
    if (res.status === 401) return null;
    return (await this.okJson(res)) as AccountInfo;
  }

  async register(username: string, password: string): Promise<AccountInfo> {
    const res = await this.call("POST", "/register", JSON.stringify({ username, password }), "application/json");
    return (await this.okJson(res)) as AccountInfo;
  }

  async login(username: string, password: string): Promise<AccountInfo> {
    const res = await this.call("POST", "/login", JSON.stringify({ username, password }), "application/json");
    return (await this.okJson(res)) as AccountInfo;
  }

  async logout(): Promise<void> {
    await this.call("POST", "/logout");
  }

  /** The stored save as text, or null when this account has never saved. */
  async fetchSave(): Promise<string | null> {
    const res = await this.call("GET", "/save");
    if (res.status === 204) return null;
    if (!res.ok) throw await this.errorOf(res);
    return res.text();
  }

  async pushSave(json: string, opts: { keepalive?: boolean } = {}): Promise<void> {
    const res = await this.call("PUT", "/save", json, "application/json", opts.keepalive);
    if (!res.ok) throw await this.errorOf(res);
  }

  async deleteSave(): Promise<void> {
    const res = await this.call("DELETE", "/save");
    if (!res.ok) throw await this.errorOf(res);
  }

  private async call(
    method: string, path: string, body?: string, contentType?: string, keepalive = false,
  ): Promise<Response> {
    try {
      return await fetch(`${this.base}${path}`, {
        method,
        body,
        headers: contentType ? { "Content-Type": contentType } : undefined,
        credentials: "same-origin",
        cache: "no-store",
        keepalive,
      });
    } catch {
      throw new Error(UNREACHABLE);
    }
  }

  private async okJson(res: Response): Promise<unknown> {
    if (!res.ok) throw await this.errorOf(res);
    return res.json();
  }

  private async errorOf(res: Response): Promise<AccountError> {
    let code = "server_error";
    let message = "The server tripped over something. Try again.";
    try {
      const body = (await res.json()) as { error?: unknown; message?: unknown };
      if (typeof body.error === "string") code = body.error;
      if (typeof body.message === "string") message = body.message;
    } catch {
      /* not JSON — keep the generic wording */
    }
    return new AccountError(code, res.status, message);
  }
}
