/**
 * Kill switches (see KILL_SWITCHES.md).
 *
 * GET   /api/features                 public — { features: { key: boolean } }
 * GET   /api/admin/features           admin  — registry + state + audit trail
 * PATCH /api/admin/features/:key      admin  — { enabled, reason? }
 */
import { Router } from 'express';
import { verifyToken, verifyAdmin } from '../middleware/authMiddleware.js';
import { getUserProfile } from '../db/index.js';
import { getFeatureMap, listFeatureSwitches, setFeatureSwitch, FEATURE_GROUPS, FEATURE_KEYS } from '../features/index.js';

export const featuresRouter = Router();

featuresRouter.get('/', (req, res) => {
    // Never cached: a flip must reach browsers on their next poll.
    res.set('Cache-Control', 'no-store');
    res.json({ features: getFeatureMap() });
});

export const adminFeaturesRouter = Router();
adminFeaturesRouter.use(verifyToken, verifyAdmin);

adminFeaturesRouter.get('/', (req, res) => {
    res.json({ groups: FEATURE_GROUPS, features: listFeatureSwitches() });
});

adminFeaturesRouter.patch('/:key', async (req, res) => {
    const { key } = req.params;
    const { enabled, reason } = req.body ?? {};
    if (!FEATURE_KEYS.includes(key)) return res.status(404).json({ error: `Unknown feature "${key}"` });
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: '`enabled` must be a boolean' });
    try {
        // The JWT carries only id + role; the audit trail wants a readable name.
        const profile = await getUserProfile(req.user.id).catch(() => null);
        await setFeatureSwitch(key, enabled, {
            by: profile?.email || req.user.id,
            reason: typeof reason === 'string' ? reason.trim().substring(0, 300) : null,
        });
        res.json({ features: listFeatureSwitches() });
    } catch (err) {
        console.error('[features] toggle failed:', err);
        res.status(500).json({ error: 'Could not save the switch' });
    }
});
