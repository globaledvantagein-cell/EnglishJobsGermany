# Analytics — what we track and how to read it

Three tools, all loaded **only after the visitor accepts analytics cookies**
(`utils/consent.ts`, required by TTDSG §25 / GDPR):

| Tool | Env var (frontend, build time) | Used for |
|---|---|---|
| PostHog (EU cloud) | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | The core metrics below, funnels, session recordings |
| Google Analytics 4 | `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Traffic sources, SEO landing pages |
| Microsoft Clarity | `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Heatmaps, rage/dead clicks, recordings |

`NEXT_PUBLIC_*` values are inlined by `next build`, so they must be in the
**server's** `packages/frontend/.env` before building. An unset id turns that
tool off. Until 2026-10-20 the PostHog token was missing from the production
build, so PostHog has no production data before that date.

## Keeping our own testing out

The trackers never load (nothing is sent, so nothing needs filtering later) when:

- the host isn't production (`NEXT_PUBLIC_ANALYTICS_HOSTS`, default
  `englishjobsgermany.com,www.englishjobsgermany.com`) — localhost, LAN IPs and
  previews are never tracked;
- the device is marked internal: **automatically when an admin signs in**, or
  by opening any page with `?ejg_internal=1` (undo: `?ejg_internal=0`). Use the
  link on every test phone/browser and for teammates without an admin account.
  The mark survives logout.

Code: `packages/frontend/src/utils/internalTraffic.ts`.

## Events

| Event | When | Key properties |
|---|---|---|
| `$pageview` | every page (PostHog automatic) | `$host`, `$pathname` |
| `signed_up` | a Google sign-in created a new account | `method` |
| `job_viewed` | a job page opened (Germany and remote) | `vertical` (`germany`/`remote`), `job_id`, `company`, `category` |
| `job_read_time` | tab hidden or job left | `view_id`, `active_seconds` (since the previous event of that view) |
| `job_applied` | the **Apply click** (outbound link) — not a completed application | `vertical`, `job_id`, `company` |

Active reading time counts a second only while the tab is visible and the
reader interacted in the last 15 s (GA4/Chartbeat engaged-time model), capped
at 30 min per view. Time per view = `SUM(active_seconds)` grouped by `view_id`.

Remember that every number covers **visitors who accepted cookies** only, so
use them for trends and rates, not as absolute totals. Complete sign-up counts
come from our database (/admin → Users & growth).

## Core metrics (PostHog → SQL insight)

Paste each into PostHog → *Product analytics → New insight → SQL*. They read
the last 30 days; change `INTERVAL 30 DAY` for more.

### 1. Daily totals: active users, sign-ups, job views, apply clicks

```sql
SELECT
    toDate(timestamp) AS day,
    uniqIf(person_id, event = '$pageview')                                    AS daily_active_users,
    countIf(event = 'signed_up')                                               AS new_signups,
    countIf(event = 'job_viewed')                                              AS job_page_views,
    round(countIf(event = 'job_viewed') / nullIf(uniqIf(person_id, event = '$pageview'), 0), 2) AS job_views_per_active_user,
    countIf(event = 'job_applied')                                             AS apply_clicks,
    uniqIf(person_id, event = 'job_applied')                                   AS users_who_clicked_apply,
    round(100 * countIf(event = 'job_applied') / nullIf(countIf(event = 'job_viewed'), 0), 1) AS apply_click_rate_pct
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event IN ('$pageview', 'signed_up', 'job_viewed', 'job_applied')
  AND properties.$host IN ('englishjobsgermany.com', 'www.englishjobsgermany.com')
GROUP BY day
ORDER BY day DESC
```

### 2. Returning visitors per day

A visitor is "returning" on a day if their first pageview was on an earlier day.

```sql
SELECT
    d.day AS day,
    count() AS visitors,
    countIf(f.first_day < d.day) AS returning_visitors,
    round(100 * countIf(f.first_day < d.day) / count(), 1) AS returning_pct
FROM (
    SELECT person_id, toDate(timestamp) AS day
    FROM events
    WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY
      AND properties.$host IN ('englishjobsgermany.com', 'www.englishjobsgermany.com')
    GROUP BY person_id, day
) AS d
LEFT JOIN (
    SELECT person_id, min(toDate(timestamp)) AS first_day
    FROM events
    WHERE event = '$pageview'
    GROUP BY person_id
) AS f ON d.person_id = f.person_id
GROUP BY day
ORDER BY day DESC
```

### 3. Active reading time on job pages per day

```sql
SELECT
    day,
    count() AS job_views_measured,
    round(avg(seconds)) AS avg_active_seconds,
    round(quantile(0.5)(seconds)) AS median_active_seconds
FROM (
    SELECT properties.view_id AS view_id,
           min(toDate(timestamp)) AS day,
           sum(toFloat(properties.active_seconds)) AS seconds
    FROM events
    WHERE event = 'job_read_time' AND timestamp >= now() - INTERVAL 30 DAY
      AND properties.$host IN ('englishjobsgermany.com', 'www.englishjobsgermany.com')
    GROUP BY view_id
)
GROUP BY day
ORDER BY day DESC
```

Prefer the **median**: a few long reads pull the average up.

### 4. Weekly trend (all metrics, Monday-start weeks)

```sql
SELECT
    toStartOfWeek(timestamp, 1) AS week,
    uniqIf(person_id, event = '$pageview')   AS weekly_active_users,
    countIf(event = 'signed_up')              AS new_signups,
    countIf(event = 'job_viewed')             AS job_page_views,
    countIf(event = 'job_applied')            AS apply_clicks,
    round(100 * countIf(event = 'job_applied') / nullIf(countIf(event = 'job_viewed'), 0), 1) AS apply_click_rate_pct
FROM events
WHERE timestamp >= now() - INTERVAL 12 WEEK
  AND event IN ('$pageview', 'signed_up', 'job_viewed', 'job_applied')
  AND properties.$host IN ('englishjobsgermany.com', 'www.englishjobsgermany.com')
GROUP BY week
ORDER BY week DESC
```

Save all four to one dashboard ("Core metrics"). As a second safety net, also
set PostHog → *Project settings → Filter out internal and test users* to
`$host` = `englishjobsgermany.com` (admins are never sent, so no role filter is needed).
