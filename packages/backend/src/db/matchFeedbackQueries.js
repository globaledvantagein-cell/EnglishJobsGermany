// ─── Match Feedback Queries ────────────────────────────────────────────────────
//
// What users do with their match recommendations — the training signal for
// personalised ranking (and, once enough accumulates, a learned ranker).
//
// One document per event in `matchFeedback`. Dismissals are unique per
// (user, job) so "Not interested" can be undone; positive events are appended.
// Each event carries a small snapshot of the job's features, so feedback keeps
// teaching the ranker after the job itself has expired.

import { ObjectId } from 'mongodb';
import { connectToDb } from './connection.js';

const COLLECTION = 'matchFeedback';
const FEEDBACK_WINDOW_DAYS = 180;
const GLOBAL_FLAG_MIN_USERS = 2;

let indexesReady = null;

async function collection() {
    const db = await connectToDb();
    const col = db.collection(COLLECTION);
    if (!indexesReady) {
        indexesReady = Promise.all([
            col.createIndex({ userId: 1, createdAt: -1 }),
            col.createIndex({ userId: 1, jobId: 1, action: 1 }),
            col.createIndex({ action: 1, reason: 1, jobId: 1 }),
        ]).catch(err => { indexesReady = null; throw err; });
    }
    await indexesReady;
    return col;
}

/**
 * @param {string} userId
 * @param {{ jobId: string, source: string, action: string, reason?: string|null, snapshot?: object }} event
 */
export async function recordMatchEvent(userId, event) {
    const col = await collection();
    const doc = {
        userId: new ObjectId(userId),
        jobId: String(event.jobId),
        source: event.source,
        action: event.action,
        reason: event.reason ?? null,
        // Where the job sat in the list the user saw — lets a learned ranker
        // correct for position bias (top results get clicked regardless).
        position: Number.isInteger(event.position) ? event.position : null,
        listId: event.listId ?? null,
        snapshot: event.snapshot ?? null,
        createdAt: new Date(),
    };
    if (event.action === 'dismiss') {
        // One dismissal per job; re-dismissing updates the reason.
        await col.updateOne(
            { userId: doc.userId, jobId: doc.jobId, action: 'dismiss' },
            { $set: doc },
            { upsert: true },
        );
        return;
    }
    await col.insertOne(doc);
}

/**
 * Log that a list was shown: one 'impression' per job with its position.
 * Logged once per (user, listId) — reloading the same list adds nothing.
 */
export async function recordImpressions(userId, { source, listId, jobIds }) {
    const col = await collection();
    const user = new ObjectId(userId);
    if (await col.findOne({ userId: user, listId, action: 'impression' }, { projection: { _id: 1 } })) return 0;
    const now = new Date();
    const docs = jobIds.map((jobId, position) => ({
        userId: user, jobId: String(jobId), source, action: 'impression', reason: null,
        position, listId, snapshot: null, createdAt: now,
    }));
    if (docs.length) await col.insertMany(docs, { ordered: false });
    return docs.length;
}

/** Undo a "Not interested". */
export async function deleteMatchDismissal(userId, jobId) {
    const col = await collection();
    const result = await col.deleteOne({ userId: new ObjectId(userId), jobId: String(jobId), action: 'dismiss' });
    return result.deletedCount > 0;
}

/** The user's recent match events, newest first. */
export async function getUserMatchFeedback(userId) {
    const col = await collection();
    const since = new Date(Date.now() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return col
        .find({ userId: new ObjectId(userId), createdAt: { $gte: since }, action: { $ne: 'impression' } }, { projection: { _id: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .limit(2000)
        .toArray();
}

// Jobs several different users reported as fake/expired are hidden for
// everyone. Cached briefly: it is read on every match computation.
let flaggedCache = { at: 0, ids: new Set() };
const FLAGGED_TTL_MS = 10 * 60 * 1000;

export async function getGloballyFlaggedJobIds() {
    if (Date.now() - flaggedCache.at < FLAGGED_TTL_MS) return flaggedCache.ids;
    const col = await collection();
    const rows = await col.aggregate([
        { $match: { action: 'dismiss', reason: 'not_real' } },
        { $group: { _id: '$jobId', users: { $addToSet: '$userId' } } },
        { $match: { [`users.${GLOBAL_FLAG_MIN_USERS - 1}`]: { $exists: true } } },
        { $project: { _id: 1 } },
    ]).toArray();
    flaggedCache = { at: Date.now(), ids: new Set(rows.map(r => r._id)) };
    return flaggedCache.ids;
}
