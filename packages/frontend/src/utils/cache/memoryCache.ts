// In-memory cache. Lives for the current tab session only — wipes when
// user closes the tab or refreshes. Perfect for "I just looked at this
// 30 seconds ago, instantly show it again on back button".
//
// Storage:  JS Map (kept in module scope, shared by all callers)
// Survives: navigation between pages (React Router)
// Wipes:    tab close, hard refresh, manual clear

interface Entry {
    value: unknown;
    expiresAt: number; // ms epoch
}

const memoryStore = new Map<string, Entry>();

/**
 * Get a value from memory cache.
 * @param key   any string identifier (usually the request URL)
 * @returns     the cached value, or undefined if missing/expired
 */
export function memoryGet<T = unknown>(key: string): T | undefined {
    const entry = memoryStore.get(key);
    if (!entry) return undefined;

    // Expired? drop it and return as if missing.
    if (Date.now() > entry.expiresAt) {
        memoryStore.delete(key);
        return undefined;
    }

    return entry.value as T;
}

/**
 * Store a value in memory cache.
 * @param key       any string identifier
 * @param value     anything JSON-able (or not — we don't serialize here)
 * @param ttlMs     how long until it expires (default 10 min)
 */
export function memorySet(key: string, value: unknown, ttlMs = 10 * 60 * 1000): void {
    memoryStore.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

/**
 * Drop a specific entry from memory cache.
 */
export function memoryDelete(key: string): void {
    memoryStore.delete(key);
}

/**
 * Wipe the entire memory cache.
 * Use sparingly — only after a known cache-invalidating event.
 */
export function memoryClear(): void {
    memoryStore.clear();
}
