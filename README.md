# Thánh Ca Hub

The song library of a choir's **physical** sheet music. Every song is a set of A4 sheets in a binder,
and the app's job is to tell you exactly where: **`NL-1.01`** means category *Nhập lễ* (NL),
binder 1, page 01.

- Search by location (`NL-1.01`, `PS-3`), song number, title, composer or first line. Accents are
  optional: `duc me` finds *Đức Mẹ*.
- Filter by category and binder; sort by location, number, title or date; export to Excel.
- Scanned pages (full-screen, zoomable) and PDFs for every song.
- Members can read; admins add, edit and delete songs, categories and users. Every change is recorded.
- Vietnamese and English. Works on phones.

**Stack**: a Python server (FastAPI, SQLAlchemy, SQLite or PostgreSQL) that also serves the web app
(React, TypeScript, Vite, Tailwind CSS). Design notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 1. Run it on your computer

You need:

- **Python 3.11 or newer**
- **[uv](https://docs.astral.sh/uv/)**, the Python package manager. On Windows (PowerShell):
  `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`.
  On macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`. Or `pip install uv`.
- **Node.js 20.19+** (22 LTS recommended), only to build the web app.

### Start the server

```bash
cd backend
uv sync                                   # installs Python packages into backend/.venv
uv run thanhca create-admin --email you@example.org --name "Your Name"   # asks for a password
uv run thanhca seed                       # optional: 36 fictional sample songs to try things
uv run uvicorn thanhca.main:app --reload --port 8000
```

The database (`backend/data/thanhca.db`) and the tables are created automatically.
API documentation: http://localhost:8000/api/docs

### Start the web app

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and sign in with the admin account. Changes to the code reload
automatically; requests to `/api` are forwarded to the Python server on port 8000.

### Or: one server only

Build the web app once, and the Python server serves it too:

```bash
cd frontend && npm install && npm run build
cd ../backend && uv run uvicorn thanhca.main:app --port 8000
```

Open **http://localhost:8000**. This is how it runs in production.

### Without uv

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows; on macOS/Linux: source .venv/bin/activate
pip install -e .
thanhca create-admin --email you@example.org --name "Your Name"
uvicorn thanhca.main:app --reload --port 8000
```

---

## 2. Settings

All settings are optional. Copy `backend/.env.example` to `backend/.env`, or set environment
variables (on a hosting platform).

| Setting | Default | Meaning |
|---|---|---|
| `APP_NAME` | `Thánh Ca Hub` | Shown in the browser tab, sign-in page and sidebar |
| `DEFAULT_LOCALE` | `vi` | Language for people who have not chosen one (`vi` or `en`) |
| `TIME_ZONE` | `Asia/Ho_Chi_Minh` | Dates are shown in this time zone |
| `DATA_DIR` | `backend/data` | SQLite database and uploaded files |
| `DATABASE_URL` | empty (SQLite) | PostgreSQL instead: `postgresql://user:password@host:5432/dbname` |
| `STORAGE_BACKEND` | `local` | `local` (files in `DATA_DIR/files`) or `s3` (a bucket, see below) |
| `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PREFIX` | | For `STORAGE_BACKEND=s3`: Cloudflare R2, Amazon S3, Google Cloud Storage (HMAC keys), MinIO, Supabase Storage. Keep the bucket private. |
| `SESSION_DAYS` | `30` | People stay signed in this long after their last visit |
| `COOKIE_SECURE` | `auto` | Secure cookies on HTTPS (`auto` needs `--proxy-headers` behind a proxy) |
| `AUTO_MIGRATE` | `true` | Update the database tables when the server starts |

---

## 3. Using the app

| Type in the search box | Finds |
|---|---|
| `NL-1.01`, `nl 1.1`, `NL1.01` | The song at that location |
| `NL-1`, `PS 3` | Every song in that binder |
| `KL` | Every song in that category |
| `dc-3` | `ĐC-3` (Đ can be typed as D) |
| `125` | Song number 125 first, then numbers starting with 125 |
| `duc me`, `dâng lời` | Words in the title, first line, composer or category, with or without accents |

- Press <kbd>/</kbd> to jump to the search box.
- **Admins**: *Add song* opens the form with the next free page in the chosen binder. The location
  preview says whether it is free. Add a PDF and/or photos of the pages (large photos are reduced
  automatically).
- **Users**: admins create accounts on the *Users* page and share the generated password. There is no
  public sign-up and no email; forgotten passwords are reset by an admin.
- Lost the only admin password? On the server: `uv run thanhca create-admin --email <that email>`
  sets a new one.

---

## 4. Deploy

### Option A: one small server with Docker (recommended)

Any VPS (Hetzner, DigitalOcean, Google Compute Engine e2-micro), a NAS or a computer at the parish:

```bash
git clone <this repository> thanh-ca-hub && cd thanh-ca-hub
docker compose up -d --build
docker compose exec app thanhca create-admin --email you@example.org --name "Your Name"
```

The app runs on port 8000. The database and files are kept in the Docker volume `data`.
For HTTPS, put a reverse proxy in front; with [Caddy](https://caddyserver.com) the whole config is:

```
songs.your-parish.org {
    reverse_proxy localhost:8000
}
```

Update to a new version: `git pull && docker compose up -d --build` (database changes are applied
automatically).

### Option B: Google Cloud Run (or Render, Fly.io, Railway)

These platforms have no permanent disk, so use a hosted PostgreSQL database and a bucket:

1. **Database**: create a free PostgreSQL database (e.g. [Neon](https://neon.tech) or
   [Supabase](https://supabase.com)) and copy its connection string.
2. **Files**: create a private bucket, e.g. Cloudflare R2 (10 GB free), and an API token with
   read/write access to it.
3. Deploy the image (from the repository folder):

   ```bash
   gcloud run deploy thanhca --source . --region asia-southeast1 --allow-unauthenticated \
     --set-env-vars "DATABASE_URL=postgresql://...,STORAGE_BACKEND=s3,S3_BUCKET=thanhca,S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com,S3_REGION=auto,S3_ACCESS_KEY_ID=...,S3_SECRET_ACCESS_KEY=..."
   ```

   (Store the secrets in Secret Manager for a long-lived setup.)
4. Create the first admin from your computer, pointed at the same database:

   ```bash
   cd backend
   DATABASE_URL="postgresql://..." uv run thanhca create-admin --email you@example.org --name "Your Name"
   ```

### Option C: a Linux server without Docker

Install Python 3.11+, uv and Node.js, build the web app (`npm ci && npm run build` in `frontend/`),
run `uv sync --no-dev` in `backend/`, and start
`uv run uvicorn thanhca.main:app --host 127.0.0.1 --port 8000 --proxy-headers` with systemd behind
Caddy or nginx.

### Backups

- **SQLite + local files** (options A and C): `thanhca backup` writes a zip with a consistent copy of
  the database and all files, safe while the app is running. With Docker:
  `docker compose exec app thanhca backup --output /data/backup-$(date +%F).zip`, then copy it off the
  server. Restore: stop the app and unzip into the data folder.
- **PostgreSQL / bucket** (option B): your providers' backups, or `pg_dump`.
- Anyone can also export the whole catalogue to Excel from the library page.

---

## 5. Development

```bash
# backend/
uv run pytest                    # API tests on SQLite
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/thanhca_test uv run pytest   # and on PostgreSQL (wipes that database)
uv run ruff check . && uv run ruff format .

# frontend/
npm run lint
npm run typecheck
npm test
npm run build
```

**Database changes**: edit `backend/thanhca/models.py`, then create a migration with
`uv run alembic revision --autogenerate -m "describe the change"` (in `backend/`), check the
generated file in `thanhca/migrations/versions/`, and commit it. Servers apply it when they start.

**Translations**: all text is in `frontend/src/lib/i18n/messages/vi.ts` and `en.ts` (same keys).
The API returns translation keys for errors; a test checks that each one exists.

### Project layout

```
backend/                Python API and server (package `thanhca`)
  thanhca/routers/      HTTP endpoints
  thanhca/services/     search, songs and files, categories, users, export
  thanhca/migrations/   database migrations
  tests/                pytest
frontend/               React web app
  src/pages/            screens
  src/components/       building blocks (song form, viewer, dialogs, ...)
  src/api/              API client
docs/ARCHITECTURE.md    design, database schema, security
Dockerfile              builds the web app and the server into one image
```

### Troubleshooting

| Problem | Fix |
|---|---|
| Web app says *Cannot reach the server* | Start the Python server (port 8000) before `npm run dev`. |
| `Address already in use` | Another program uses the port: `--port 8001` (and `API_URL=http://127.0.0.1:8001 npm run dev`). |
| `database is locked` | Keep the SQLite file on a local disk (not a network drive), or use PostgreSQL. |
| `npm test` fails on Windows with *Cannot read properties of undefined (reading 'config')* | Run it from a terminal opened at `F:\...` (capital drive letter); `npm test` already corrects this. |
| Cannot stay signed in on a plain-HTTP test server | Leave `COOKIE_SECURE=auto` (secure cookies only over HTTPS), not `true`. |
