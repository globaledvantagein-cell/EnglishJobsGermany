/**
 * Admin health/status API — backs the /admin status dashboard.
 *
 * GET /api/admin/health  (verifyToken + verifyAdmin)
 *
 * Runs a battery of checks — internal (DB, config, data freshness) and
 * self-HTTP pings against the real public endpoints. Self-pings carry the
 * `x-health-check: 1` header, which:
 *   - makes attachVisitor return null (no visitor records are ever created)
 *   - skips the pageViews analytics counters
 * so continuous monitoring never pollutes traffic stats.
 *
 * Statuses per check: 'ok' | 'warn' | 'fail'. Overall:
 *   any critical fail → 'down'; any warn/non-critical fail → 'degraded';
 *   else 'operational'.
 */
import { Router } from 'express';
import { verifyToken, verifyAdmin } from '../../middleware/authMiddleware.js';
import { connectToDb } from '../../db/connection.js';
import { GOOGLE_CLIENT_ID, RESEND_API_KEY } from '../../env.js';
import { getCacheSize as getAiCacheSize, isAiResultCacheReady } from '../../cache/aiResultCache.js';
// jobsCache exposes no getJobsMap — getCacheStats() carries { size, isReady,
// isFullyLoaded }, which is what these checks need.
import { getCacheStats, isJobsCacheFullyLoaded } from '../../cache/jobsCache.js';
import { getRemoteCacheStats } from '../../cache/remoteJobsCache.js';
import { getSearchIndexSize, getRemoteSearchIndexSize } from '../../cache/searchIndex.js';
import { getRemoteJobsWatcherStats } from '../../cache/remoteJobsWatcher.js';
import {
    getActiveKeyCount as getGeminiActiveKeys,
    getTotalKeyCount as getGeminiTotalKeys,
    getAllKeysStatus as getGeminiKeyStatus,
} from '../../gemini/keyManager.js';
// Gemma's manager has no getActiveKeyCount — it has getKeyCount, and its keys
// carry no dead flag (there is no 403 path for Gemma).
import { getKeyCount as getGemmaKeyCount, getAllKeysStatus as getGemmaKeyStatus } from '../../gemma/keyManager.js';
import { isGeminiBudgetExhausted } from '../../gemini/geminiClient.js';
import { LEGACY_CATEGORY_MAP } from '../../core/categorize.js';

// Values written before the AI categorizer existed. A job still carrying one of
// these is uncategorized as far as the 28-category filter is concerned.
const LEGACY_CATEGORY_VALUES = Object.keys(LEGACY_CATEGORY_MAP);

export const adminHealthRouter = Router();
adminHealthRouter.use(verifyToken, verifyAdmin);

const SELF_ORIGIN = process.env.SELF_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
const PING_TIMEOUT_MS = 5000;

/** Timed wrapper: runs fn, returns { status, latencyMs, detail }. */
async function timed(fn) {
    const t0 = Date.now();
    try {
        const result = await fn();
        return { latencyMs: Date.now() - t0, ...result };
    } catch (err) {
        return { status: 'fail', latencyMs: Date.now() - t0, detail: err.message };
    }
}

/** Self-ping a public endpoint with the health header. */
async function pingEndpoint(path, { expectJson = true } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
        const res = await fetch(`${SELF_ORIGIN}${path}`, {
            headers: { 'x-health-check': '1' },
            signal: controller.signal,
        });
        if (!res.ok) return { status: 'fail', detail: `HTTP ${res.status}` };
        if (expectJson) await res.json();
        return { status: 'ok', detail: `HTTP ${res.status}` };
    } catch (err) {
        return { status: 'fail', detail: err.name === 'AbortError' ? `timeout after ${PING_TIMEOUT_MS}ms` : err.message };
    } finally {
        clearTimeout(timer);
    }
}

// Check definitions. `critical: true` failures mark the whole system 'down'.
const CHECKS = [
    {
        key: 'database', label: 'MongoDB', group: 'Core', critical: true,
        run: async () => {
            const db = await connectToDb();
            await db.command({ ping: 1 });
            return { status: 'ok', detail: 'ping ok' };
        },
    },
    {
        key: 'jobs_api', label: 'Jobs API (list)', group: 'Public API', critical: true,
        run: () => pingEndpoint('/api/jobs?limit=1'),
    },
    {
        key: 'filter_counts_api', label: 'Jobs API (filter counts)', group: 'Public API', critical: false,
        run: () => pingEndpoint('/api/jobs/filter-counts'),
    },
    {
        key: 'career_guide_api', label: 'Career Guide API', group: 'Public API', critical: false,
        run: () => pingEndpoint('/api/career-guide/public'),
    },
    {
        key: 'jobs_data', label: 'Active jobs in DB', group: 'Data', critical: true,
        run: async () => {
            const db = await connectToDb();
            const n = await db.collection('jobs').countDocuments({ Status: 'active' });
            if (n === 0) return { status: 'fail', detail: '0 active jobs' };
            if (n < 20) return { status: 'warn', detail: `only ${n} active jobs` };
            return { status: 'ok', detail: `${n} active jobs` };
        },
    },
    {
        key: 'scraper_freshness', label: 'Scraper freshness', group: 'Data', critical: false,
        run: async () => {
            const db = await connectToDb();
            const [latest] = await db.collection('jobs')
                .find({}, { projection: { scrapedAt: 1 } })
                .sort({ scrapedAt: -1 }).limit(1).toArray();
            if (!latest?.scrapedAt) return { status: 'warn', detail: 'no scrapedAt found' };
            const hours = (Date.now() - new Date(latest.scrapedAt).getTime()) / 3.6e6;
            if (hours > 48) return { status: 'fail', detail: `last scrape ${Math.round(hours)}h ago` };
            if (hours > 30) return { status: 'warn', detail: `last scrape ${Math.round(hours)}h ago` };
            return { status: 'ok', detail: `last scrape ${Math.round(hours)}h ago` };
        },
    },
    {
        key: 'users', label: 'User accounts', group: 'Data', critical: false,
        run: async () => {
            const db = await connectToDb();
            const n = await db.collection('users').estimatedDocumentCount();
            return { status: 'ok', detail: `${n} users` };
        },
    },
    {
        key: 'auth_config', label: 'Auth config', group: 'Config', critical: true,
        run: async () => {
            if (!process.env.JWT_SECRET) return { status: 'fail', detail: 'JWT_SECRET missing' };
            if (!GOOGLE_CLIENT_ID) return { status: 'fail', detail: 'GOOGLE_CLIENT_ID missing' };
            return { status: 'ok', detail: 'JWT + Google OAuth configured' };
        },
    },
    {
        key: 'email_config', label: 'Email (Resend)', group: 'Config', critical: false,
        run: async () => (RESEND_API_KEY
            ? { status: 'ok', detail: 'API key present' }
            : { status: 'fail', detail: 'RESEND_API_KEY missing' }),
    },
    {
        key: 'digest_cron', label: 'Weekly digest cron', group: 'Cron', critical: false,
        run: async () => {
            const db = await connectToDb();
            const [last] = await db.collection('digestRuns')
                .find({}, { projection: { finishedAt: 1, startedAt: 1 } })
                .sort({ startedAt: -1 }).limit(1).toArray();
            if (!last) return { status: 'warn', detail: 'no digest runs recorded yet' };

            // A run row can exist with startedAt missing or unparseable, which
            // made getTime() return NaN and rendered as "last run NaNd ago".
            const startedMs = new Date(last.startedAt).getTime();
            if (!Number.isFinite(startedMs)) {
                return { status: 'warn', detail: 'last run date invalid' };
            }

            const hours = (Date.now() - startedMs) / 3.6e6;
            const days = hours / 24;
            // Under a day, "0d ago" reads as though it never ran — show hours.
            const ago = days < 1 ? `${Math.round(hours)}h ago` : `${Math.round(days)}d ago`;

            if (days > 8) return { status: 'warn', detail: `last run ${ago}` };
            return { status: 'ok', detail: `last run ${ago}` };
        },
    },

    // ── Cache ──────────────────────────────────────────────────────────
    {
        key: 'ai_result_cache', label: 'AI Result Cache', group: 'Cache', critical: true,
        run: async () => {
            if (!isAiResultCacheReady()) return { status: 'fail', detail: 'not loaded' };
            const n = getAiCacheSize();
            if (n === 0) return { status: 'fail', detail: '0 fingerprints cached' };
            if (n < 1000) return { status: 'warn', detail: `${n} fingerprints (expected 13K+)` };
            return { status: 'ok', detail: `${n} fingerprints cached` };
        },
    },
    {
        key: 'jobs_cache', label: 'Jobs Cache', group: 'Cache', critical: true,
        run: async () => {
            const { size } = getCacheStats();
            // Emptiness is checked BEFORE the streaming check: a cache that is
            // still loading but holds nothing is a failure, not a warning.
            if (size === 0) return { status: 'fail', detail: 'empty cache' };
            if (!isJobsCacheFullyLoaded()) return { status: 'warn', detail: `still streaming (${size} loaded so far)` };
            if (size < 100) return { status: 'warn', detail: `only ${size} jobs in cache` };
            return { status: 'ok', detail: `${size} jobs in cache` };
        },
    },
    {
        key: 'remote_cache', label: 'Remote Jobs Cache', group: 'Cache', critical: false,
        run: async () => {
            const { size, isReady } = getRemoteCacheStats();
            if (!isReady) return { status: 'warn', detail: 'not loaded' };
            if (size === 0) return { status: 'warn', detail: 'empty cache' };
            if (size < 100) return { status: 'warn', detail: `only ${size} remote jobs in cache` };
            return { status: 'ok', detail: `${size} remote jobs in cache` };
        },
    },
    {
        key: 'search_index', label: 'Search Index', group: 'Cache', critical: false,
        run: async () => {
            const indexed = getSearchIndexSize();
            const remoteIndexed = getRemoteSearchIndexSize();
            const cached = getCacheStats().size;
            if (indexed === 0 && cached > 0) {
                return { status: 'fail', detail: `0 indexed but ${cached} jobs cached` };
            }
            // The index is fed from the cache, so a large shortfall means adds
            // are being dropped — search would silently miss those jobs.
            if (cached > 0 && indexed < cached * 0.9) {
                return { status: 'warn', detail: `${indexed} indexed vs ${cached} cached` };
            }
            return { status: 'ok', detail: `${indexed} jobs, ${remoteIndexed} remote indexed` };
        },
    },

    // ── AI ─────────────────────────────────────────────────────────────
    {
        key: 'gemini_keys', label: 'Gemini API Keys', group: 'AI', critical: true,
        run: async () => {
            const active = getGeminiActiveKeys();
            const total = getGeminiTotalKeys();
            const perKey = getGeminiKeyStatus()
                .map(k => `${k.key}: ${k.status} (${k.requestsThisMinute}/min)`)
                .join(' · ');

            if (active === 0) return { status: 'fail', detail: `all keys dead — ${perKey}` };
            if (active < total) {
                return { status: 'warn', detail: `${active}/${total} keys active, ${total - active} dead (403) — ${perKey}` };
            }
            return { status: 'ok', detail: `${active}/${total} active — ${perKey}` };
        },
    },
    {
        key: 'gemma_keys', label: 'Gemma API Keys', group: 'AI', critical: false,
        run: async () => {
            // getKeyCount() throws when GEMMA_API_KEYS is unset; timed() turns
            // that into a fail, which is the right signal.
            const total = getGemmaKeyCount();
            if (total === 0) return { status: 'fail', detail: 'no Gemma keys configured' };
            const perKey = getGemmaKeyStatus()
                .map(k => `${k.key}: ${k.requestsThisMinute}/min`)
                .join(' · ');
            return { status: 'ok', detail: `${total} key(s) — ${perKey}` };
        },
    },
    {
        key: 'gemini_budget', label: 'Gemini Daily Budget', group: 'AI', critical: false,
        run: async () => (isGeminiBudgetExhausted()
            ? { status: 'warn', detail: 'all models exhausted for today — scraper will skip AI' }
            : { status: 'ok', detail: 'budget available' }),
    },

    // ── Public API ─────────────────────────────────────────────────────
    {
        key: 'remote_jobs_api', label: 'Remote Jobs API', group: 'Public API', critical: false,
        run: () => pingEndpoint('/api/remote-jobs?limit=1'),
    },
    {
        key: 'category_counts_api', label: 'Category Counts API', group: 'Public API', critical: false,
        run: () => pingEndpoint('/api/jobs/category-counts'),
    },
    {
        key: 'autocomplete_api', label: 'Search Autocomplete', group: 'Public API', critical: false,
        run: () => pingEndpoint('/api/jobs/autocomplete?q=engineer'),
    },

    // ── Data ───────────────────────────────────────────────────────────
    {
        key: 'remote_watcher', label: 'Remote Jobs Watcher', group: 'Data', critical: false,
        run: async () => {
            const s = getRemoteJobsWatcherStats();
            const detail =
                `mode=${s.mode} · applied ${s.eventsApplied}/${s.eventsReceived} · ` +
                `reconnects ${s.reconnects} · pending ${s.pendingEvents}/${s.pendingCategorization} · ` +
                `last event ${s.lastEventAt ? new Date(s.lastEventAt).toISOString() : 'never'}`;

            if (s.mode === 'stopped') return { status: 'fail', detail: `watcher stopped — ${detail}` };
            // Polling still keeps the cache correct, just far less promptly.
            if (s.mode === 'polling') return { status: 'warn', detail: `degraded to polling — ${detail}` };
            if (s.lastError) return { status: 'warn', detail: `${detail} · lastError: ${s.lastError}` };
            return { status: 'ok', detail };
        },
    },
    {
        key: 'remote_freshness', label: 'Remote scraper freshness', group: 'Data', critical: false,
        run: async () => {
            const db = await connectToDb();
            const [latest] = await db.collection('remoteJobs')
                .find({}, { projection: { scrapedAt: 1 } })
                .sort({ scrapedAt: -1 }).limit(1).toArray();
            if (!latest?.scrapedAt) return { status: 'warn', detail: 'no scrapedAt found' };
            const hours = (Date.now() - new Date(latest.scrapedAt).getTime()) / 3.6e6;
            if (hours > 48) return { status: 'warn', detail: `last remote scrape ${Math.round(hours)}h ago` };
            return { status: 'ok', detail: `last remote scrape ${Math.round(hours)}h ago` };
        },
    },
    {
        key: 'categorizer', label: 'Job Categorization', group: 'Data', critical: false,
        run: async () => {
            const db = await connectToDb();
            const query = {
                $or: [
                    { Category: null },
                    { Category: { $exists: false } },
                    { Category: { $in: LEGACY_CATEGORY_VALUES } },
                ],
            };
            const [main, remote] = await Promise.all([
                db.collection('jobs').countDocuments(query),
                db.collection('remoteJobs').countDocuments(query),
            ]);
            const total = main + remote;
            if (total > 100) {
                return { status: 'warn', detail: `${total} jobs uncategorized (${main} jobs, ${remote} remoteJobs)` };
            }
            return { status: 'ok', detail: `${total} uncategorized` };
        },
    },
];

adminHealthRouter.get('/', async (req, res) => {
    const results = await Promise.all(CHECKS.map(async c => {
        const r = await timed(c.run);
        return {
            key: c.key, label: c.label, group: c.group, critical: c.critical,
            status: r.status, latencyMs: r.latencyMs, detail: r.detail || '',
        };
    }));

    const criticalFail = results.some(r => r.critical && r.status === 'fail');
    const anyIssue = results.some(r => r.status !== 'ok');
    const overall = criticalFail ? 'down' : anyIssue ? 'degraded' : 'operational';

    res.status(200).json({
        overall,
        timestamp: new Date().toISOString(),
        checks: results,
    });
});
