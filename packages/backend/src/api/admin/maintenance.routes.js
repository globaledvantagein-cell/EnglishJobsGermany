/**
 * Admin maintenance API — backs the "Data maintenance" panel on /admin/health.
 *
 *   GET  /api/admin/maintenance              tasks, live status, last 10 runs
 *   POST /api/admin/maintenance/:key/run     start one task in the background (202)
 *
 * Tasks only ever start from this POST — they are not scheduled.
 * Kill switch: `adminMaintenance` (featureRegistry routes).
 */
import { Router } from 'express';
import { verifyToken, verifyAdmin } from '../../middleware/authMiddleware.js';
import {
    MAINTENANCE_TASKS,
    getMaintenanceStatus,
    getRecentMaintenanceRuns,
    startMaintenanceTask,
} from '../../maintenance/taskRunner.js';

export const adminMaintenanceRouter = Router();
adminMaintenanceRouter.use(verifyToken, verifyAdmin);

adminMaintenanceRouter.get('/', async (req, res) => {
    const tasks = Object.entries(MAINTENANCE_TASKS).map(([key, t]) => ({ key, kind: t.kind, label: t.label, description: t.description }));
    const runs = await getRecentMaintenanceRuns(10).catch(() => []);
    res.status(200).json({ tasks, status: getMaintenanceStatus(), runs });
});

adminMaintenanceRouter.post('/:key/run', (req, res) => {
    try {
        const status = startMaintenanceTask(req.params.key, { startedBy: req.user?.email || req.user?.id || null });
        res.status(202).json({ started: true, status });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not start the task.' });
    }
});
