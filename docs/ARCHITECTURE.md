# Thánh Ca Hub: architecture and design

A web application for finding, viewing and managing a Catholic choir's **physical** song library:
sets of A4 sheet music stored in category binders and identified by a physical location code such as
`NL-1.01`.

This document covers requirements, stack, architecture, database schema, pages, user flows, UI/UX,
folder structure, security and MVP scope.

---

## 0. Key decisions at a glance

| Decision | Choice |
|---|---|
| Primary identifier of a song | **Physical location** `{code}-{binder}.{page}` (e.g. `ĐC-3.12`), stored as structured fields, unique |
| Song number | Kept as an **optional, unique** field (the spec is unsure whether numbers are still used). Searchable and sortable when present. |
| Default library order | **By physical location** (category order → binder → page, numerically), so the list mirrors the shelf. While searching, best match first. |
| Stack | **Python backend** (FastAPI, SQLAlchemy, Alembic) + React web app (Vite, TypeScript, Tailwind CSS). **One server** serves both. |
| Database | **SQLite** by default (one file, nothing to install); **PostgreSQL** by changing one setting. Same code and tests for both. |
| Search | Accent-insensitive matching on accent-free copies of the text computed in Python, location-code parsing, relevance ranking |
| Files | Private: a folder on the server, or any S3-compatible bucket. Every file goes through a permission check. |
| Auth | Email + password, admin-created accounts, server-side sessions in an HttpOnly cookie. No email server needed. |
| UI language | Vietnamese by default with an English switch (all copy from the spec is used verbatim in English) |

---

## 1. Requirements analysis

### 1.1 Purpose and the core workflow

The app is a **searchable catalogue of a physical library**, not a music player. Everything is
optimised around one flow:

1. Search for a song (by location, title, first sentence, composer or number).
2. Recognise the right song in the results.
3. **Immediately see its physical location** (shown as the most prominent element).
4. Go to the right category binder.
5. Find the sheet using the location code. Optionally preview the scan or PDF first.

### 1.2 Users and permissions

| Capability | Member | Admin |
|---|:-:|:-:|
| Sign in, change own name/password/language | ✓ | ✓ |
| Browse, search, filter, sort and export the library | ✓ | ✓ |
| View song details, images and PDFs | ✓ | ✓ |
| View categories (codes, binder counts, song counts) | ✓ | ✓ |
| Add / edit / delete songs | | ✓ |
| Upload / replace / remove PDFs and images | | ✓ |
| Create / rename / re-code / reorder / delete unused categories, change binder counts | | ✓ |
| Create users, change roles, reset passwords, deactivate / delete users | | ✓ |
| View the change history (activity log) | | ✓ |

### 1.3 Functional requirements (MVP)

- **Song record**: location (category + binder + page), title\*, optional song number, composer,
  first sentence, notes, zero or one PDF, zero or more images (ordered A4 pages), timestamps,
  created/updated by.
- **Location rules**: binder must exist for the category (`1..binder_count`); page 1–999; the
  `category + binder + page` combination is unique; the code is generated, never typed.
- **Search** (one box): partial, case- and accent-insensitive (`duc me` → *Đức Mẹ*); matches title,
  first sentence, composer, category name and song number; understands location queries (`NL-1.01` =
  exact song, `NL-1` / `PS-3` = whole binder, `NL` = whole category; `DC-3` also matches `ĐC-3`).
  When the query is typed with accents, exact-accent matches rank first (`Nguyễn` before *Nguyện*).
- **Filter** by category and binder; **sort** by location, song number ↑/↓, title A–Z/Z–A, recently
  added, recently updated, and best match while searching. **Export** the current view to Excel.
- **Song details** with prominent location, image gallery with full-screen zoomable viewer, in-page
  PDF preview and "View PDF" button.
- **Add / edit / delete** with validation, live location preview, availability check, upload progress,
  and a confirmation dialog for deletes.
- **Categories**: list for everyone; admins can create, rename, change code, change binder count
  (cannot drop below a binder in use), reorder, and delete unused categories.
- **Users**: admins create accounts with a temporary password, set roles, reset passwords,
  deactivate/reactivate and delete users. Guard rails stop an admin from locking themselves out and
  stop the last admin from being removed.
- **Dashboard**: totals, songs with/without PDF, recently added/updated, big search box.
- **History**: song created/edited/deleted, files added/removed/replaced, category and user changes,
  each with who and when.

### 1.4 Non-functional requirements

| Area | Target |
|---|---|
| Speed | Search-as-you-type on the library page (250 ms debounce, server-side query a few ms at thousands of songs) |
| Mobile | Phone-first card layout, 16 px+ inputs (no iOS zoom), 44 px touch targets, sticky search |
| Vietnamese | Unicode NFC normalisation on input; accent folding for matching; fonts with full Vietnamese coverage |
| Cost | Runs on one small server or a free container platform; no paid services required |
| Maintenance | One Python process (it also serves the web app), one database, one files folder or bucket. Migrations in the repo, applied automatically. |
| Scale | Designed and indexed for thousands of songs; pagination everywhere |
| Robustness | Friendly errors, never raw technical messages; rules enforced by the server and by database constraints, not only by the UI |

### 1.5 Interpretation of ambiguous points

- **Song number vs location.** The original brief makes the song number required. The later "physical
  location" section makes the location the core identifier, drops the number from the recommended
  Song entity and says "song number if song numbers are still used". So the **location is required and
  unique**, and the **song number is optional but unique when given**. To make it mandatory again,
  remove `optional=True` from `song_number` in `backend/thanhca/schemas.py` and add `NOT NULL` in a migration.
- **One location = one song** (unique constraint), as the MVP assumption in the spec. If a sleeve ever
  holds several songs, replace the unique constraint with a plain index and drop the duplicate check.
- **Multiple categories per song (future).** The category on a song is its *physical* category
  (binder). Extra liturgical uses would go in a `song_extra_categories` join table later, without
  touching the location model.

---

## 2. Technology stack

| Layer | Choice | Why |
|---|---|---|
| API server | **Python 3.11+, FastAPI** | Typed, fast, automatic API docs at `/api/docs`; familiar to Python developers (close to Flask) |
| Database access | **SQLAlchemy 2** + **Alembic** migrations | Mature; the same models and queries run on SQLite and PostgreSQL |
| Validation | **Pydantic 2** | Request bodies are validated in one place; errors are translation keys per field |
| Passwords | **Argon2id** (`argon2-cffi`) | Current recommendation for password hashing |
| Excel export | **openpyxl** | Real `.xlsx` files with a bold, frozen header row |
| File storage | Local folder, or **S3-compatible** (`boto3`) | Simple on one server; a bucket (Cloudflare R2, S3, GCS, MinIO, Supabase Storage) on stateless hosting |
| Web app | **React 19 + TypeScript + Vite** | The screens from the first version, kept as they were |
| Routing / data | **React Router 7** (library mode) + **TanStack Query 5** | URL-driven library state; caching, loading and error states |
| Styling | **Tailwind CSS 4** + small in-house components | Responsive UI without a heavy component framework |
| UI extras | `lucide-react` (icons), `sonner` (toasts), `yet-another-react-lightbox` (zoom/swipe viewer), Fontsource fonts (bundled, no third-party requests) | Small, accessible |
| Tests | **pytest** (API, both databases) + **Vitest** (web helpers) + a browser test with Chrome | |
| Packaging | **uv** (Python), npm (web app), one **Dockerfile** | Reproducible installs from lockfiles |

### Why SQLite by default (and when to use PostgreSQL)

A choir library is small: a few thousand songs, a handful of admins writing occasionally, members
reading. SQLite in WAL mode handles that easily, is a single file, needs no database server, and is
backed up with `thanhca backup`. Use **PostgreSQL** (`DATABASE_URL=postgresql://...`) when the app
runs on a platform without a persistent disk (Cloud Run, Render free tier), when several server
instances run at once, or if the choir already has a managed database (Neon and Supabase have free
plans). Search does not depend on database features: accent-free copies of the text (`title_key`,
`search_text`, …) are computed in Python when a song is saved, so results are identical on both.

### Why this file storage

- **Local folder** (default): no extra service. Files are streamed by the API after the permission
  check. Needs a persistent disk (a VPS, a NAS, a Docker volume).
- **S3-compatible bucket**: for stateless hosting. The bucket stays private; after the permission check
  the API redirects to a link that expires after an hour. Cloudflare R2 has a 10 GB free tier and no
  download fees.
- Scanned pages are downscaled in the browser before upload (max 3000 px, JPEG), so an A4 page is
  typically 300–700 KB. The database stores **storage keys, never URLs**, so changing storage later is
  a matter of copying the files.

### Why this auth approach

A choir does not need social logins or self-service registration. **Admins create accounts**
(email + temporary password) on the Users page. Members change their password in Settings, and
forgotten passwords are reset by an admin. No email server is needed. The first admin is created
with `thanhca create-admin`.

### Alternatives considered

- *Django + templates*: excellent admin site, but the existing React screens (live search, upload
  progress, image viewer) would have had to be rebuilt.
- *Next.js in front of the Python API*: two servers to run and deploy instead of one.
- *Flask*: fine too; FastAPI adds request validation and API docs without extra libraries.

---

## 3. Application architecture

```
 Browser (phone / tablet / desktop)
   │  React single-page app: routes, search, forms, image viewer
   │  same origin: cookies are first-party, no CORS
   ▼
 Python server (uvicorn + FastAPI) ─────────────────────────────────────────────────
   /assets/*, /index.html   the built web app (every non-API path returns index.html)
   /api/session             app settings + signed-in user (called at start-up)
   /api/auth/*, /api/me     sign in/out, own name and password
   /api/songs, /api/stats   search, details, create/update/delete, location check
   /api/uploads             one file per request, with progress; attached on save
   /api/songs/{id}/files    attach / reorder / remove / replace files in one transaction
   /api/files/{id}          permission check → file (local) or 1-hour link (S3)
   /api/export/songs        current library view as .xlsx
   /api/categories, /api/users, /api/activity
   Guard middleware         security headers, CSP, CSRF header check, request size limits
   │
   ├── SQLAlchemy ──► SQLite file (WAL)  or  PostgreSQL
   └── Storage    ──► data/files/        or  S3-compatible bucket
```

**Read path (library)**: URL search params (`q`, `category`, `binder`, `sort`, `page`) → React page →
`GET /api/songs` → table (desktop) or cards (mobile). Typing in the search box updates the URL after
250 ms, so results are shareable and the Back button works. Previous results stay visible while the
next ones load.

**Write path (song)**: the form sends the fields to `POST/PUT /api/songs`. The server validates them
(Pydantic), checks the admin role, the binder range and uniqueness, then saves and records the history
entry in the same transaction. Problems come back as translation keys per field ("Location NL-1.01 is
already assigned to another song." with a link to that song).

**Upload path**: after the song is saved, the browser uploads each new file to `/api/uploads` with a
progress bar (two at a time; large photos are downscaled first). The server checks the real file type
from its first bytes and the size, stores it, and returns an upload id. `PUT /api/songs/{id}/files`
then attaches the uploads, reorders or removes images and replaces the PDF **in one transaction**;
replaced files are deleted afterwards. Uploads never attached (form closed) are removed after a day.

**File access path**: `<img src="/api/files/42">` → session check → file. Members never see storage
keys or public URLs.

**Sessions**: signing in creates a random token; the browser keeps it in an HttpOnly, SameSite=Lax
cookie and the database keeps only its SHA-256 hash. Sessions last 30 days after the last visit and
are deleted at sign-out, on deactivation and on password changes (other devices).

---

## 4. Database schema

```
users 1 ──── * sessions
  │ created_by / updated_by (set null on delete)
  ▼
categories 1 ──── * songs 1 ──── * song_attachments
                         ▲
audit_logs (song_id, actor snapshots; no foreign keys, so history survives deletions)
```

All ids use AUTOINCREMENT on SQLite, so the id of a deleted song or file is never reused: old links
and history entries never point to a different song.

### `users`
| column | type | notes |
|---|---|---|
| id | integer PK | |
| email | varchar(254) unique | stored lower-case; only admins see other people's email |
| password_hash | varchar | Argon2id |
| display_name | varchar(100) | |
| role | `admin` \| `member` | check constraint |
| is_active | boolean | inactive accounts cannot sign in |
| created_at / updated_at / last_sign_in_at | timestamp (UTC) | |

### `sessions`
| column | type | notes |
|---|---|---|
| token_hash | char(64) unique | SHA-256 of the cookie value |
| user_id | FK → users | cascade delete |
| created_at / last_seen_at / expires_at | timestamp | sliding 30-day expiry |
| user_agent | varchar | for future "signed-in devices" list |

### `categories`
| column | type | notes |
|---|---|---|
| id | integer PK | |
| name | varchar(60) | |
| code | varchar(6) | capital letters incl. Vietnamese (`NL`, `ĐC`) |
| name_key / code_key | varchar | accent-free lower-case copies, **unique**: `DC` and `ĐC` can't coexist; `duc me` finds *Đức Mẹ* |
| binder_count | int | 1–50; cannot be lowered below a binder that holds songs |
| sort_order | int | order of chips, lists and location sorting |

The 14 default categories with their codes and binder counts are inserted by the first migration.

### `songs`
| column | type | notes |
|---|---|---|
| id | integer PK | used in URLs: `/songs/42` |
| category_id | FK → categories | `on delete restrict` |
| binder_number | int | 1–50, and ≤ category.binder_count (checked by the server) |
| page_number | int | 1–999, displayed with ≥ 2 digits |
| song_number | int, nullable | **unique** when present |
| title | varchar(200) | required |
| composer / first_sentence / notes | nullable | ≤ 200 / 500 / 2000 |
| title_key, composer_key, first_sentence_key, search_text | text | accent-free copies for search and sorting |
| search_exact | text | lower-case with accents, to rank exact-accent matches first |
| created_at / updated_at | timestamp | `updated_at` also changes when files change |
| created_by / updated_by | FK → users | `on delete set null` |

Constraints and indexes: `unique (category_id, binder_number, page_number)` (one song per location; also
serves location sorting and the category filter), `unique (song_number)`, and indexes on `title_key`,
`created_at`, `updated_at`.

The display code `NL-1.01` is **never stored**. It is generated from `categories.code`,
`binder_number` and `page_number`, so renaming a code updates every location instantly.

### `song_attachments`
| column | type | notes |
|---|---|---|
| song_id | FK → songs, nullable | cascade delete; null while an upload is not yet attached |
| file_type | `pdf` \| `image` | |
| storage_key | unique | e.g. `songs/3f2c…e1.jpg` (random name) |
| file_name | | original name, for display and downloads |
| mime_type | | detected from the file's content; must match `file_type` (check) |
| size_bytes, sort_order, created_at, created_by | | |

`unique (song_id) where file_type = 'pdf'` enforces **zero or one PDF** per song.

### `audit_logs`
| column | type | notes |
|---|---|---|
| created_at, actor_id, actor_name | | name snapshot, so history stays readable after a user is deleted |
| action | | `song.created/updated/deleted`, `attachment.added/removed/replaced`, `category.*`, `user.*` |
| entity_type, entity_id, song_id | | |
| summary | | label snapshot, e.g. `DL-1.03 · Xin Dâng Lời Cảm Tạ` |
| details | JSON | e.g. changed fields `{"title": ["old", "new"]}` |

History entries are written by the service functions in the same transaction as the change, so a
change is never saved without its entry (and vice versa).

---

## 5. Pages and API

| Route | Who | Content |
|---|---|---|
| `/login` | public | email + password, language switch |
| `/` | → `/songs` | the library is the home page |
| `/songs` | all | **Song Library**: search, category/binder chips, sort, table/cards, pagination, Excel export |
| `/songs/:id` | all | details: big location, info, images (lightbox), PDF preview; admin Edit/Delete and change history |
| `/songs/new` | admin | add song (location first, live preview and availability check) |
| `/songs/:id/edit` | admin | edit song and its files (replace/remove PDF, add/remove/reorder images) |
| `/dashboard` | all | totals, recently added/updated, big search |
| `/categories` | all (manage: admin) | categories with code, binders, song count |
| `/users` | admin | user management |
| `/activity` | admin | change history |
| `/settings` | all | display name, password, language |

Members who open an admin page get "page not found". The JSON API is documented on every running
server at **`/api/docs`**.

---

## 6. Main user flows

**Find a song (member, phone)**
1. Open the app → library with the search box at the top.
2. Type `duc me`, `dâng lời`, `125` or `NL-1`. Results update as you type.
3. Each card starts with the **location badge** (`MA-2.03`), then title, composer, category and first sentence.
4. Tap the card → details page shows `MA-2.03` large, with *Đức Mẹ (MA) · Binder 2 · Page 03*.
5. Optionally tap a page image (full-screen, pinch to zoom) or **View PDF**.

**Browse a binder**: tap the *Phục Sinh* chip → binder chips `All PS-1 … PS-5` appear → tap `PS-3` →
songs in `PS-3.xx`, numerically ordered.

**Add a song (admin)**
1. *Add song* (pre-fills category/binder if a filter is active).
2. Choose category → binder dropdown lists only that category's binders → page is pre-filled with the
   next free position. A live preview shows `PS-4.13 ✓ Available`.
3. Enter title etc., attach a PDF and/or several images (previews, reorder, remove).
4. Save → the song is created → files upload with progress bars → you land on the details page.
   If an upload fails, the song is kept and the failed files can be retried or skipped.

**Edit a song**: same form. Existing files can be removed, reordered or replaced. Nothing changes
until *Save*. Changing location or number re-checks uniqueness.

**Delete a song**: *Delete* → dialog "Are you sure you want to delete song #125 – Xin Dâng Lời Cảm
Tạ (DL-1.03)?". *Cancel* has the default focus. Files are removed from storage too.

**Manage categories / users**: dialogs on the respective pages, with guard rails (unused-only
category delete, binder count ≥ binders in use, no self-demotion, at least one active admin).

---

## 7. UI / UX

**Principles**: search first, location first, few clicks, large readable text, calm and professional
look, no music-player metaphors and no decorative religious imagery.

**Palette** (calm "hymnal" feel):
| token | value | use |
|---|---|---|
| brand-800 | `#263859` deep navy | primary buttons, active nav, **location badges** |
| brand-50/100 | `#f2f5fa` / `#e3e9f3` | selected chips, hovers |
| gold-500 | `#c08529` muted gold | small accents only (active indicator, logo mark) |
| canvas | `#f7f6f3` warm off-white | page background |
| stone scale | warm greys | text, secondary text, borders |
| PDF / image | red-700 on red-50 / sky-700 on sky-50 | attachment indicators |

**Typography**: *Be Vietnam Pro* (designed for Vietnamese diacritics) for UI, 16 px base. *JetBrains
Mono* for location codes, so `ĐC-3.12` reads like a label. Both are bundled with the app.

**Layouts**
```
Desktop                                              Mobile
┌──────────┬──────────────────────────────────────┐  ┌────────────────────────────┐
│ Thánh Ca │ [🔍 Search location, title, ...    ] │  │ ☰ [🔍 Search…            ] │
│  Hub     ├──────────────────────────────────────┤  ├────────────────────────────┤
│ Library  │ Song Library            [+ Add song] │  │ [All][NL Nhập lễ][ĐC …] →  │
│ Dashboard│ [All][NL Nhập lễ][ĐC Đáp ca]…        │  │ ┌────────────────────────┐ │
│ Categor. │ Binder: [All][1][2][3]   Sort: [Loc▾]│  │ │ NL-1.01       PDF · 2🖼 │ │
│ Users    │ ┌───────┬───────────────┬──────┬───┐ │  │ │ Con Hân Hoan Tiến Vào  │ │
│ Activity │ │NL-1.01│Con Hân Hoan…  │N.V.An│PDF│ │  │ │ Nguyễn Văn An · Nhập lễ│ │
│ Settings │ │NL-1.02│Hãy Đến Đây…   │…     │   │ │  │ │ "Con hân hoan tiến…"   │ │
│          │ └───────┴───────────────┴──────┴───┘ │  │ └────────────────────────┘ │
└──────────┴──────────────────────────────────────┘  └────────────────────────────┘
```

**States**: skeletons while pages load, a spinner while results update, upload progress bars, inline
field errors, toasts for success, friendly empty states ("No songs have been added yet.", "No songs
found for 'abc'.", "No songs are currently assigned to this category."), a retry screen when the server
cannot be reached, and a sign-in page that explains when a session has expired.

**Accessibility**: real `<label>`s, keyboard-reachable rows and links, native `<dialog>` (focus trap,
Esc), visible focus rings, AA contrast, `/` focuses the search box.

---

## 8. Folder structure

```
thanh-ca-hub/
├─ Dockerfile, docker-compose.yml   one image: builds the web app, runs the Python server
├─ docs/ARCHITECTURE.md
├─ backend/                         Python API (uv project)
│  ├─ pyproject.toml, uv.lock, .env.example
│  ├─ thanhca/
│  │  ├─ main.py, app.py            entry point; app factory, middleware, web app serving
│  │  ├─ config.py                  settings (environment variables / .env)
│  │  ├─ db.py, models.py           engine, migrations runner, tables
│  │  ├─ migrations/                Alembic (0001: schema + default categories)
│  │  ├─ schemas.py                 request/response shapes and validation
│  │  ├─ deps.py, security.py       session lookup, permissions, passwords, rate limiting
│  │  ├─ errors.py                  error format and handlers
│  │  ├─ routers/                   auth, songs (+ files, export), admin (categories, users, activity)
│  │  ├─ services/                  search, songs, categories, users, library stats, export
│  │  ├─ storage.py, files.py       local / S3 storage; file type detection and limits
│  │  ├─ text.py, location.py       Vietnamese text folding; location codes and queries
│  │  ├─ audit.py                   history entries
│  │  ├─ sample_data.py             36 fictional songs (`thanhca seed`)
│  │  └─ cli.py                     migrate, create-admin, seed, cleanup, backup
│  └─ tests/                        pytest: search, songs, files, permissions, auth, users, categories, export
└─ frontend/                        React web app (Vite)
   ├─ index.html, public/           icons, manifest
   ├─ src/
   │  ├─ main.tsx, router.tsx       providers, start-up, routes, sign-in gate
   │  ├─ api/                       fetch client (errors, CSRF header), types, queries
   │  ├─ pages/                     login, library, song, add/edit, dashboard, admin pages
   │  ├─ components/                ui/, layout/, songs/ (+ song-form/), categories/, users/, …
   │  └─ lib/                       i18n (vi, en), location, library URL state, files, upload, format
   └─ tests/                        Vitest: helpers, translations, API error keys
```

---

## 9. Security considerations

- **Permissions on the server**: every endpoint declares who may call it (signed-in member or admin);
  the web app hiding buttons is only a convenience. Tests check that anonymous visitors and members
  are refused for every protected endpoint.
- **Sessions**: random 256-bit tokens; only hashes are stored; HttpOnly, SameSite=Lax cookies, Secure
  over HTTPS; sliding expiry; ended on sign-out, deactivation and password change.
- **Passwords**: Argon2id, 8–72 characters, constant-time answers for unknown emails, sign-in rate
  limiting per address and per account, current password required to change it.
- **CSRF**: requests that change data must carry `X-Requested-With: thanhca`, which other websites
  cannot add without CORS (not enabled); SameSite cookies as a second layer.
- **Files**: no public URLs; type detected from the content (JPEG, PNG, WebP, PDF only; no SVG or
  HTML), size limits (20 MB images, 25 MB PDFs), random storage names, `nosniff`, downloads with safe
  `Content-Disposition`. Unattached uploads are visible only to the admin who uploaded them.
- **Web hardening**: Content Security Policy on the web app (scripts only from the same origin),
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, request size limits,
  open-redirect-safe `next` parameter on sign-in, `noindex` for search engines.
- **Input**: Pydantic validation with length limits, Unicode NFC normalisation, LIKE-wildcard
  escaping in search, parameterised SQL everywhere (SQLAlchemy), database constraints as a backstop.
- **Errors**: people see friendly messages; technical details go to the server log only.
- **Backups**: `thanhca backup` (SQLite + local files, safe while running), or the provider's backups
  for PostgreSQL and buckets. The Excel export is a human-readable copy of the catalogue.

---

## 10. MVP scope

### MVP (implemented)
- Sign in / out, roles (admin, member), inactive accounts, session expiry handling
- Song library: search (accent-insensitive, location-aware, number, relevance), category + binder
  filters, all sort options, pagination, desktop table + mobile cards, Excel export
- Song details with location, image gallery (full-screen, zoom, swipe) and PDF preview
- Add / edit / delete songs with validation, location preview, availability check, next-free-page
  suggestion, upload progress with retry, PDF replace, multiple images with ordering
- Category management (create, rename, code, binder count, reorder, delete unused)
- User management (create, role, reset password, deactivate/activate, delete)
- Dashboard, change history (global + per song), settings (name, password, language)
- Vietnamese + English UI, responsive design, loading/empty/error states, home-screen install
- Migrations, sample data (36 songs), admin bootstrap, backups, tests, setup and deploy guide

### Future features (designed for, not built)
| Feature | How the current design supports it |
|---|---|
| QR code per song / printed labels | Stable URLs `/songs/{id}` and generated location codes; add a print page that renders QR + `NL-1.01` labels |
| Bulk Excel import | `SongInput` validation and the duplicate checks already define a valid row; the export's columns can be the template; `openpyxl` is already installed |
| Duplicate detection | `title_key` / `search_text` are normalised; compare new titles against them (e.g. with `difflib` or PostgreSQL `pg_trgm`) in the add form |
| OCR from scanned sheets | Files are in storage; a background job can fill a new `lyrics` column |
| Search inside lyrics | Add `lyrics` to `search_text` in `Song.refresh_keys` (one migration) |
| Multi-category songs | Add a `song_extra_categories` join table; the physical category stays on `songs` |
| Binder/location tracking | Already modelled (category + binder + page). Binder labels or shelf numbers can be added to `categories` |
| Admin-configurable binder counts | Already editable on the Categories page, with no code changes |
| "Signed-in devices" list | Sessions already store when and from which browser people signed in |
