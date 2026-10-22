import { connectToDb } from '../db/connection.js';

// ─── Expired-job cleanup ───────────────────────────────────────────────────────
//
// An expired job is never shown again, so it only needs to stay small:
//   - Its JobID keeps it in the scraper's "already seen" set, so a posting the
//     company leaves up for a few more days is not re-imported and re-analyzed.
//   - Title/company/location/URL keep the Applied Jobs history readable.
// Everything else (descriptions, HTML, parsed requirements) is dropped at the
// next sweep, and its Smart Match embedding is deleted.
//
// After RETENTION_DAYS the posting is long gone from its board too, so the
// stub itself is deleted. Applied Jobs already handles a job that no longer
// exists.
//
// Runs after each validator pass, so jobs expired by it are cleaned the same day.

const COLLECTIONS = ['jobs', 'remoteJobs'];
const HEAVY_FIELDS = ['Description', 'DescriptionHtml', 'descriptionPreview', 'parsedRequirements', 'Evidence', 'Tags'];
const RETENTION_DAYS = Number(process.env.EXPIRED_JOB_RETENTION_DAYS) || 90;

/**
 * @returns {Promise<{stripped:Object<string,number>, deleted:Object<string,number>, embeddingsDeleted:number}>}
 */
export async function pruneExpiredJobs() {
    const db = await connectToDb();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const unset = Object.fromEntries(HEAVY_FIELDS.map(field => [field, '']));
    const stripped = {};
    const deleted = {};

    for (const name of COLLECTIONS) {
        const collection = db.collection(name);
        const strip = await collection.updateMany(
            { Status: 'expired', $or: HEAVY_FIELDS.map(field => ({ [field]: { $exists: true } })) },
            { $unset: unset },
        );
        stripped[name] = strip.modifiedCount;
        const remove = await collection.deleteMany({ Status: 'expired', expiredAt: { $lt: cutoff } });
        deleted[name] = remove.deletedCount;
    }

    // Embeddings are keyed by JobID and only Smart Match reads them, which only
    // ever ranks active jobs. Any vector without an active job is dead weight;
    // a job that comes back active is simply re-embedded on demand.
    const activeIds = new Set();
    for (const name of COLLECTIONS) {
        const docs = await db.collection(name).find({ Status: 'active' }, { projection: { JobID: 1 } }).toArray();
        for (const doc of docs) activeIds.add(String(doc.JobID));
    }
    const embeddings = db.collection('jobEmbeddings');
    const embeddingIds = await embeddings.distinct('_id');
    const orphaned = embeddingIds.filter(id => !activeIds.has(String(id)));
    const embeddingsDeleted = orphaned.length
        ? (await embeddings.deleteMany({ _id: { $in: orphaned } })).deletedCount
        : 0;

    console.log(
        `[Prune] Expired jobs: emptied ${stripped.jobs} + ${stripped.remoteJobs} remote, ` +
        `deleted ${deleted.jobs} + ${deleted.remoteJobs} remote older than ${RETENTION_DAYS} days, ` +
        `${embeddingsDeleted} embeddings removed`
    );
    return { stripped, deleted, embeddingsDeleted };
}
