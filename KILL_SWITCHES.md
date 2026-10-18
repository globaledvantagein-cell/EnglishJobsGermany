# KILL SWITCHES — mandatory pattern for every feature

**Rule for every chat or AI working on this repo:** every new user-facing
feature, API route group or background job MUST get a kill switch, wired on
both the backend and the frontend, before it is called done. One switch
stops the feature everywhere. Only admins can flip it, at `/admin/kill-switches`.

## Why

If a feature breaks in production, the admin turns it off with one click
instead of shipping a hotfix while users suffer. The rest of the site keeps
working. This pattern is LaunchDarkly's "kill switch / circuit breaker" flag
(a permanent boolean, ON by default, no targeting) and Martin Fowler's
"Ops toggle" (read at runtime, quick to flip).

Sources:
- https://launchdarkly.com/docs/home/flags/killswitch
- https://martinfowler.com/articles/feature-toggles.html
- https://docs.getunleash.io/reference/feature-toggles

## How it works

```
Mongo featureSwitches { _id: key, enabled, reason, updatedBy, updatedAt, history[20] }
        │  loaded into RAM at boot, re-read every 15 s (FAIL-OPEN: missing/DB error = ON)
        ▼
backend/src/features/
  featureRegistry.js   ← THE list of switches (key, group, label, description, routes)
  featureSwitches.js   ← isFeatureEnabled · featureGuard · requireFeature · runIfEnabled
        │
        ├─ app.use('/api', featureGuard)       matching routes → 503 { code: 'FEATURE_DISABLED', feature }
        ├─ cron: runIfEnabled('cronX', fn)     skipped while OFF
        ├─ GET  /api/features                  public { features: { key: bool } }
        └─ GET/PATCH /api/admin/features[/:key] admin only (verifyToken + verifyAdmin), audit trail
        ▼
frontend/src/hooks/useFeature.ts         polls /api/features every 60 s and on tab focus. FAIL-OPEN: ON during SSR
frontend/src/components/FeatureGate.tsx  withFeature() · <FeatureGate> · <FeaturePaused>
frontend/src/page-components/admin/AdminKillSwitches.tsx  admin page: dense table + side panel (same split view as Review queue)
```

**Fail-open is deliberate.** A broken switch store must never take the site
down. SSR always renders as ON, so SEO HTML and hydration never change.

## Adding a feature: checklist (all 4 steps)

1. **Register it** in `backend/src/features/featureRegistry.js`:
   ```js
   {
       key: 'jobAlertsV2',        // camelCase, never rename (it's the DB _id)
       group: 'Jobs',             // one of FEATURE_GROUPS (add a group if needed)
       label: 'Job alerts v2',
       description: 'What a user loses when this is OFF.',
       routes: [['*', /^\/api\/alerts-v2/]],   // [method, regex on the full /api path]
   },
   ```
   Also set `ui:` to one short line describing what the frontend does while
   OFF; it's shown in the admin side panel. For a background job, use
   `routes: []` and a `cron…` key.

2. **Guard the backend.**
   - Routes are covered automatically by `featureGuard` via `routes` above.
     For an unusual case, add `requireFeature('key')` to the route itself.
   - Crons: `cron.schedule(expr, runIfEnabled('cronKey', fn))`.
   - Inside code paths (e.g. an optional AI step): `if (!isFeatureEnabled('key')) …fallback`.

3. **Gate the frontend.** Add the key to the `FeatureKey` union in
   `hooks/useFeature.ts`, then pick one:
   - Whole page: `export default withFeature('key', Page, <FeaturePaused title="Job alerts" />);`
   - Widget or button: `export default withFeature('key', Widget);` (renders nothing while OFF)
   - Inline: `const on = useFeature('key');`
   - Event handler or API helper: `if (!isFeatureOn('key')) return;`

4. **Verify.** Flip it OFF at `/admin/kill-switches`. The API returns 503
   `FEATURE_DISABLED`, the UI hides or pauses, and the rest of the site works.
   Then flip it back ON.

## Don'ts

- Don't gate SEO content (job pages, city/category pages, career guide)
  in SSR. Switches are for interactive features.
- Don't kill core flows that have no fallback (job list, job detail, login
  sessions) without a `FeaturePaused` notice.
- Don't add targeting or percentages. These are on/off switches only.
- Don't read switches from the DB per request. Use `isFeatureEnabled` (RAM).
- Don't remove a switch while its feature still exists.

## Current switches (2026-10-18)

| Group | Key | Backend | Frontend |
|---|---|---|---|
| Matching | `smartMatch` | `/api/jobs/admin/resume-match` | `SmartMatch` page → paused |
| Matching | `todayMatches` | `/api/jobs/skill-matches` | `TodayMatches` page → paused |
| Matching | `resumeUpload` | `POST /api/auth/upload-resume` | `ParsedResumeProfile` upload → error message |
| Matching | `matchFeedback` | `/api/jobs/match-feedback*` | `matchFeedbackApi` no-ops |
| Matching | `semanticRerank` | `filterJobs` skips the embeddings re-rank and keeps fit order | — |
| Matching | `jobPreferences` | `PATCH /api/auth/job-preferences, skills` | `JobPreferencesForm` → paused |
| Accounts | `googleLogin` | `POST /api/auth/google` | `GoogleAuthButton` hidden |
| Accounts | `emailSignup` | `POST /api/auth/talent-pool` | `Alerts` page → paused |
| Accounts | `promoCodes` | `POST /api/auth/redeem-promo, join-waitlist` | `PremiumCheckout` → paused |
| Jobs | `savedJobs` | `/api/jobs/saved, saved-ids, :id/save` | `SaveJobButton` hidden |
| Jobs | `applyTracking` | `apply-click, confirm-applied, applied, applied-ids` | Apply link still works; tracking and toast are off |
| Jobs | `remoteJobs` | `/api/remote-jobs*` | `RemoteDashboard`, `RemoteJobSharePage` → paused |
| Jobs | `searchAutocomplete` | `GET /api/(jobs\|remote-jobs)/autocomplete` | `SearchWithGhost` shows no suggestions |
| Admin tools | `adminAiReanalysis` | `POST /api/jobs/admin/reanalyze*, /:id/analyze` | admin buttons get the 503 message |
| Content | `feedbackWidget` | `POST /api/feedback` | `FeedbackWidget` hidden |
| Background | `cronScraper` / `cronValidator` / `cronWeeklyDigest` / `cronWeeklyReset` / `cronWhatsApp` | cron skipped | — |
| Background | `embeddingWarmer` | `warmOnce` returns early | — |
| Background | `healthMonitor` | 10-minute health cron skipped; /admin/health history stops filling | — |
| Background | `activityTracking` | `recordUserActivity` no-ops, so Users & growth stops updating | — |

Not switchable on purpose: the public job list and job detail, SEO pages,
auth sessions (`/me`) and the admin panel itself.
