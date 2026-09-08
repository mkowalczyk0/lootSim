/**
 * PLACEHOLDER — lootsim-9f owns this file and replaces it wholesale.
 *
 * The contract (`docs/accounts.md`): render a register / login screen into `root`, resolve
 * once a session exists. This stub exists only so `main.ts` compiles and the boot sequence
 * can be exercised before the real screen lands; it offers one prompt-driven path.
 */

import type { AccountClient, AccountInfo } from "../net/account";

export async function showLogin(root: HTMLElement, account: AccountClient): Promise<AccountInfo> {
  root.hidden = false;
  root.textContent = "";
  for (;;) {
    const username = window.prompt("Name (3–16 letters, numbers or _) — placeholder login screen") ?? "";
    const password = window.prompt("Password (6+ characters)") ?? "";
    try {
      return await account.login(username, password);
    } catch {
      try {
        return await account.register(username, password);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err));
      }
    }
  }
}
