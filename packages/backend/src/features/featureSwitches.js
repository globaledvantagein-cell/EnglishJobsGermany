/**
 * Kill-switch state: Mongo `featureSwitches` collection mirrored in RAM.
 *
 * - Reads are synchronous (`isFeatureEnabled`) — no DB hit per request.
 * - FAIL-OPEN: a feature with no document, or a DB that's unreachable, counts
 *   as enabled. A broken switch store must never take the site down.
 * - The cache re-reads every REFRESH_MS so a flip reaches every process
 *   (pm2 cluster / second box) within seconds; the process that handled the
 *   flip updates instantly.
 *
 * Document: { _id: key, enabled, reason, updatedBy, updatedAt, history[] }
 */
import { connectToDb } from '../db/connection.js';
import { FEATURE_REGISTRY, FEATURE_KEYS } from './featureRegistry.js';

const COLLECTION = 'featureSwitches';
const REFRESH_MS = 15_000;
const HISTORY_LIMIT = 20;

/** key → stored doc (only switches that have ever been flipped). */
const state = new Map();
let refreshTimer = null;

async function loadAll() {
    const db = await connectToDb();
    const docs = await db.collection(COLLECTION).find({}).toArray();
    state.clear();
    docs.forEach(doc => state.set(doc._id, doc));
}

/** Boot: load once, then keep in sync. Never throws. */
export async function initFeatureSwitches() {
    try {
        await loadAll();
        const off = [...state.values()].filter(d => d.enabled === false).map(d => d._id);
        console.log(`[features] loaded — ${off.length ? `OFF: ${off.join(', ')}` : 'all on'}`);
    } catch (err) {
        console.warn('[features] initial load failed (fail-open, all on):', err.message);
    }
    if (!refreshTimer) {
        refreshTimer = setInterval(() => loadAll().catch(() => {}), REFRESH_MS);
        refreshTimer.unref?.();
    }
}

export function isFeatureEnabled(key) {
    return state.get(key)?.enabled !== false;
}

/** Public map { key: boolean } for every registered feature. */
export function getFeatureMap() {
    return Object.fromEntries(FEATURE_KEYS.map(key => [key, isFeatureEnabled(key)]));
}

/** Admin view: registry metadata merged with current state + audit trail. */
export function listFeatureSwitches() {
    return FEATURE_REGISTRY.map(({ routes, ...meta }) => {
        const doc = state.get(meta.key);
        return {
            ...meta,
            ui: meta.ui ?? (meta.group === 'Background jobs' ? 'none (scheduled task skipped)' : null),
            // Readable rule for the admin panel: "ANY /api/remote-jobs…" instead of raw regex.
            routes: routes.map(([method, pattern]) => `${method === '*' ? 'ANY' : method} ${pattern.source
                .replace(/\\\//g, '/').replace(/^\^/, '').replace(/\$$/, '')}`),
            enabled: doc?.enabled !== false,
            reason: doc?.reason ?? null,
            updatedBy: doc?.updatedBy ?? null,
            updatedAt: doc?.updatedAt ?? null,
            history: doc?.history ?? [],
        };
    });
}

export async function setFeatureSwitch(key, enabled, { by, reason }) {
    if (!FEATURE_KEYS.includes(key)) throw new Error(`Unknown feature "${key}"`);
    const entry = { enabled: Boolean(enabled), by: by || null, reason: reason || null, at: new Date() };
    const db = await connectToDb();
    await db.collection(COLLECTION).updateOne(
        { _id: key },
        {
            $set: { enabled: entry.enabled, reason: entry.reason, updatedBy: entry.by, updatedAt: entry.at },
            $push: { history: { $each: [entry], $position: 0, $slice: HISTORY_LIMIT } },
        },
        { upsert: true },
    );
    const doc = await db.collection(COLLECTION).findOne({ _id: key });
    state.set(key, doc);
    console.log(`[features] ${key} → ${entry.enabled ? 'ON' : 'OFF'} by ${entry.by}${entry.reason ? ` (${entry.reason})` : ''}`);
    return doc;
}

function disabledResponse(res, key) {
    const feature = FEATURE_REGISTRY.find(f => f.key === key);
    res.set('Retry-After', '300');
    return res.status(503).json({
        error: `${feature?.label ?? 'This feature'} is temporarily paused. Please try again later.`,
        code: 'FEATURE_DISABLED',
        feature: key,
    });
}

/** Route-level guard: `router.get('/x', requireFeature('smartMatch'), handler)`. */
export const requireFeature = (key) => (req, res, next) =>
    isFeatureEnabled(key) ? next() : disabledResponse(res, key);

/**
 * App-level guard driven by each registry entry's `routes`. Mounted once in
 * server.js before the routers, so routes are covered without touching them.
 */
export function featureGuard(req, res, next) {
    const path = req.originalUrl.split('?')[0];
    for (const feature of FEATURE_REGISTRY) {
        if (isFeatureEnabled(feature.key)) continue;
        const hit = feature.routes.some(([method, pattern]) =>
            (method === '*' || method === req.method) && pattern.test(path));
        if (hit) return disabledResponse(res, feature.key);
    }
    return next();
}

/** Cron wrapper: skips the job (with a log line) while its switch is off. */
export function runIfEnabled(key, fn) {
    return async (...args) => {
        if (!isFeatureEnabled(key)) {
            console.log(`[features] ${key} is OFF — skipping scheduled run`);
            return;
        }
        return fn(...args);
    };
}
