/**
 * Admin link-validator API — backs the "Check links now" button on /admin/health.
 *
 *   GET  /api/admin/validator       live progress + last 10 runs
 *   POST /api/admin/validator/run   start a full sweep in the background (202)
 *                                   body { force: true } skips the circuit breaker
 *
 * Both sit behind the `cronValidator` kill switch (featureRegistry routes), so
 * one switch stops the cron, the button and this API together.
 */
import { Router } from 'express';
import { verifyToken, verifyAdmin } from '../../middleware/authMiddleware.js';
import { runValidator, getValidatorStatus } from '../../cron/runValidator.js';
import { getRecentValidatorRuns } from '../../db/index.js';

export const adminValidatorRouter = Router();
adminValidatorRouter.use(verifyToken, verifyAdmin);

adminValidatorRouter.get('/', async (req, res) => {
    const runs = await getRecentValidatorRuns(10).catch(() => []);
    res.status(200).json({ status: getValidatorStatus(), runs });
});

adminValidatorRouter.post('/run', (req, res) => {
    if (getValidatorStatus().running) {
        return res.status(409).json({ error: 'A link check is already running.', status: getValidatorStatus() });
    }
    // Fire-and-forget: a full sweep takes minutes, far past any request timeout.
    // runValidator never throws; its outcome lands in validatorRuns.
    runValidator({ source: 'manual', force: req.body?.force === true });
    res.status(202).json({ started: true, status: getValidatorStatus() });
});
