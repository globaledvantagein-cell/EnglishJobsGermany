// ─── Skill Match Routes (Today's Matches) ──────────────────────────────────────
//
// GET /api/jobs/skill-matches → today's list of skill-matched jobs (no AI)
//
// Computed ONCE per calendar day (UTC) and saved on the user doc as
// dailyMatches. Every later request that day returns the same list; there is
// deliberately no force-refresh. The only exception is a changed profile
// (skills, seniority, years, languages, roles, job preferences — or a new
// engine version): editing the profile is a different question, so it gets a
// fresh answer instead of a stale one.
//
// "Not interested" during the day does not recompute; the dismissed job is
// just filtered out of the stored list on read, and tomorrow's computation
// learns from the feedback.

import { Router } from 'express';
import crypto from 'node:crypto';
import { verifyToken, requirePremium } from '../../middleware/authMiddleware.js';
import { getMatchProfile, getUserMatchFeedback, getGloballyFlaggedJobIds } from '../../db/index.js';
import { getSkillMatches } from '../../skill-matcher/index.js';
import { FIT_VERSION, buildFeedbackProfile } from '../../matching/index.js';
import { connectToDb } from '../../db/connection.js';
import { ObjectId } from 'mongodb';
import { Analytics } from '../../models/analyticsModel.js';

const router = Router();
const DAILY_LIMIT = 10;

function profileHash(profile, jobPreferences) {
    if (!profile) return '';
    const skills = (profile.skills || []).map(s => (typeof s === 'string' ? s : s?.name || '')).sort();
    const inputs = {
        engine: FIT_VERSION,
        skills,
        seniority: profile.seniority_level ?? null,
        years: profile.total_experience_years ?? null,
        domain: profile.domain ?? null,
        languages: profile.languages ?? [],
        roles: (profile.experience || []).slice(0, 3).map(r => r?.title),
        visa: profile.visa_required ?? null,
        jobPreferences: jobPreferences ?? null,
    };
    return crypto.createHash('md5').update(JSON.stringify(inputs)).digest('hex');
}

function todayStr() {
    return new Date().toISOString().slice(0, 10); // "2026-07-09"
}

function tomorrowUtc() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
}

async function loadFeedback(userId) {
    try {
        const [events, flagged] = await Promise.all([getUserMatchFeedback(userId), getGloballyFlaggedJobIds()]);
        return buildFeedbackProfile(events, flagged);
    } catch (err) {
        console.warn('[SkillMatch] Feedback unavailable, ranking without it:', err.message);
        return null;
    }
}

const hiddenFilter = feedback => match =>
    !feedback || !feedback.hiddenJobIds.has(String(match._id))
    && !feedback.hiddenCompanies.has(String(match.Company || '').toLowerCase().trim());

// Premium-gated; requirePremium must run AFTER verifyToken.
router.get('/skill-matches', verifyToken, requirePremium, async (req, res) => {
    try {
        Analytics.increment('pageViews_todayMatches'); // page opened (cache hit or miss)
        const stored = await getMatchProfile(req.user.id);
        const profile = stored?.parsedProfile || null;
        const currentHash = profileHash(profile, stored?.jobPreferences);
        const feedback = await loadFeedback(req.user.id);
        const schedule = { computedFor: todayStr(), nextUpdateAt: tomorrowUtc() };

        // ── Today's list already exists → serve it (minus today's dismissals) ──
        const cache = stored?.dailyMatches;
        if (cache && cache.date === todayStr() && cache.skillHash === currentHash) {
            return res.json({
                matches: cache.matches.filter(hiddenFilter(feedback)),
                meta: { ...cache.meta, ...schedule, computedAt: cache.computedAt },
                cached: true,
            });
        }

        // ── First request of the day (or profile changed): compute once ──
        // Yesterday's list is pushed to the back so the days differ.
        const excludeIds = (cache?.matches || []).map(m => m.JobID);
        const { matches, meta } = getSkillMatches(profile, DAILY_LIMIT, {
            excludeIds,
            jobPreferences: stored?.jobPreferences,
            feedback,
        });
        const computedAt = new Date();

        if (meta.reason === 'ok' || meta.reason === 'no_matches') {
            const db = await connectToDb();
            db.collection('users').updateOne(
                { _id: new ObjectId(req.user.id) },
                { $set: {
                    dailyMatches: {
                        matches,
                        meta,
                        date: todayStr(),
                        skillHash: currentHash,
                        computedAt,
                    },
                }},
            ).catch(err => console.warn('[SkillMatch] Cache save failed:', err.message));
            Analytics.increment('todayMatch_runs'); // fire-and-forget
        }

        res.json({ matches, meta: { ...meta, ...schedule, computedAt }, cached: false });
    } catch (error) {
        console.error('[SkillMatch] Failed:', error.message);
        res.status(500).json({ error: 'Failed to compute skill matches' });
    }
});

export function attachSkillMatchRoutes(jobsRouter) {
    jobsRouter.use('/', router);
}
