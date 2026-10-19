/**
 * Harvest real company names and board slugs for discover-german-companies.js.
 *
 *   node src/scripts/harvest-company-candidates.js                  # every source
 *   node src/scripts/harvest-company-candidates.js --skip=remotive  # comma list
 *   node src/scripts/harvest-company-candidates.js --remotive-pages=4000
 *
 * Discovery probes candidate slugs against each ATS and keeps the boards with
 * jobs located in Germany. Its yield is bounded by its candidates: guessed
 * names and wordlists hit a few percent at best. These sources supply names of
 * companies that are demonstrably hiring right now:
 *
 *   arbeitnow        free API (~6k DE jobs). Its company slug is often the ATS
 *                    board slug itself (enpal, celonis, elevenlabs) → probed
 *                    verbatim, the display name → slug variants.
 *   arbeitsagentur   Federal Employment Agency search over the same English
 *                    role titles the arbeitsagenturConfig source uses → employer
 *                    names → slug variants.
 *   smartrecruiters  the vendor's own cross-company search (found by capturing
 *                    jobs.smartrecruiters.com with REA): /sr-jobs/search returns
 *                    the newest 100 matches per keyword with NO paging (the web
 *                    client never sends an offset), so it is queried with many
 *                    German city/role keywords. Identifiers are exact board IDs
 *                    → platform-specific, highest yield.
 *   remotive         employer names (schema.org hiringOrganization) from the
 *                    newest job pages in remotive.com's public sitemap. Names
 *                    only — no Remotive job content is stored. Paced politely;
 *                    robots.txt allows /remote/jobs/.
 *   commoncrawl      board slugs seen in the Common Crawl URL index for
 *                    subdomain/path ATSes. The index often answers 502/504, so
 *                    it is retried and simply skipped when down.
 *
 * Output: german-company-candidates.extra.json, MERGED with what is already
 * there (`all` = probed on every platform; a platform key = confirmed slugs for
 * that platform). Slow sources are cached in harvest-cache.json.
 *
 * Then run:  node src/scripts/discover-german-companies.js
 *            node src/scripts/add-german-companies.js --dry-run
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { slugVariants } from './slug-variants.js';
import { ARBEITSAGENTUR_QUERIES } from '../company-configs/arbeitsagenturConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, 'german-company-candidates.extra.json');
const CACHE_FILE = path.join(__dirname, 'harvest-cache.json');

const args = process.argv.slice(2);
const SKIP = new Set((args.find(a => a.startsWith('--skip='))?.split('=')[1] || '').split(',').filter(Boolean));
const REMOTIVE_PAGES = Number(args.find(a => a.startsWith('--remotive-pages='))?.split('=')[1] || 2000);

const UA = 'Mozilla/5.0 (compatible; EJG-Discovery/2.0)';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getText(url, { headers = {}, timeoutMs = 30000, retries = 0 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
            if (res.ok) return await res.text();
        } catch { /* retried below */ }
        if (attempt < retries) await sleep(4000 * (attempt + 1));
    }
    return null;
}

async function getJson(url, options) {
    const text = await getText(url, options);
    try { return text ? JSON.parse(text) : null; } catch { return null; }
}

function loadCache() {
    try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}

// ── Sources ─────────────────────────────────────────────────────────────────
// Each returns { names: string[], slugs: string[] (all platforms), byAts: {ats: string[]} }.

async function fromArbeitnow() {
    const names = new Set();
    const slugs = new Set();
    for (let page = 1; page <= 60; page++) {
        const data = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
        const jobs = data?.data || [];
        for (const job of jobs) {
            if (job.company_name) names.add(job.company_name);
            const slug = job.url?.match(/\/companies\/([^/]+)\//)?.[1];
            if (slug) slugs.add(slug.toLowerCase());
        }
        if (jobs.length === 0) break;
        await sleep(1000);
    }
    return { names: [...names], slugs: [...slugs], byAts: {} };
}

async function fromArbeitsagentur() {
    const names = new Set();
    for (const query of ARBEITSAGENTUR_QUERIES) {
        for (let page = 1; page <= 10; page++) {
            const url = new URL('https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs');
            url.searchParams.set('was', query);
            url.searchParams.set('size', '100');
            url.searchParams.set('page', String(page));
            const data = await getJson(url, { headers: { 'X-API-Key': 'jobboerse-jobsuche' } });
            const jobs = data?.ergebnisliste || [];
            for (const job of jobs) if (job.firma) names.add(job.firma);
            await sleep(400);
            if (jobs.length < 100) break;
        }
    }
    return { names: [...names], slugs: [], byAts: {} };
}

const SR_CITIES = [
    'Germany', 'Deutschland', 'Berlin', 'München', 'Munich', 'Hamburg', 'Frankfurt', 'Köln', 'Cologne',
    'Düsseldorf', 'Stuttgart', 'Leipzig', 'Dresden', 'Hannover', 'Nürnberg', 'Bremen', 'Essen',
    'Dortmund', 'Bonn', 'Mannheim', 'Karlsruhe', 'Heidelberg', 'Darmstadt', 'Wiesbaden', 'Mainz',
    'Aachen', 'Münster', 'Augsburg', 'Freiburg', 'Regensburg', 'Ingolstadt', 'Wolfsburg', 'Potsdam',
    'Kiel', 'Erlangen', 'Ulm', 'Bielefeld', 'Bochum', 'Walldorf', 'Jena',
];
const SR_ROLES = ['Engineer', 'Developer', 'Manager', 'Sales', 'Marketing', 'Finance', 'Consultant', 'Analyst', 'Data', 'Product', 'Werkstudent', 'Praktikum'];

async function fromSmartRecruiters() {
    const ids = new Set();
    const keywords = [...SR_CITIES, ...SR_ROLES.map(role => `${role} Germany`), ...SR_ROLES.map(role => `${role} Berlin`), ...SR_ROLES.map(role => `${role} München`)];
    for (const keyword of keywords) {
        const url = new URL('https://jobs.smartrecruiters.com/sr-jobs/search');
        url.searchParams.set('limit', '100');
        url.searchParams.set('keyword', keyword);
        const data = await getJson(url, { headers: { Accept: 'application/json' } });
        for (const job of data?.content || []) {
            // Only boards with a posting located in Germany; discovery re-checks anyway.
            if (job?.location?.country === 'de' && job?.company?.identifier) ids.add(job.company.identifier.toLowerCase());
        }
        await sleep(800);
    }
    return { names: [], slugs: [], byAts: { smartrecruiters: [...ids] } };
}

async function fromRemotive(cache) {
    const index = await getText('https://remotive.com/sitemap.xml');
    const maps = [...(index || '').matchAll(/<loc>([^<]*sitemap-job-postings[^<]*)<\/loc>/g)].map(m => m[1]);
    const urls = [];
    for (const map of maps) {
        const xml = await getText(map, { timeoutMs: 60000 });
        for (const m of (xml || '').matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1]);
        await sleep(2000);
    }
    // Newest first: the trailing number is Remotive's ascending posting id.
    const newest = urls
        .map(u => ({ u, id: Number(u.match(/-(\d+)$/)?.[1] || 0) }))
        .sort((a, b) => b.id - a.id)
        .slice(0, REMOTIVE_PAGES)
        .map(x => x.u);

    const done = new Set(cache.remotiveFetched || []);
    const names = new Set(cache.remotiveNames || []);
    let cursor = 0;
    const lane = async () => {
        while (cursor < newest.length) {
            const url = newest[cursor++];
            if (done.has(url)) continue;
            const html = await getText(url, { timeoutMs: 20000 });
            const name = html?.match(/"hiringOrganization"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]+)"/)?.[1];
            if (name) names.add(name.trim());
            done.add(url);
            await sleep(900);
        }
    };
    await Promise.all([lane(), lane()]);
    cache.remotiveFetched = [...done];
    cache.remotiveNames = [...names];
    return { names: [...names], slugs: [], byAts: {} };
}

const CC_INDEX = 'https://index.commoncrawl.org/CC-MAIN-2026-39-index';
const CC_TARGETS = {
    personio: [
        { q: 'url=*.jobs.personio.de&matchType=domain', slug: u => u.hostname.endsWith('.jobs.personio.de') ? u.hostname.split('.')[0] : null },
        { q: 'url=*.jobs.personio.com&matchType=domain', slug: u => u.hostname.endsWith('.jobs.personio.com') ? u.hostname.split('.')[0] : null },
    ],
    greenhouse: [{ q: 'url=job-boards.eu.greenhouse.io/*', slug: u => u.pathname.split('/')[1] }],
    recruitee: [{ q: 'url=*.recruitee.com&matchType=domain', slug: u => u.hostname.split('.').length === 3 ? u.hostname.split('.')[0] : null }],
    teamtailor: [{ q: 'url=*.teamtailor.com&matchType=domain', slug: u => u.hostname.split('.').length === 3 ? u.hostname.split('.')[0] : null }],
    smartrecruiters: [{ q: 'url=jobs.smartrecruiters.com/*', slug: u => u.pathname.split('/')[1] }],
};
const NOT_A_BOARD = new Set(['www', 'api', 'app', 'jobs', 'careers', 'static', 'cdn', 'help', 'support', 'blog', 'status', 'embed']);

async function fromCommonCrawl() {
    const byAts = {};
    for (const [ats, targets] of Object.entries(CC_TARGETS)) {
        const slugs = new Set();
        for (const target of targets) {
            const meta = await getJson(`${CC_INDEX}?${target.q}&output=json&showNumPages=true`, { timeoutMs: 120000, retries: 3 });
            const pages = Math.min(Number(meta?.pages || 0), 12);
            for (let page = 0; page < pages; page++) {
                const text = await getText(`${CC_INDEX}?${target.q}&output=json&fl=url&page=${page}`, { timeoutMs: 180000, retries: 3 });
                for (const line of (text || '').split('\n')) {
                    try {
                        const slug = decodeURIComponent(target.slug(new URL(JSON.parse(line).url)) || '').toLowerCase().trim();
                        if (slug && !NOT_A_BOARD.has(slug) && /^[a-z0-9][a-z0-9._-]{1,60}$/.test(slug)) slugs.add(slug);
                    } catch { /* not a URL line */ }
                }
                await sleep(1500);
            }
        }
        byAts[ats] = [...slugs];
        console.log(`[Harvest] commoncrawl/${ats}: ${slugs.size} slugs`);
    }
    return { names: [], slugs: [], byAts };
}

const SOURCES = {
    arbeitnow: fromArbeitnow,
    arbeitsagentur: fromArbeitsagentur,
    smartrecruiters: fromSmartRecruiters,
    remotive: fromRemotive,
    commoncrawl: fromCommonCrawl,
};

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const cache = loadCache();
    const existing = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : {};
    const all = new Set(existing.all || []);
    const byAts = Object.fromEntries(Object.entries(existing).filter(([k, v]) => k !== 'all' && Array.isArray(v)).map(([k, v]) => [k, new Set(v)]));
    const before = all.size + Object.values(byAts).reduce((n, s) => n + s.size, 0);

    for (const [name, harvest] of Object.entries(SOURCES)) {
        if (SKIP.has(name)) { console.log(`[Harvest] ${name}: skipped`); continue; }
        const t0 = Date.now();
        const result = await harvest(cache).catch(err => { console.warn(`[Harvest] ${name} failed: ${err.message}`); return null; });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
        if (!result) continue;

        const variants = new Set();
        for (const n of result.names) for (const v of slugVariants(n)) variants.add(v);
        for (const v of [...variants, ...result.slugs]) all.add(v);
        for (const [ats, list] of Object.entries(result.byAts)) {
            byAts[ats] = byAts[ats] || new Set();
            for (const slug of list) byAts[ats].add(slug);
        }
        const perAts = Object.entries(result.byAts).map(([ats, l]) => `${ats} ${l.length}`).join(', ');
        console.log(`[Harvest] ${name}: ${result.names.length} names → ${variants.size} variants, ${result.slugs.length} verbatim slugs${perAts ? `, confirmed: ${perAts}` : ''} (${Math.round((Date.now() - t0) / 1000)}s)`);
    }

    const out = { all: [...all].sort(), ...Object.fromEntries(Object.entries(byAts).map(([k, v]) => [k, [...v].sort()])) };
    fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1));
    const after = out.all.length + Object.entries(out).filter(([k]) => k !== 'all').reduce((n, [, v]) => n + v.length, 0);
    console.log(`\n[Harvest] ${OUT_FILE}: ${out.all.length} shared + ${after - out.all.length} platform-specific candidates (+${after - before} new)`);
    process.exit(0);
}

main().catch(err => { console.error('[Harvest] Fatal:', err); process.exit(1); });
