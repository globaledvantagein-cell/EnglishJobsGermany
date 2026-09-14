import { ObjectId } from 'mongodb';
import { connectToDb } from '../../db/connection.js';
import { verifyToken } from '../../middleware/authMiddleware.js';

/**
 * GDPR self-service account deletion.
 *
 * Codifies the manual erasure runbook: every collection that holds user PII is
 * swept, keyed on the user's _id and email. Job/scrape/cache collections
 * (jobs, remoteJobs, aiResultCache, scrapeState, analytics, careerGuide,
 * digestRuns, cacheState) carry no personal data and are deliberately untouched.
 *
 * Each step is isolated: a failure is logged and recorded in `failed`, then the
 * sweep continues, so one bad collection can never strand a user's data in the
 * others. `users` is deleted LAST so a partial failure leaves the account
 * reachable for a retry rather than orphaning rows behind a deleted login.
 */
export function attachDeleteAccountRoute(authRouter) {
    // ─── DELETE /api/auth/account ─────────────────────────────────────────
    authRouter.delete('/account', verifyToken, async (req, res) => {
        let db;
        let user;
        try {
            db = await connectToDb();
            user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
        } catch (error) {
            console.error('[GDPR] Could not load account for deletion:', error.message);
            return res.status(500).json({ error: 'Server Error' });
        }
        if (!user) return res.status(404).json({ error: 'User not found' });

        const userId = user._id;
        const email = user.email;
        const deleted = {};
        const failed = {};

        // Run one erasure step, recording its outcome without aborting the sweep.
        const step = async (name, fn) => {
            try {
                deleted[name] = await fn();
            } catch (error) {
                console.error(`[GDPR] Failed to clear ${name} for ${email}:`, error.message);
                failed[name] = error.message;
            }
        };

        // Visitor docs first — their ids are needed to reach the anonymous
        // apply clicks this person made before they signed up.
        let visitorIds = [];
        let visitorVids = [];
        try {
            const linked = await db.collection('visitors')
                .find({ linkedUserId: userId }, { projection: { vid: 1 } })
                .toArray();
            visitorIds = linked.map(v => v._id);
            visitorVids = linked.map(v => v.vid).filter(Boolean);
        } catch (error) {
            console.error('[GDPR] Could not enumerate linked visitors:', error.message);
            failed.visitorLookup = error.message;
        }

        await step('subscriptions', async () => {
            const r = await db.collection('subscriptions').deleteMany({ userId });
            return r.deletedCount;
        });

        await step('promoCodes', async () => {
            const r = await db.collection('promoCodes').deleteMany({ generatedFor: email });
            // A code they redeemed belongs to whoever issued it — keep the code,
            // drop only the link back to this person.
            await db.collection('promoCodes').updateMany(
                { redeemedBy: userId },
                { $unset: { redeemedBy: '' } },
            );
            return r.deletedCount;
        });

        await step('applyClicks', async () => {
            // Clicks are keyed by visitorId: `user_<id>` once signed in, the raw
            // visitor id/vid before that. Sweep every identifier this person used.
            const visitorKeys = [
                `user_${userId.toString()}`,
                ...visitorIds.map(id => id.toString()),
                ...visitorVids,
            ];
            const r = await db.collection('applyClicks').deleteMany({
                $or: [
                    { userId },
                    { visitorId: { $in: visitorKeys } },
                ],
            });
            return r.deletedCount;
        });

        await step('visitors', async () => {
            const r = await db.collection('visitors').deleteMany({ linkedUserId: userId });
            return r.deletedCount;
        });

        await step('visitor_creation_log', async () => {
            const r = await db.collection('visitor_creation_log').deleteMany({ linkedUserId: userId });
            return r.deletedCount;
        });

        await step('feedback', async () => {
            const r = await db.collection('feedback').deleteMany({
                $or: [{ email }, { userId }],
            });
            return r.deletedCount;
        });

        await step('cohortWaitlist', async () => {
            const r = await db.collection('cohortWaitlist').deleteOne({ email });
            return r.deletedCount;
        });

        await step('users', async () => {
            const r = await db.collection('users').deleteOne({ _id: userId });
            return r.deletedCount;
        });

        const clearedCollections = Object.keys(deleted);
        console.log(`[GDPR] Account deleted: ${email} — removed from ${clearedCollections.length} collections`);

        // The account row itself must be gone for this to count as a deletion.
        if (failed.users || !deleted.users) {
            return res.status(500).json({
                success: false,
                error: 'Account deletion did not complete. Please try again.',
                deleted,
                failed,
            });
        }

        res.json({
            success: true,
            message: 'Account deleted',
            deleted,
            ...(Object.keys(failed).length ? { failed } : {}),
        });
    });
}
