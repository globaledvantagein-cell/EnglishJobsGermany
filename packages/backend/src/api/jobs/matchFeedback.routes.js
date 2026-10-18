// ─── Match Feedback Routes ─────────────────────────────────────────────────────
//
// POST   /api/jobs/match-feedback              record what a user did with a match
// POST   /api/jobs/match-feedback/impressions  log a shown list with positions
// DELETE /api/jobs/match-feedback/:jobId       undo a "Not interested"
//
// Feeds the per-user ranking adjustments in src/matching/feedbackModel.js,
// used by both Today's Matches and Smart Match.

import { Router } from 'express';
import { verifyToken } from '../../middleware/authMiddleware.js';
import { recordMatchEvent, recordImpressions, deleteMatchDismissal } from '../../db/index.js';
import { findCachedJobByAnyId } from '../../cache/index.js';
import { jobFeatures } from '../../matching/index.js';
import { Analytics } from '../../models/analyticsModel.js';

const router = Router();

const ACTIONS = new Set(['dismiss', 'open', 'view_job', 'company_site', 'save', 'apply']);
const SOURCES = new Set(['today', 'smart']);
export const DISMISS_REASONS = new Set([
    'company', 'role', 'skills', 'location', 'seniority', 'work_auth', 'already_applied', 'not_real', 'other',
]);
const MAX_IMPRESSIONS = 50;
const isListId = v => typeof v === 'string' && v.length > 0 && v.length <= 64;

router.post('/match-feedback', verifyToken, async (req, res) => {
    try {
        const { jobId, source, action, reason, position, listId } = req.body || {};
        if (!jobId || typeof jobId !== 'string' || jobId.length > 64) return res.status(400).json({ error: 'jobId is required' });
        if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' });
        if (!SOURCES.has(source)) return res.status(400).json({ error: 'Invalid source' });
        if (action === 'dismiss' && reason != null && !DISMISS_REASONS.has(reason)) return res.status(400).json({ error: 'Invalid reason' });

        let job = null;
        try { job = findCachedJobByAnyId(jobId); } catch { /* cache warming: record without snapshot */ }

        await recordMatchEvent(req.user.id, {
            jobId,
            source,
            action,
            reason: action === 'dismiss' ? (reason || 'other') : null,
            position: Number.isInteger(position) && position >= 0 && position < 1000 ? position : null,
            listId: isListId(listId) ? listId : null,
            snapshot: job ? jobFeatures(job) : null,
        });
        Analytics.increment(`matchFeedback_${action}`);
        res.status(201).json({ ok: true });
    } catch (error) {
        console.error('[MatchFeedback] record failed:', error.message);
        res.status(500).json({ error: 'Failed to record feedback' });
    }
});

router.post('/match-feedback/impressions', verifyToken, async (req, res) => {
    try {
        const { source, listId, jobIds } = req.body || {};
        if (!SOURCES.has(source) || !isListId(listId)) return res.status(400).json({ error: 'Invalid source or listId' });
        if (!Array.isArray(jobIds) || jobIds.length === 0 || jobIds.length > MAX_IMPRESSIONS || !jobIds.every(id => typeof id === 'string' && id.length <= 64)) {
            return res.status(400).json({ error: 'jobIds must be 1–50 ids' });
        }
        const logged = await recordImpressions(req.user.id, { source, listId, jobIds });
        res.status(201).json({ ok: true, logged });
    } catch (error) {
        console.error('[MatchFeedback] impressions failed:', error.message);
        res.status(500).json({ error: 'Failed to record impressions' });
    }
});

router.delete('/match-feedback/:jobId', verifyToken, async (req, res) => {
    try {
        const removed = await deleteMatchDismissal(req.user.id, req.params.jobId);
        res.json({ ok: true, removed });
    } catch (error) {
        console.error('[MatchFeedback] undo failed:', error.message);
        res.status(500).json({ error: 'Failed to undo' });
    }
});

export function attachMatchFeedbackRoutes(jobsRouter) {
    jobsRouter.use('/', router);
}
