/**
 * Small wrapper around localStorage so work survives moving between tabs.
 *
 * Each tab is its own page, so React state is thrown away on navigation.
 * Anything a person has typed or asked gets written here and read back when
 * the page mounts again. Every call is guarded: private browsing, a full
 * quota, or a disabled store must never break the app.
 */
const PREFIX = "mpp:";

export function load(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or disabled storage: losing the draft is better than crashing */
  }
}

export function clear(key) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(PREFIX + key); } catch {}
}
