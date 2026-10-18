# EMBEDDINGS SETUP

Smart Match re-ranks its best candidates by meaning, using text embeddings. Today's
Matches never uses them (it stays AI-free).

By default the embeddings run **on this server** with Transformers.js. That means
no API key, no quota and no cost. The model is `Xenova/bge-small-en-v1.5`: 384
dimensions, 8-bit, 34 MB on disk.

| | |
|---|---|
| Extra RAM | about 140 MB once loaded, about 200–260 MB at peak while embedding |
| Speed | about 50 ms per job on 2 CPU threads |
| First backfill | about 5,000 jobs in about 20 minutes, paced in the background (64 jobs every 15 s) |
| After that | only new or changed jobs are embedded |

Vectors are cached in the Mongo `jobEmbeddings` collection, so a restart reloads
them instead of embedding everything again.

---

## Step-by-step on the EC2 server

### 1. Check memory first

```bash
free -m
```

The box runs the API with a 768 MB V8 heap (`ecosystem.config.cjs`). The model
lives **outside** that heap, so the process needs about 250 MB more than before.

- **1 GB instance:** add swap before deploying.
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
  Upgrading to a 2 GB instance is the cleaner fix. If neither is possible, use
  `EMBEDDING_PROVIDER=off` (step 4).
- **2 GB or more:** nothing to do.

### 2. Pull and install

```bash
cd ~/EnglishJobsGermany          # wherever the repo lives
git pull
pnpm install                     # adds @huggingface/transformers
```

The ONNX runtime ships prebuilt Linux x64/arm64 binaries inside the package, so
there is no compile step and no extra system packages.

### 3. Download the model once (optional, about 10 s)

```bash
cd packages/backend
node -e "import('./src/embeddings/index.js').then(m => m.embedTexts(['hello'])).then(v => console.log('ok, dims =', v[0].length))"
```

Expected output: `ok, dims = 384`. This saves the model to
`packages/backend/.cache/models` (git-ignored). If you skip this step, the server
downloads it automatically on first boot.

The server needs outbound HTTPS to `huggingface.co` the first time only. After
that the model loads from disk.

### 4. Environment variables (all optional)

Add to `packages/backend/.env` only if you want to change a default:

```env
EMBEDDING_PROVIDER=local          # local (default) | gemini | off
EMBEDDING_THREADS=2               # CPU threads for inference; keep ≤ half the vCPUs
EMBEDDING_CACHE_DIR=/var/lib/ejg/models   # default: packages/backend/.cache/models
EMBEDDING_MODEL=Xenova/bge-small-en-v1.5  # change only together with DIMS in localProvider.js
```

- `local`: free, on-box. This is the recommended setting.
- `gemini`: Google `gemini-embedding-001` through the existing Gemini key pool.
  It uses no server RAM, but it is rate-limited and spends the same keys Smart
  Match scoring needs.
- `off`: no embeddings. Smart Match still works using the engine ranking plus
  Gemini scoring.

Switching provider or model is safe. Each cached vector is tagged with the
model that made it, and anything from a different model is re-embedded rather
than compared.

### 5. Restart

```bash
cd packages/backend
pm2 restart englishjobs-backend --update-env
```

### 6. Verify

```bash
pm2 logs englishjobs-backend --lines 200 | grep -E "Embeddings|Semantic"
```

You should see:

```
[Embeddings] local model Xenova/bge-small-en-v1.5 ready in 900ms
[Semantic] warmer: 64/4828 jobs embedded (3100ms)
[Semantic] warmer: 128/4828 jobs embedded (3050ms)
...
```

The count climbs every 15 s until it reaches the total. After a restart it
climbs much faster, because the vectors come from Mongo instead of the model.

To check memory:

```bash
pm2 monit          # or: ps -o rss,cmd -C node
```

RSS should settle about 250 MB above what it was before this change.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `local model failed to load: fetch failed` | No route to huggingface.co. Run step 3 on a machine with internet and copy `.cache/models` over, or open outbound HTTPS. |
| PM2 restarts with OOM / `Killed` | Add swap (step 1), lower `EMBEDDING_THREADS=1`, or set `EMBEDDING_PROVIDER=off`. |
| API feels slow during the first backfill | Set `EMBEDDING_THREADS=1`. The backfill only happens once. |
| `[Semantic] embedding unavailable, using engine ranking` | Smart Match failed open. Users still get results, and the next run retries. |

---

## Why not several Gemini keys in parallel?

- **Vectors from different models can't be mixed.** `gemini-embedding-001`
  vectors and those from another Google embedding model live in different
  spaces. Comparing them gives meaningless scores, so "two models in parallel"
  doesn't work.
- **Rotating keys to beat a quota** goes against Google's API terms. It also
  burns the same keys that Smart Match's AI scoring depends on.
- **The local model is free, unlimited and fast enough.** On short retrieval
  texts like these it is about as accurate as hosted small models.
