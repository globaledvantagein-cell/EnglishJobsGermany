/**
 * User activity + the admin "Users & growth" analytics.
 *
 * Activity is recorded at most once per user per UTC day (an in-RAM set
 * dedupes, so authenticated requests cost one Mongo write per user-day):
 *   - users.lastActiveAt                       → DAU/WAU/MAU, churn, "gone quiet"
 *   - userActivityDays { _id: 'YYYY-MM-DD:id' } → daily active series, retention
 *
 * Before this existed only lastLoginAt was stored (tokens last 7 days, so a
 * login is a weak activity signal). lastActive therefore falls back to
 * max(lastActiveAt, lastLoginAt, createdAt, linked visitor lastSeenAt) — the
 * visitor record is bumped on job views, so it's the best history we have.
 */
import { ObjectId } from 'mongodb';
import { connectToDb } from './connection.js';
import { isFeatureEnabled } from '../features/index.js';

const DAY_MS = 86_400_000;
const recordedToday = new Set();
let recordedDay = '';
let indexesReady = false;

const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

async function ensureIndexes(db) {
    if (indexesReady) return;
    indexesReady = true;
    await db.collection('userActivityDays').createIndex({ date: 1 }).catch(() => {});
}

/** Fire-and-forget from the auth middleware. Never throws. */
export function recordUserActivity(userId) {
    if (!userId || !ObjectId.isValid(userId) || !isFeatureEnabled('activityTracking')) return;
    const today = dayKey();
    if (today !== recordedDay) { recordedToday.clear(); recordedDay = today; }
    if (recordedToday.has(userId)) return;
    recordedToday.add(userId);

    (async () => {
        const db = await connectToDb();
        await ensureIndexes(db);
        const now = new Date();
        await Promise.all([
            db.collection('users').updateOne({ _id: new ObjectId(userId) }, { $set: { lastActiveAt: now } }),
            db.collection('userActivityDays').updateOne(
                { _id: `${today}:${userId}` },
                { $setOnInsert: { date: today, userId, createdAt: now } },
                { upsert: true },
            ),
        ]);
    })().catch(err => {
        recordedToday.delete(userId); // retry on the next request
        console.warn('[activity] record failed:', err.message);
    });
}

/**
 * Until 2026-10-18 the weekly-reset cron stamped lastSeenAt on EVERY visitor at
 * Monday 00:00 UTC. Those stamps aren't activity, so a lastSeenAt within a few
 * minutes of a Monday midnight is ignored.
 */
const isResetStamp = (date) => {
    const d = new Date(date);
    if (d.getUTCDay() !== 1) return false;
    return d.getUTCHours() * 60 + d.getUTCMinutes() < 10;
};

const lastActiveOf = (user, visitorSeenAt) => Math.max(
    user.lastActiveAt ? +new Date(user.lastActiveAt) : 0,
    user.lastLoginAt ? +new Date(user.lastLoginAt) : 0,
    user.createdAt ? +new Date(user.createdAt) : 0,
    visitorSeenAt && !isResetStamp(visitorSeenAt) ? +new Date(visitorSeenAt) : 0,
);

/** Monday 00:00 UTC of the week containing `ms`. */
const weekStart = (ms) => {
    const d = new Date(ms);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return +d;
};

/**
 * Everything the Users & growth tab shows, in one pass.
 * Admin accounts are excluded from every user metric.
 */
export async function getUserAnalytics({ days = 30 } = {}) {
    const db = await connectToDb();
    const now = Date.now();
    const since = (n) => now - n * DAY_MS;
    const sinceDate = new Date(since(days));
    const dates = Array.from({ length: days }, (_, i) => dayKey(new Date(since(days - 1 - i))));

    const [users, dailyDocs, activeDays, newVisitorsByDay, newVisitorsCount, appliedIds, visitorSeen, firstTracked] = await Promise.all([
        db.collection('users').find(
            { role: { $ne: 'admin' } },
            { projection: { name: 1, email: 1, createdAt: 1, lastLoginAt: 1, lastActiveAt: 1, googleId: 1, isWaitlist: 1, premiumUntil: 1, parsedProfile: { $cond: [{ $ifNull: ['$parsedProfile', false] }, true, false] } } },
        ).toArray(),
        db.collection('analytics').find({ date: { $in: dates } }).toArray(),
        db.collection('userActivityDays').aggregate([
            { $match: { date: { $in: dates } } },
            { $group: { _id: '$date', count: { $sum: 1 } } },
        ]).toArray(),
        db.collection('visitors').aggregate([
            { $match: { createdAt: { $gte: sinceDate } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        ]).toArray(),
        db.collection('visitors').countDocuments({ createdAt: { $gte: sinceDate } }),
        db.collection('applyClicks').distinct('visitorId', { visitorId: /^user_/ }),
        db.collection('visitors').aggregate([
            { $match: { linkedUserId: { $ne: null } } },
            { $project: { linkedUserId: 1, lastSeenAt: 1 } },
            { $group: { _id: { $toString: '$linkedUserId' }, seenAt: { $push: '$lastSeenAt' } } },
        ]).toArray(),
        db.collection('userActivityDays').find({}, { projection: { date: 1 } }).sort({ date: 1 }).limit(1).toArray(),
    ]);
    // Latest genuine (non-reset) sighting across all of a user's visitor docs.
    const seenByUser = new Map(visitorSeen.map(v => [
        v._id,
        v.seenAt.filter(at => at && !isResetStamp(at)).reduce((max, at) => (+new Date(at) > +max ? at : max), 0) || null,
    ]));

    const appliedUserIds = new Set(appliedIds.map(v => v.slice(5)));
    const rows = users.map(u => ({
        id: String(u._id),
        name: u.name || '—',
        email: u.email,
        createdAt: u.createdAt ? +new Date(u.createdAt) : 0,
        lastActive: lastActiveOf(u, seenByUser.get(String(u._id))),
        isPremium: Boolean(u.premiumUntil && +new Date(u.premiumUntil) > now),
        source: u.googleId ? 'google' : u.isWaitlist ? 'waitlist' : 'email',
        hasProfile: Boolean(u.parsedProfile),
        hasApplied: appliedUserIds.has(String(u._id)),
    }));

    const count = (fn) => rows.reduce((n, r) => n + (fn(r) ? 1 : 0), 0);
    const activeWithin = (n) => count(r => r.lastActive >= since(n));
    const createdBetween = (from, to) => count(r => r.createdAt >= since(from) && r.createdAt < since(to));

    const dau = activeWithin(1), wau = activeWithin(7), mau = activeWithin(30);
    const matureUsers = rows.filter(r => r.createdAt < since(30));
    const churned = matureUsers.filter(r => r.lastActive < since(30)).length;

    // ── Daily series ──
    const byDate = (list) => Object.fromEntries(list.map(x => [x._id, x.count]));
    const dailyByDate = Object.fromEntries(dailyDocs.map(d => [d.date, d]));
    const activeByDate = byDate(activeDays);
    const visitorsByDate = byDate(newVisitorsByDay);
    const signupsByDate = {};
    rows.forEach(r => { if (r.createdAt >= since(days)) { const k = dayKey(new Date(r.createdAt)); signupsByDate[k] = (signupsByDate[k] || 0) + 1; } });
    const field = (date, ...keys) => keys.reduce((n, k) => n + (Number(dailyByDate[date]?.[k]) || 0), 0);

    const series = {
        dates,
        signups: dates.map(d => signupsByDate[d] || 0),
        activeUsers: dates.map(d => activeByDate[d] || 0),
        newVisitors: dates.map(d => visitorsByDate[d] || 0),
        jobViews: dates.map(d => field(d, 'pageViews_jobs', 'pageViews_jobDetail')),
        remoteViews: dates.map(d => field(d, 'pageViews_remoteJobs', 'pageViews_remoteJobDetail')),
        applyClicks: dates.map(d => field(d, 'applyClicks_total')),
        smartMatchRuns: dates.map(d => field(d, 'smartMatch_runs')),
        todayMatchViews: dates.map(d => field(d, 'pageViews_todayMatches')),
        deletions: dates.map(d => field(d, 'accountDeletions')),
    };

    // ── Weekly signup cohorts (last 8 weeks, newest first) ──
    const thisWeek = weekStart(now);
    const cohorts = Array.from({ length: 8 }, (_, i) => {
        const start = thisWeek - i * 7 * DAY_MS;
        const members = rows.filter(r => r.createdAt >= start && r.createdAt < start + 7 * DAY_MS);
        const pct = (n) => (members.length ? n / members.length : null);
        const isMature = (days) => now - start >= days * DAY_MS;
        return {
            weekStart: new Date(start).toISOString(),
            size: members.length,
            // Came back at least a day after signing up (any later activity).
            returned: pct(members.filter(r => r.lastActive - r.createdAt >= DAY_MS).length),
            // Still active a week+ after signup — only meaningful once the cohort is 7+ days old.
            week1: isMature(7) ? pct(members.filter(r => r.lastActive - r.createdAt >= 7 * DAY_MS).length) : null,
            activeNow: pct(members.filter(r => r.lastActive >= since(7)).length),
            profile: pct(members.filter(r => r.hasProfile).length),
        };
    });

    // ── People we're losing: active before, quiet 14+ days, newest losses first ──
    const goneQuiet = rows
        .filter(r => r.lastActive < since(14) && r.lastActive - r.createdAt >= DAY_MS)
        .sort((a, b) => b.lastActive - a.lastActive)
        .slice(0, 25)
        .map(r => ({ ...r, createdAt: new Date(r.createdAt).toISOString(), lastActive: new Date(r.lastActive).toISOString() }));

    const signups30 = rows.filter(r => r.createdAt >= since(days));

    return {
        generatedAt: new Date(now).toISOString(),
        days,
        totals: {
            users: rows.length,
            premium: count(r => r.isPremium),
            new7: createdBetween(7, 0), newPrev7: createdBetween(14, 7),
            new30: createdBetween(30, 0), newPrev30: createdBetween(60, 30),
            dau, wau, mau,
            stickiness: mau ? dau / mau : null,
            churned, matureUsers: matureUsers.length,
            churnRate: matureUsers.length ? churned / matureUsers.length : null,
            atRisk: count(r => r.lastActive < since(14) && r.lastActive >= since(30)),
            deletions30: series.deletions.reduce((a, b) => a + b, 0),
            // Daily activity history starts the day tracking shipped.
            trackingSince: firstTracked[0]?.date ?? null,
        },
        sources: {
            google: count(r => r.source === 'google'),
            email: count(r => r.source === 'email'),
            waitlist: count(r => r.source === 'waitlist'),
        },
        funnel: [
            { key: 'visitors', label: 'New visitors', value: newVisitorsCount },
            { key: 'signups', label: 'Signed up', value: signups30.length },
            { key: 'profile', label: 'Added CV / profile', value: signups30.filter(r => r.hasProfile).length },
            { key: 'applied', label: 'Clicked apply', value: signups30.filter(r => r.hasApplied).length },
            { key: 'premium', label: 'Premium', value: signups30.filter(r => r.isPremium).length },
        ],
        series,
        cohorts,
        goneQuiet,
    };
}
