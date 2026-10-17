import { getCacheStats } from '../../cache/index.js';
import { verifyToken, verifyAdmin } from '../../middleware/authMiddleware.js';

/**
 * Debug endpoint for the in-memory jobs cache.
 * GET /api/jobs/_cache/stats → { isReady, size, loadedAt, cacheVersion }
 * Admin-only.
 */
export function attachCacheDebugRoute(router) {
    router.get('/_cache/stats', verifyToken, verifyAdmin, (req, res) => {
        res.json(getCacheStats());
    });
}
