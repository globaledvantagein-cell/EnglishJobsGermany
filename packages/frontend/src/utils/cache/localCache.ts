// Persistent cache backed by localStorage. Survives tab close, browser
// restart, even days later (until TTL or user clears storage).
//
// Use for: light list data (jobs list, company names, category counts) —
// stuff that's expensive to fetch but cheap to be slightly stale.
// AVOID for: user-specific data, sensitive content, anything > 1MB.
//
// Storage:  window.localStorage (string-only, ~5–10MB total budget per origin)
// Wipes:    TTL expiry, manual clear, user clears browser data

const PREFIX = 'ejg_cache_'; // namespace so we don't collide with other apps

interface Entry<T> {
    value: T;
    expiresAt: number;
}

/**
 * Get a value from localStorage cache.
 * Returns undefined if missing, expired, or corrupted.
 */
export function localGet<T = unknown>(key: string): T | undefined {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        if (!raw) return undefined;

        const entry: Entry<T> = JSON.parse(raw);
        if (Date.now() > entry.expiresAt) {
            localStorage.removeItem(PREFIX + key);
            return undefined;
        }
        return entry.value;
    } catch {
        // Corrupted JSON or no localStorage (Safari private mode) — fail silent
        return undefined;
    }
}

/**
 * Store a value in localStorage cache.
 * Default TTL = 10 minutes. Silent failure if storage is full or unavailable.
 */
export function localSet<T = unknown>(key: string, value: T, ttlMs = 10 * 60 * 1000): void {
    try {
        const entry: Entry<T> = {
            value,
            expiresAt: Date.now() + ttlMs,
        };
        localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch {
        // Quota exceeded or unavailable — skip. Cache miss is non-fatal.
    }
}

/**
 * Drop a specific cached entry.
 */
export function localDelete(key: string): void {
    try {
        localStorage.removeItem(PREFIX + key);
    } catch { /* ignore */ }
}

/**
 * Wipe ALL ejg_cache_ entries from localStorage.
 * Use after sign-in/sign-out to avoid stale personal data.
 */
export function localClearAll(): void {
    try {
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(PREFIX)) toRemove.push(k);
        }
        for (const k of toRemove) localStorage.removeItem(k);
    } catch { /* ignore */ }
}
