import { AccountError } from "../net/account";
import type { AccountClient, AccountInfo } from "../net/account";

type Mode = "login" | "register";

/**
 * The gate before the game. There is no guest mode (`docs/accounts.md` — server-side
 * accounts, no local save fallback), so this is the only thing on screen whenever
 * `AccountClient.me()` comes back null: `main.ts` awaits this before it fetches a save
 * or starts the loop. Renders into `root` (`#login`) and resolves once a session
 * actually exists — it never touches the session itself, only `account.login` /
 * `account.register` and reports back whatever those said.
 *
 * Modeled loosely on the party-join field in `town.ts`'s `bindPartyFields`, but it's a
 * full scene rather than an aside: a real `<form>` so Enter submits for free, and no
 * custom keydown handling beyond blurring a field on Escape.
 */
export function showLogin(root: HTMLElement, account: AccountClient): Promise<AccountInfo> {
  return new Promise((resolve) => {
    let mode: Mode = "login";
    let username = "";
    let error: string | null = null;
    let busy = false;

    root.hidden = false;

    function render(): void {
      root.innerHTML = `
        <div class="login-card">
          <div class="login-brand">ASHES OF <span>PURGATORY</span></div>
          <p class="login-blurb">No guests below. Username and password only — no email,
          no recovery. Lose it and it's gone.</p>
          <div class="login-tabs">
            <span class="tab ${mode === "login" ? "on" : ""}" data-mode="login">Log in</span>
            <span class="tab ${mode === "register" ? "on" : ""}" data-mode="register">Register</span>
          </div>
          <form class="login-form" novalidate>
            <input class="login-field" data-field="username" type="text" autocomplete="username"
              placeholder="username" maxlength="16" value="${escapeHtml(username)}" ${busy ? "disabled" : ""}>
            <input class="login-field" data-field="password" type="password"
              autocomplete="${mode === "login" ? "current-password" : "new-password"}"
              placeholder="password" maxlength="72" ${busy ? "disabled" : ""}>
            ${error ? `<p class="login-error">${escapeHtml(error)}</p>` : ""}
            <button class="login-submit" type="submit" ${busy ? "disabled" : ""}>
              ${busy ? "…" : mode === "login" ? "Log in" : "Register"}
            </button>
          </form>
        </div>`;
      if (username) {
        // Land the cursor where you'd expect after a failed attempt or a mode switch —
        // on the field you still need to fill in, not back at the top.
        root.querySelector<HTMLInputElement>('[data-field="password"]')?.focus();
      } else {
        root.querySelector<HTMLInputElement>('[data-field="username"]')?.focus();
      }
    }

    /** Reads the live field values back into state before a re-render replaces them. */
    function syncUsername(): void {
      username = root.querySelector<HTMLInputElement>('[data-field="username"]')?.value ?? username;
    }

    root.addEventListener("click", (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>("[data-mode]");
      if (!tab || busy) return;
      const next = tab.dataset.mode as Mode;
      if (next === mode) return;
      syncUsername();
      mode = next;
      error = null;
      render();
    });

    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") (e.target as HTMLElement).blur?.();
    });

    root.addEventListener("submit", (e) => {
      e.preventDefault();
      if (busy) return;
      const userField = root.querySelector<HTMLInputElement>('[data-field="username"]')!;
      const passField = root.querySelector<HTMLInputElement>('[data-field="password"]')!;
      const u = userField.value.trim();
      const p = passField.value;
      username = u;
      if (!u || !p) {
        error = "Fill in both fields.";
        render();
        return;
      }

      busy = true;
      error = null;
      render();

      const call = mode === "login" ? account.login(u, p) : account.register(u, p);
      call.then(
        (info) => resolve(info),
        (err: unknown) => {
          busy = false;
          error = err instanceof AccountError
            ? err.message
            : "Can't reach the server right now. Try again in a moment.";
          render();
        },
      );
    });

    render();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
