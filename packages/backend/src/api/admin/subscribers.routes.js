/**
 * Admin subscribers API — backs the "Subscribers" panel on /admin (Users & growth).
 *
 *   GET  /api/admin/subscribers?q=&limit=&status=subscribed|not   matching users + totals
 *   POST /api/admin/subscribers/set           { email, isSubscribed } — handle
 *                                             "please unsubscribe me" emails
 *
 * Kill switch: `adminSubscribers` (featureRegistry routes). The public
 * one-click link (/api/auth/unsubscribe) is separate and never gated.
 */
import { Router } from 'express';
import { verifyToken, verifyAdmin } from '../../middleware/authMiddleware.js';
import { listSubscribers, setSubscriptionByEmail } from '../../db/index.js';

export const adminSubscribersRouter = Router();
adminSubscribersRouter.use(verifyToken, verifyAdmin);

adminSubscribersRouter.get('/', async (req, res) => {
    try {
        res.status(200).json(await listSubscribers({ query: req.query.q, limit: req.query.limit, status: req.query.status }));
    } catch (error) {
        console.error('[admin/subscribers] list failed:', error.message);
        res.status(500).json({ error: 'Could not load subscribers.' });
    }
});

adminSubscribersRouter.post('/set', async (req, res) => {
    const { email, isSubscribed } = req.body || {};
    if (typeof email !== 'string' || !email.includes('@') || typeof isSubscribed !== 'boolean') {
        return res.status(400).json({ error: 'Send an email address and isSubscribed true/false.' });
    }
    try {
        const result = await setSubscriptionByEmail(email, isSubscribed, 'admin');
        if (!result.found) return res.status(404).json({ error: 'No user with that email address.' });
        console.log(`[admin/subscribers] ${email} → ${isSubscribed ? 'subscribed' : 'unsubscribed'} by ${req.user?.email || req.user?.id}`);
        res.status(200).json(result);
    } catch (error) {
        console.error('[admin/subscribers] set failed:', error.message);
        res.status(500).json({ error: 'Could not update the subscription.' });
    }
});
