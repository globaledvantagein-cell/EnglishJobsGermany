// ─── Full-text search index ────────────────────────────────────────────────────
//
// Sits alongside the inverted facet indexes in jobsCache/remoteJobsCache — it
// does NOT replace them. Facets stay Set intersections; only the free-text
// `search` predicate moves here.
//
// Why: search was `new RegExp(userInput, 'i')` tested against JobTitle, Company
// and Location. That is exact-substring only — "recat" finds nothing when the
// user meant "react", "JS" never matches "JavaScript", and every query is an
// O(n) scan over the surviving result set. MiniSearch gives prefix matching,
// typo tolerance and per-field boosting off a prebuilt inverted index.
//
// Documents are keyed by their position in the cache's jobsArray (_cacheIndex),
// so a search result set intersects directly with the facet pipeline's index
// Sets. That coupling is the reason add/remove must be wired into
// upsertJob()/evictJob() — a stale index would map to whatever job later
// occupies that slot.

import MiniSearch from 'minisearch';

// ─── Synonyms ──────────────────────────────────────────────────────────────────
//
// Expanded at QUERY time rather than baked into the index: the index stays
// exactly what the job says, and editing this map takes effect immediately
// without a rebuild. Values are space-separated alternatives — MiniSearch ORs
// the terms, so "js" matching a title containing "javascript" costs nothing.
const SYNONYMS = new Map([
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['py', 'python'],
    ['ml', 'machine learning'],
    ['ai', 'artificial intelligence'],
    ['fe', 'frontend'],
    ['be', 'backend'],
    ['devops', 'devops site reliability sre'],
    ['sre', 'site reliability devops sre'],
    ['qa', 'quality assurance testing'],
    ['ux', 'user experience design'],
    ['ui', 'user interface design'],
    ['pm', 'product manager product management'],
    ['hr', 'human resources people'],
    ['dx', 'developer experience'],
    ['dba', 'database administrator'],
    ['swe', 'software engineer'],
    ['ds', 'data science data scientist'],
    ['de', 'data engineer data engineering'],
    ['infra', 'infrastructure platform'],
    ['k8s', 'kubernetes'],
    ['react', 'react reactjs react.js'],
    ['node', 'node nodejs node.js'],
    ['vue', 'vue vuejs vue.js'],
    ['angular', 'angular angularjs'],
    ['aws', 'amazon web services aws'],
    ['gcp', 'google cloud platform gcp'],
    ['azure', 'microsoft azure'],
]);

/**
 * Replace known abbreviations with their expanded forms.
 * Unknown words pass through untouched.
 *
 * @param {string} query
 * @returns {string}
 */
export function expandSynonyms(query) {
    if (!query) return '';
    return String(query)
        .trim()
        .split(/\s+/)
        .map(word => SYNONYMS.get(word.toLowerCase()) ?? word)
        .join(' ');
}

// ─── Index configuration ───────────────────────────────────────────────────────

// A job title is the strongest signal, then the employer; Location matches last
// so "Berlin" doesn't outrank a genuine title hit.
//
// fuzzy is 0.3, NOT the 0.2 this was first written with. 0.2 allows an edit
// distance of 1 on a 5-character term, and a transposition costs 2 — so the
// motivating examples both returned nothing. Measured over 5,554 live jobs:
//
//            recat   desgin   design   engineer
//   fuzzy 0.2    0        0      213       2204
//   fuzzy 0.3   36       98      214       2204
//   fuzzy 0.4   36       98      214       2204
//
// 0.3 fixes the typos at a cost of one extra hit on "design" and none on
// "engineer"; 0.4 buys nothing further.
const SEARCH_OPTIONS = {
    prefix: true,
    fuzzy: 0.3,
    boost: { JobTitle: 3, Company: 2, Category: 1.5, Location: 1 },
};

function createIndex() {
    return new MiniSearch({
        fields: ['JobTitle', 'Company', 'Location', 'Category'],
        storeFields: ['JobTitle'],   // autoSuggest + debugging
        idField: '_cacheIndex',
        searchOptions: SEARCH_OPTIONS,
    });
}

/**
 * MiniSearch indexes plain documents, so project the job down to the searchable
 * fields plus its cache position. Missing fields become '' — MiniSearch throws
 * on undefined field access in some tokenizer paths.
 */
function toDocument(job, cacheIndex) {
    return {
        _cacheIndex: cacheIndex,
        JobTitle: job?.JobTitle || '',
        Company: job?.Company || '',
        Location: job?.Location || '',
        Category: job?.Category || '',
    };
}

/**
 * Builds one search-index instance plus the five operations the caches need.
 * Two independent instances exist (main + remote) with identical behaviour.
 */
function buildSearchIndex(label) {
    let index = createIndex();

    return {
        /** Full rebuild from an array of jobs. Array position IS the doc id. */
        init(jobs) {
            index = createIndex();
            const docs = [];
            for (let i = 0; i < jobs.length; i++) {
                const job = jobs[i];
                if (job === null || job === undefined) continue; // tombstone
                docs.push(toDocument(job, i));
            }
            index.addAll(docs);
            console.log(`[searchIndex] ${label}: indexed ${docs.length} jobs`);
        },

        /** Drop everything — used at the start of a reload. */
        reset() {
            index = createIndex();
        },

        /**
         * Add or update one job at `cacheIndex`. Uses replace() when the slot is
         * already indexed; add() on an existing id throws in MiniSearch.
         */
        add(job, cacheIndex) {
            if (cacheIndex === undefined || cacheIndex === null) return;
            const doc = toDocument(job, cacheIndex);
            try {
                if (index.has(cacheIndex)) index.replace(doc);
                else index.add(doc);
            } catch (error) {
                console.warn(`[searchIndex] ${label}: add failed for #${cacheIndex}: ${error.message}`);
            }
        },

        /** Remove the job occupying `cacheIndex`. */
        remove(cacheIndex) {
            if (cacheIndex === undefined || cacheIndex === null) return;
            try {
                // discard() removes by id without needing the original document,
                // which evictJob() no longer has in a usable form.
                if (index.has(cacheIndex)) index.discard(cacheIndex);
            } catch (error) {
                console.warn(`[searchIndex] ${label}: remove failed for #${cacheIndex}: ${error.message}`);
            }
        },

        /**
         * @param {string} query raw user input
         * @returns {Set<number>} matching cache indexes, for O(1) intersection
         */
        search(query) {
            if (!query || !query.trim()) return new Set();
            const expanded = expandSynonyms(query);
            try {
                const results = index.search(expanded, SEARCH_OPTIONS);
                return new Set(results.map(r => r.id));
            } catch (error) {
                console.warn(`[searchIndex] ${label}: search failed: ${error.message}`);
                return new Set();
            }
        },

        /**
         * Completions for the ghost-text autocomplete.
         *
         * Deliberately NOT fuzzy: ghost text renders the tail of a suggestion
         * behind what the user typed, so a suggestion that is not a prefix of
         * the input is unusable. Fuzzy also produced pure noise here — "rea"
         * returned "sea", "eng" returned "lng". Prefix-only gives
         * "ready"/"real"/"reactor".
         *
         * Suggestions that do not extend the raw input are filtered out for the
         * same reason, so the caller can use result[0] directly.
         *
         * @returns {string[]} up to 5 completion strings
         */
        suggest(query) {
            const raw = (query || '').trim();
            if (!raw) return [];
            const lower = raw.toLowerCase();
            try {
                const seen = new Set();
                const out = [];
                for (const { suggestion } of index.autoSuggest(raw, { prefix: true })) {
                    // autoSuggest pairs terms, yielding things like "senior men"
                    // or "dataiku data". Ghost text wants a single completed
                    // word, so keep only the token that extends what was typed.
                    const token = suggestion.split(/\s+/)[0];
                    const key = token.toLowerCase();
                    if (!key.startsWith(lower) || key === lower) continue;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push(token);
                    if (out.length === 5) break;
                }
                return out;
            } catch (error) {
                console.warn(`[searchIndex] ${label}: autoSuggest failed: ${error.message}`);
                return [];
            }
        },

        size() {
            return index.documentCount;
        },
    };
}

// ─── Main jobs ─────────────────────────────────────────────────────────────────

const mainIndex = buildSearchIndex('jobs');

export function initSearchIndex(jobs) { mainIndex.init(jobs); }
export function resetSearchIndex() { mainIndex.reset(); }
export function addToSearchIndex(job, cacheIndex) { mainIndex.add(job, cacheIndex); }
export function removeFromSearchIndex(cacheIndex) { mainIndex.remove(cacheIndex); }
export function searchJobs(query) { return mainIndex.search(query); }
export function autoSuggest(query) { return mainIndex.suggest(query); }
export function getSearchIndexSize() { return mainIndex.size(); }

// ─── Remote jobs ───────────────────────────────────────────────────────────────
//
// A completely separate instance over the remoteJobs cache — separate documents,
// separate ids. Nothing is shared with the main index.

const remoteIndex = buildSearchIndex('remoteJobs');

export function initRemoteSearchIndex(jobs) { remoteIndex.init(jobs); }
export function resetRemoteSearchIndex() { remoteIndex.reset(); }
export function addToRemoteSearchIndex(job, cacheIndex) { remoteIndex.add(job, cacheIndex); }
export function removeFromRemoteSearchIndex(cacheIndex) { remoteIndex.remove(cacheIndex); }
export function searchRemoteJobs(query) { return remoteIndex.search(query); }
export function autoSuggestRemote(query) { return remoteIndex.suggest(query); }
export function getRemoteSearchIndexSize() { return remoteIndex.size(); }
