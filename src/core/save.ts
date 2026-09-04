const KEY = "lootsim.save.v2";

/** Bump when the persisted shape changes, and migrate rather than wiping progress. */
export const SAVE_VERSION = 2;

export function loadRaw(): unknown | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as { version?: number };
    if (parsed?.version !== SAVE_VERSION) return null;
    return parsed;
  } catch {
    // Corrupt or unavailable storage (private mode, quota) — start fresh rather than crash.
    return null;
  }
}

export function saveRaw(data: object): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    // Saving is best-effort; a full quota should never interrupt play.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
