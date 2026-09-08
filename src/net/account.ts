/**
 * Placeholder mirroring the fixed contract from `lootsim-bc` (`../lootSim-accounts`,
 * `docs/accounts.md`) so `ui/login.ts` has real types to build against before the actual
 * server-backed implementation lands. Every export here — names, shapes, error codes —
 * is exactly what that branch commits; this file gets replaced wholesale at integration,
 * not merged line by line.
 */

export interface AccountInfo {
  readonly id: number;
  readonly username: string;
}

export class AccountError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

export class AccountClient {
  async me(): Promise<AccountInfo | null> {
    throw new Error("AccountClient is a placeholder — pull in feature/accounts' real src/net/account.ts");
  }

  async register(_username: string, _password: string): Promise<AccountInfo> {
    throw new Error("AccountClient is a placeholder — pull in feature/accounts' real src/net/account.ts");
  }

  async login(_username: string, _password: string): Promise<AccountInfo> {
    throw new Error("AccountClient is a placeholder — pull in feature/accounts' real src/net/account.ts");
  }

  async logout(): Promise<void> {
    throw new Error("AccountClient is a placeholder — pull in feature/accounts' real src/net/account.ts");
  }

  async fetchSave(): Promise<string | null> {
    throw new Error("AccountClient is a placeholder — pull in feature/accounts' real src/net/account.ts");
  }

  async pushSave(_json: string, _opts?: { keepalive?: boolean }): Promise<void> {
    throw new Error("AccountClient is a placeholder — pull in feature/accounts' real src/net/account.ts");
  }

  async deleteSave(): Promise<void> {
    throw new Error("AccountClient is a placeholder — pull in feature/accounts' real src/net/account.ts");
  }
}
