/**
 * Kill-switch registry — the single list of every feature that can be turned
 * off from /admin/kill-switches. See KILL_SWITCHES.md at the repo root.
 *
 * A switch is a permanent ON/OFF flag (LaunchDarkly calls these "kill switch"
 * or "circuit breaker" flags): ON by default, no targeting, flipped only in an
 * emergency. One switch drives both sides:
 *   - backend: `featureGuard` / `requireFeature` answer 503 FEATURE_DISABLED,
 *     and crons check `isFeatureEnabled` before running
 *   - frontend: `useFeature(key)` hides or pauses the UI
 *
 * Adding a feature = add an entry here, guard its routes, gate its UI.
 * Keys are camelCase and must never be renamed (they're the DB _id).
 *
 * `routes`: [method, regex tested against req.originalUrl's path]. '*' = any method.
 * `ui`:     what the frontend does while OFF (shown in the admin side panel).
 */
export const FEATURE_GROUPS = ['Matching', 'Accounts', 'Jobs', 'Content', 'Admin tools', 'Background jobs'];

export const FEATURE_REGISTRY = [
    // ── Matching ─────────────────────────────────────────────────────────
    {
        key: 'smartMatch', ui: 'SmartMatch page → paused notice', group: 'Matching', label: 'Smart Match',
        description: 'Resume → AI-ranked jobs (Gemini + embeddings). The most expensive feature.',
        routes: [['*', /^\/api\/jobs\/admin\/resume-match/]],
    },
    {
        key: 'todayMatches', ui: 'TodayMatches page → paused notice', group: 'Matching', label: "Today's Matches",
        description: 'Daily skill-based matches (no AI).',
        routes: [['*', /^\/api\/jobs\/skill-matches/]],
    },
    {
        key: 'resumeUpload', ui: 'Profile CV upload → error message', group: 'Matching', label: 'Resume upload & parsing',
        description: 'Uploading a CV to the profile (AI parse).',
        routes: [['POST', /^\/api\/auth\/upload-resume/]],
    },
    {
        key: 'matchFeedback', ui: '👍/👎 buttons send nothing', group: 'Matching', label: 'Match feedback (👍/👎)',
        description: 'Users rating matches; feeds the learning loop.',
        routes: [['*', /^\/api\/jobs\/match-feedback/]],
    },
    {
        key: 'semanticRerank', ui: 'none (server-side only)', group: 'Matching', label: 'Semantic re-rank (embeddings)',
        description: 'Meaning-based re-rank inside Smart Match. OFF → fit-engine order only.',
        routes: [],
    },
    {
        key: 'jobPreferences', ui: 'Preferences form → paused notice', group: 'Matching', label: 'Job preferences & skills',
        description: 'Editing job preferences and skills on the profile.',
        routes: [['PATCH', /^\/api\/auth\/(job-preferences|skills)/]],
    },

    // ── Accounts ─────────────────────────────────────────────────────────
    {
        key: 'googleLogin', ui: 'Google button hidden', group: 'Accounts', label: 'Google sign-in',
        description: 'Sign in / sign up with Google. Existing sessions keep working.',
        routes: [['POST', /^\/api\/auth\/google/]],
    },
    {
        key: 'emailSignup', ui: 'Job-alerts page → paused notice', group: 'Accounts', label: 'Email sign-up (talent pool)',
        description: 'New accounts via the email form.',
        routes: [['POST', /^\/api\/auth\/talent-pool/]],
    },
    {
        key: 'promoCodes', ui: 'Premium invite page → paused notice', group: 'Accounts', label: 'Promo codes & waitlist',
        description: 'Redeeming promo codes and joining the premium waitlist.',
        routes: [['POST', /^\/api\/auth\/(redeem-promo|join-waitlist)/]],
    },

    // ── Jobs ─────────────────────────────────────────────────────────────
    {
        key: 'savedJobs', ui: 'Bookmark buttons hidden', group: 'Jobs', label: 'Saved jobs',
        description: 'Bookmark button and the saved-jobs list.',
        routes: [['*', /^\/api\/jobs\/(saved|saved-ids|[^/]+\/save)$/]],
    },
    {
        key: 'applyTracking', ui: 'Apply link works; "Did you apply?" toast off', group: 'Jobs', label: 'Apply tracking',
        description: '"Did you apply?" prompt and the applied-jobs list. Apply links still work.',
        routes: [['*', /^\/api\/jobs\/([^/]+\/(apply-click|confirm-applied)|applied|applied-ids)$/]],
    },
    {
        key: 'remoteJobs', ui: 'Remote list + detail → paused notice', group: 'Jobs', label: 'Remote jobs',
        description: 'The whole /remote-jobs vertical.',
        routes: [['*', /^\/api\/remote-jobs/]],
    },
    {
        key: 'searchAutocomplete', ui: 'Search box shows no suggestions', group: 'Jobs', label: 'Search autocomplete',
        description: 'Type-ahead suggestions in the job search boxes.',
        routes: [['GET', /^\/api\/(jobs|remote-jobs)\/autocomplete/]],
    },

    // ── Content ──────────────────────────────────────────────────────────
    {
        key: 'feedbackWidget', ui: 'Floating button hidden', group: 'Content', label: 'Feedback widget',
        description: 'Floating feedback button on every page.',
        routes: [['POST', /^\/api\/feedback\/?$/]],
    },

    // ── Admin tools ──────────────────────────────────────────────────────
    {
        key: 'adminAiReanalysis', ui: 'Admin re-analyse buttons return an error', group: 'Admin tools', label: 'AI re-analysis',
        description: 'Admin "re-analyse" jobs with Gemini (bulk and single). Burns AI credit.',
        routes: [['POST', /^\/api\/jobs\/(admin\/reanalyze|[^/]+\/analyze$)/]],
    },

    {
        key: 'adminMaintenance', ui: 'Data maintenance buttons on /admin/health are hidden', group: 'Admin tools', label: 'Data maintenance buttons',
        description: 'Click-only repairs: "Fill missing AI data" (Gemma) and "Recompute filters" (no AI). Never scheduled.',
        routes: [['*', /^\/api\/admin\/maintenance/]],
    },

    // ── Background jobs (crons) ──────────────────────────────────────────
    { key: 'cronScraper', group: 'Background jobs', label: 'Daily scraper (06:00)', description: 'Scrapes ATS boards and runs AI analysis.', routes: [] },
    {
        key: 'cronValidator', group: 'Background jobs', label: 'Link validator (every 6h)',
        description: 'Re-checks every live job against its ATS and expires dead links. Also stops the admin "Check links now" button.',
        ui: 'Check links now button on /admin/health is hidden',
        routes: [['*', /^\/api\/admin\/validator/]],
    },
    {
        key: 'sourceArbeitsagentur', group: 'Background jobs', label: 'Source: Bundesagentur für Arbeit',
        description: 'Daily scraper queries the Federal Employment Agency job search (English role titles) and runs every posting through the AI.',
        ui: 'none (no new Arbeitsagentur jobs; existing ones stay live)',
        routes: [],
    },
    {
        key: 'sourceJoin', group: 'Background jobs', label: 'Source: JOIN',
        description: 'Daily scraper reads up to 3,000 JOIN company boards (from join.com\'s public companies sitemap) and their German jobs.',
        ui: 'none (no new JOIN jobs; existing ones stay live)',
        routes: [],
    },
    {
        key: 'sourceSoftgarden', group: 'Background jobs', label: 'Source: softgarden',
        description: 'Daily scraper reads softgarden career boards (German ATS, HTML + JobPosting JSON-LD).',
        ui: 'none (no new softgarden jobs; existing ones stay live)',
        routes: [],
    },
    { key: 'cronWeeklyDigest', group: 'Background jobs', label: 'Weekly email digest', description: 'Monday job-alert emails.', routes: [] },
    { key: 'cronWeeklyReset', group: 'Background jobs', label: 'Weekly usage reset', description: 'Monday 00:00 reset of usage counters.', routes: [] },
    { key: 'activityTracking', group: 'Background jobs', label: 'User activity tracking', description: 'Records lastActiveAt + daily active users (1 write per user per day). Feeds Users & growth.', ui: 'none (analytics stop updating)', routes: [] },
    { key: 'healthMonitor', group: 'Background jobs', label: 'Health monitor (every 10 min)', description: 'Runs all health checks in the background and stores 14 days of history for /admin/health.', routes: [] },
    { key: 'embeddingWarmer', group: 'Background jobs', label: 'Embedding warmer', description: 'Embeds new jobs in the background for Smart Match (CPU/RAM).', routes: [] },
    { key: 'cronWhatsApp', group: 'Background jobs', label: 'WhatsApp channel posts', description: 'Twice-daily channel posts.', routes: [] },
];

export const FEATURE_KEYS = FEATURE_REGISTRY.map(f => f.key);
