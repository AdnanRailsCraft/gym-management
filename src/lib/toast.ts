const KEY = "gms:toast";

/**
 * Queue a one-shot success message that is shown after the next full page load.
 * Used because several flows reload the page to pick up fresh server data.
 */
export function queueToast(message: string): void {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    // Session storage can be unavailable; the action itself still succeeded.
  }
}

/** Read and clear the queued message, if any. */
export function takeToast(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}
