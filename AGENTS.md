# Thánh Ca Hub: notes for coding agents

A song library for a choir's physical sheet-music binders. Read `docs/ARCHITECTURE.md`
for the design and `README.md` for setup.

## Layout

- `backend/`: Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2. Package `thanhca`.
  - `routers/`: HTTP endpoints (thin). `services/`: rules, search, history.
  - `models.py`: tables (SQLite and PostgreSQL). `schemas.py`: JSON shapes (camelCase).
  - `migrations/versions/`: Alembic migrations. Never edit an applied migration; add a new one.
- `frontend/`: React 19 + TypeScript + Vite + Tailwind CSS 4, React Router 7 (library mode),
  TanStack Query 5. The production build is served by the Python server.

## Commands

Backend (in `backend/`, with [uv](https://docs.astral.sh/uv/)):

- `uv run uvicorn thanhca.main:app --reload --port 8000`: API on :8000
- `uv run pytest`: tests (SQLite; set `TEST_DATABASE_URL` to also test on PostgreSQL)
- `uv run ruff check . && uv run ruff format .`
- `uv run thanhca migrate | create-admin | seed | cleanup | backup`

Frontend (in `frontend/`):

- `npm run dev`: web app on :5173, `/api` forwarded to :8000
- `npm run build` (includes the type check), `npm run lint`, `npm test`

## Conventions

- API errors are `{"error": {"message": <translation key>, "params", "fieldErrors", "href"}}`.
  Every key must exist in `frontend/src/lib/i18n/messages/{en,vi}.ts` (a frontend test checks this).
- Requests that change data need the header `X-Requested-With: thanhca` (CSRF protection);
  `frontend/src/api/client.ts` adds it.
- User-facing text is Vietnamese and English; keep both dictionaries in sync.
- Searchable text is folded (lower-case, accents removed) in Python (`thanhca/text.py`) and
  stored in `*_key` / `search_text` columns, so search behaves the same on SQLite and PostgreSQL.
