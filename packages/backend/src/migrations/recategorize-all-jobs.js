// ─── Recategorize every job (Gemini one-shot backfill) ─────────────────────────
//
// One-time backfill. Every job predating core/categorizer/ carries either a
// legacy 6-bucket slug ('software') or nothing at all; this walks both
// collections and rewrites Category with one of the 28 AI categories.
//
// DELIBERATELY NOT core/categorizer/. That module runs on Gemma, which is the
// right choice for the ongoing pipeline (huge daily quota, no competition with
// the scraper's Gemini budget) but wrong for a 13K-job backfill: Gemma 4 is a
// reasoning model and spends 35-100s on a batch of 15. Gemini Flash Lite answers
// the same prompt in 2-5s and, run 3-wide across the key pool, turns ~5 hours of
// sequential work into minutes. The ongoing pipeline stays on Gemma.
//
// The model is PINNED to gemini-3.5-flash-lite rather than cascaded — see MODEL
// below. This migration needs volume, not the top tier.
//
// Idempotent: re-running simply reclassifies, which is harmless.
//
//   node src/migrations/recategorize-all-jobs.js
//   node src/migrations/recategorize-all-jobs.js --collection=jobs
//   node src/migrations/recategorize-all-jobs.js --limit=100
//   node src/migrations/recategorize-all-jobs.js --dry-run

import dotenv from 'dotenv';

dotenv.config();

// Imported AFTER dotenv.config() — the key managers read their API keys from
// process.env at module load, and would find nothing if hoisted above it.
const { connectToDb } = await import('../db/connection.js');
const { CATEGORIES } = await import('../core/categorizer/index.js');
const { callGemini } = await import('../gemini/geminiClient.js');
const { runParallelWithKeys } = await import('../gemini/workerPool.js');

// Pinned, NOT cascaded. The cascade starts at gemini-3.7-flash, whose free-tier
// ceiling is 17 requests/key/day — it would burn the scraper's premium tiers on
// work that does not need them and then step down anyway. Title classification
// is trivial: the earlier run showed 3.5-flash-lite matching 3.7-flash on the
// hard hybrid titles. At 480 RPD x 3 keys this model alone covers the whole
// backfill (~900 batches).
const MODEL = 'gemini-3.5-flash-lite';

// Same batch size as core/categorizer/. Gemini has no trouble at 15 (Gemma's
// ceiling), and matching it keeps the two paths comparable.
const CHUNK = 15;

// Retry size when a batch fails — isolates the one bad title instead of
// discarding all 15. Mirrors SUB_BATCH_SIZE in the categorizer.
const SUB_CHUNK = 5;

const CATEGORY_SET = new Set(CATEGORIES);
const FALLBACK_CATEGORY = 'Other / General Business';

// Mirrors SYSTEM_PROMPT in core/categorizer/index.js, which does not export it.
// Kept character-identical so both paths classify the same way.
const SYSTEM_PROMPT = `You are a job title classifier. Classify each job title into EXACTLY ONE of these 28 categories:

${CATEGORIES.map(c => `- ${c}`).join('\n')}

RULES:
- Use ONLY the category names listed above, copied character-for-character.
- Judge from the title alone. Do not invent categories.
- "Domain Specialist" is for roles requiring deep industry expertise that fits no other bucket (e.g. actuary, geologist, flight instructor).
- "Other / Open Application" is for speculative/unsolicited postings ("Open Application", "Initiativbewerbung", "Can't find your role?").
- "Other / General Business" is the last resort when nothing else fits.

Return ONLY a JSON array, no markdown fences, no preamble:
[{"id": 1, "category": "Software Engineering"}, {"id": 2, "category": "Sales"}]

Return one object per input title, using the id number given.`;

// ─── Flags ─────────────────────────────────────────────────────────────────────

function parseFlags(argv) {
    const flags = { collection: null, limit: null, dryRun: false };
    for (const arg of argv.slice(2)) {
        if (arg === '--dry-run') flags.dryRun = true;
        else if (arg.startsWith('--collection=')) flags.collection = arg.slice('--collection='.length);
        else if (arg.startsWith('--limit=')) flags.limit = Number(arg.slice('--limit='.length)) || null;
    }
    return flags;
}

const FLAGS = parseFlags(process.argv);

// ─── Formatting helpers ────────────────────────────────────────────────────────

function formatDuration(ms) {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

/** Remaining time projected from the average rate achieved so far. */
function formatEta(startedAt, completed, total) {
    if (completed === 0) return 'estimating…';
    const elapsed = Date.now() - startedAt;
    const remaining = (elapsed / completed) * (total - completed);
    return formatDuration(remaining);
}

function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

// ─── Classification ────────────────────────────────────────────────────────────

/** Tolerant parse: strip fences, try JSON, else regex the array out. */
function parseJsonArray(raw) {
    if (!raw || typeof raw !== 'string') throw new Error('empty response');
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }

    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed;
    }
    throw new Error('response was not a JSON array');
}

/**
 * Constrain a model answer to the 28 allowed values. Case/whitespace drift is
 * tolerated; anything genuinely off-list becomes the fallback rather than
 * writing a one-off value the frontend cannot filter on.
 */
function normalizeCategory(value) {
    if (typeof value !== 'string') return FALLBACK_CATEGORY;
    const trimmed = value.trim();
    if (CATEGORY_SET.has(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase();
    return CATEGORIES.find(c => c.toLowerCase() === lower) || FALLBACK_CATEGORY;
}

/**
 * Classify one group of jobs and persist the results.
 * Throws on an API or parse failure so the caller can decide to split.
 *
 * @returns {Promise<number>} how many jobs were written
 */
async function classifyAndWrite(group, collectionName, db) {
    // The model echoes back a 1-based list index rather than an ObjectId — ids
    // are long, cost tokens, and models routinely corrupt them.
    const userMessage = group
        .map((job, i) => `${i + 1}. ${String(job.JobTitle || '').slice(0, 200)}`)
        .join('\n');

    // callGemini (not the cascade) returns the response text directly.
    const content = await callGemini({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemInstruction: SYSTEM_PROMPT,
        label: `categorize ${group.length}`,
        generationConfig: { temperature: 0 },
    });

    const rows = parseJsonArray(content);
    const operations = [];

    for (const row of rows) {
        const index = Number(row?.id) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= group.length) continue; // hallucinated id
        const job = group[index];
        if (!job?._id) continue;
        operations.push({
            updateOne: {
                filter: { _id: job._id },
                update: { $set: { Category: normalizeCategory(row.category) } },
            },
        });
    }

    if (operations.length === 0) return 0;
    await db.collection(collectionName).bulkWrite(operations, { ordered: false });
    return operations.length;
}

/**
 * Classify one batch, splitting into sub-batches on failure.
 * Never throws — a batch that cannot be salvaged reports 0.
 */
async function processBatch(batch, collectionName, db, stats) {
    try {
        const written = await classifyAndWrite(batch, collectionName, db);
        stats.calls++;
        return written;
    } catch (error) {
        stats.calls++;
        console.warn(`[Migration]   batch of ${batch.length} failed (${error.message}), splitting into ${SUB_CHUNK}s`);

        let written = 0;
        for (const sub of chunk(batch, SUB_CHUNK)) {
            try {
                written += await classifyAndWrite(sub, collectionName, db);
                stats.calls++;
            } catch (subError) {
                stats.calls++;
                console.warn(`[Migration]   sub-batch of ${sub.length} failed: ${subError.message}. ${sub.length} jobs skipped.`);
            }
        }
        return written;
    }
}

// ─── One phase ─────────────────────────────────────────────────────────────────

async function runPhase(db, collectionName, label, query, phaseNumber) {
    // Minimal projection: the classifier only reads JobTitle. Pulling
    // Description here would move hundreds of MB for no reason.
    let cursor = db.collection(collectionName)
        .find(query, { projection: { _id: 1, JobID: 1, JobTitle: 1, Company: 1, Category: 1 } });
    if (FLAGS.limit) cursor = cursor.limit(FLAGS.limit);

    const jobs = await cursor.toArray();
    const total = jobs.length;

    if (total === 0) {
        console.log(`[Migration] Phase ${phaseNumber}: ${label} — nothing to do\n`);
        return { total: 0, success: 0, calls: 0 };
    }

    const batches = chunk(jobs, CHUNK);
    console.log(`[Migration] Phase ${phaseNumber}: ${label} — ${total} jobs in ${batches.length} batches of ${CHUNK}`);

    if (FLAGS.dryRun) {
        for (let b = 0; b < batches.length; b++) {
            const titles = batches[b].map(j => j.JobTitle);
            console.log(`[Migration]   [dry run] batch ${b + 1}/${batches.length} would send ${titles.length} titles:`);
            for (const title of titles.slice(0, 3)) console.log(`[Migration]     - ${String(title).slice(0, 70)}`);
            if (titles.length > 3) console.log(`[Migration]     … and ${titles.length - 3} more`);
        }
        console.log(`[Migration] Phase ${phaseNumber}: ${label} — [dry run] ${batches.length} Gemini calls skipped\n`);
        return { total, success: 0, calls: 0 };
    }

    const startedAt = Date.now();
    const stats = { calls: 0 };
    let completed = 0;
    let success = 0;

    // Batches run concurrently, one slot per live Gemini key. Progress is
    // reported as each finishes, so the order of these lines is completion
    // order rather than batch order — the counters stay monotonic regardless.
    await runParallelWithKeys(batches, async (batch) => {
        const written = await processBatch(batch, collectionName, db, stats);

        success += written;
        completed += batch.length;
        console.log(
            `[Migration] Phase ${phaseNumber}: ${label} — ${completed}/${total} categorized ` +
            `(${success} written, elapsed ${formatDuration(Date.now() - startedAt)}, ETA ${formatEta(startedAt, completed, total)})`
        );
        return written;
    });

    console.log(
        `[Migration] Phase ${phaseNumber}: ${label} — done. ` +
        `${success}/${total} categorized in ${formatDuration(Date.now() - startedAt)} across ${stats.calls} Gemini calls\n`
    );

    return { total, success, calls: stats.calls };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function run() {
    console.log('🚀 Recategorizing all jobs (Gemini Flash Lite, parallel)');
    console.log(`   model: ${MODEL} (pinned, no cascade)`);
    console.log(`   categories: ${CATEGORIES.length} | batch size: ${CHUNK} | split-retry: ${SUB_CHUNK}`);
    if (FLAGS.dryRun) console.log('   DRY RUN — no Gemini calls, no writes');
    if (FLAGS.limit) console.log(`   --limit=${FLAGS.limit} (per phase)`);
    if (FLAGS.collection) console.log(`   --collection=${FLAGS.collection}`);
    console.log('');

    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not defined in environment variables');

    const geminiKeys = [
        process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
    ].filter(Boolean);
    if (!FLAGS.dryRun && geminiKeys.length === 0) {
        throw new Error('No GEMINI_API_KEY_1.._3 set — this migration runs on Gemini');
    }
    console.log(`[Migration] ${geminiKeys.length} Gemini key(s) configured — up to ${geminiKeys.length} batches in flight`);

    // This script reads AND writes through connectToDb(). Where remoteJobs lives
    // on its own cluster, phase 2 would target the wrong database entirely.
    if (process.env.REMOTE_MONGO_URI && process.env.REMOTE_MONGO_URI !== process.env.MONGO_URI) {
        console.warn(
            '[Migration] ⚠️  REMOTE_MONGO_URI differs from MONGO_URI — phase 2 would read and ' +
            'write the PRIMARY cluster, not the remote one. Skipping phase 2; run it where the URIs match.'
        );
        if (FLAGS.collection === 'remoteJobs') {
            throw new Error('Refusing to run phase 2 against a split-cluster configuration');
        }
        FLAGS.collection = 'jobs';
    }

    const db = await connectToDb();
    const startedAt = Date.now();

    const wanted = name => !FLAGS.collection || FLAGS.collection === name;
    const collections = (await db.listCollections().toArray()).map(c => c.name);

    let main = { total: 0, success: 0, calls: 0 };
    let remote = { total: 0, success: 0, calls: 0 };

    if (wanted('jobs')) {
        main = await runPhase(
            db, 'jobs', 'Main jobs',
            { Status: { $in: ['active', 'pending_review'] }, JobTitle: { $exists: true, $ne: null } },
            1,
        );
    }

    if (wanted('remoteJobs')) {
        if (!collections.includes('remoteJobs')) {
            console.log('[Migration] Phase 2: remoteJobs collection does not exist — skipping\n');
        } else {
            remote = await runPhase(
                db, 'remoteJobs', 'Remote jobs',
                { JobTitle: { $exists: true, $ne: null } },
                2,
            );
        }
    }

    console.log(
        `[Migration] Complete. Main: ${main.success} jobs, Remote: ${remote.success} jobs. ` +
        `Total Gemini calls: ${main.calls + remote.calls}`
    );
    console.log(`[Migration] Wall time: ${formatDuration(Date.now() - startedAt)}`);

    const missed = (main.total - main.success) + (remote.total - remote.success);
    if (!FLAGS.dryRun && missed > 0) {
        console.warn(
            `[Migration] ⚠️  ${missed} job(s) were not categorized (failed batches). ` +
            'Re-run this script, or let categorizeUncategorized() pick them up.'
        );
    }
}

run()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    });
