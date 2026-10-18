/**
 * Health-check history for the /admin/health uptime bars.
 *
 * Collection: healthRuns. One small doc per run (~23 checks), written by the
 * 10-minute background monitor and by every manual "Run checks". A TTL index
 * drops runs after HISTORY_DAYS, so the collection stays a few thousand docs.
 *
 * Doc: { ranAt, overall, source: 'monitor' | 'manual', checks: [{ key, status, latencyMs }] }
 */
import { connectToDb } from './connection.js';

const HISTORY_DAYS = 14;
let indexReady = false;

async function healthRuns() {
    const db = await connectToDb();
    const collection = db.collection('healthRuns');
    if (!indexReady) {
        indexReady = true;
        await collection.createIndex({ ranAt: 1 }, { expireAfterSeconds: HISTORY_DAYS * 86_400 }).catch(() => {});
    }
    return collection;
}

export async function saveHealthRun({ overall, checks, source }) {
    const collection = await healthRuns();
    await collection.insertOne({
        ranAt: new Date(),
        overall,
        source,
        checks: checks.map(({ key, status, latencyMs }) => ({ key, status, latencyMs })),
    });
}

const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Per-check history: the last `recent` runs (oldest → newest) for the bars,
 * plus uptime and median latency over the whole retained window.
 * Uptime counts 'warn' as up (degraded, still serving) and 'fail' as down.
 */
export async function getHealthHistory({ recent = 48 } = {}) {
    const collection = await healthRuns();
    const runs = await collection.find({}, { projection: { _id: 0 } }).sort({ ranAt: 1 }).toArray();
    const byKey = new Map();
    for (const run of runs) {
        for (const check of run.checks) {
            if (!byKey.has(check.key)) byKey.set(check.key, []);
            byKey.get(check.key).push({ at: run.ranAt, status: check.status, latencyMs: check.latencyMs });
        }
    }
    const checks = {};
    for (const [key, list] of byKey) {
        const up = list.filter(x => x.status !== 'fail').length;
        checks[key] = {
            recent: list.slice(-recent),
            uptime: list.length ? up / list.length : null,
            warnRate: list.length ? list.filter(x => x.status === 'warn').length / list.length : null,
            p50: median(list.map(x => x.latencyMs)),
            runs: list.length,
        };
    }
    return {
        windowDays: HISTORY_DAYS,
        runCount: runs.length,
        firstRunAt: runs[0]?.ranAt ?? null,
        overallRecent: runs.slice(-recent).map(r => ({ at: r.ranAt, overall: r.overall })),
        checks,
    };
}
