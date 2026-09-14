# Deploying the Next.js frontend (`frontend-next`)

This app replaces the old Vite SPA **and** the Express-rendered SEO/career-guide
HTML pages. The Express backend in `job-Data/` is unchanged — it still serves the
JSON API on port **3000**.

## Ports

| Service            | Port | Notes                                    |
| ------------------ | ---- | ---------------------------------------- |
| Express API        | 3000 | unchanged (`job-Data/`)                  |
| Next.js frontend   | 3001 | replaces static SPA + SEO HTML routes    |

## Environment

Create `frontend-next/.env.local` (or set in the process manager):

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<google oauth client id>
NEXT_PUBLIC_ENABLE_PROFILE=true
API_ORIGIN=http://localhost:3000          # Express backend (server-to-server SSR fetches + /api proxy)
NEXT_PUBLIC_SITE_URL=https://englishjobsgermany.com   # used for canonical / OG / JSON-LD / sitemap
```

## Build & run

```bash
cd frontend-next
npm install
npm run build
# Production start (standalone output is enabled in next.config.ts):
pm2 start npm --name "ejg-frontend" -- start -- -p 3001
# or plain: PORT=3001 npm run start
```

## Nginx

Point `/api/` at Express (unchanged) and **everything else** at Next.js. Next now
owns `/city/*`, `/category/*`, `/career-guide*`, `/sitemap.xml`, and all app routes.

```nginx
# Express API — unchanged
location /api/ {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Next.js — replaces the static SPA files AND the Express SEO HTML routes
location / {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Remove these old rules

- Any `location ^~ /city/`, `location ^~ /category/`, `location ^~ /career-guide`
  blocks that proxied to Express — Next.js handles these now.
- The `location /sitemap.xml` rule pointing at Express — Next generates it
  (`app/sitemap.ts`).
- The static `root /var/www/html` / `try_files` block that served the built Vite
  SPA — no longer used.

> The Express app can keep serving its own `/career-guide*` and `/sitemap.xml`
> internally; they're just no longer exposed publicly once nginx routes `/` to
> Next. Do not remove them from Express — the backend stays untouched.

## Notes

- `/api/*` requests from the browser are also rewritten to `API_ORIGIN` by
  `next.config.ts` (belt-and-suspenders with the nginx rule) so relative
  `fetch('/api/...')` calls in the client keep working.
- SEO pages (`/`, `/city/*`, `/category/*`, `/career-guide*`, `/jobs/[id]`) render
  server-side with `generateMetadata`, JSON-LD, and breadcrumbs. Verify with
  **View Page Source** — the H1, meta description, and `application/ld+json`
  blocks must be present in the raw HTML.
- Career-guide article data comes from the PUBLIC, unauthenticated backend
  endpoints (`/api/career-guide/public*`). No token is required — SSR renders
  published articles as long as `API_ORIGIN` points at the Express backend.
