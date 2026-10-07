# One image with everything: the Python server, which also serves the built web app.
#
#   docker build -t thanhca .
#   docker run -p 8000:8000 -v thanhca-data:/data thanhca
#
# See README.md ("Deploy") for settings, the first admin account and backups.

# --- 1. Build the web app ----------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. The server ------------------------------------------------------------------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /bin/uv

WORKDIR /app/backend
# Dependencies first, so code changes do not reinstall them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --locked --no-dev

COPY --from=web /web/dist /app/frontend/dist

ENV PATH="/app/backend/.venv/bin:$PATH" \
    DATA_DIR=/data \
    FRONTEND_DIST=/app/frontend/dist \
    PORT=8000

RUN useradd --create-home --uid 10001 thanhca && mkdir -p /data && chown thanhca /data
USER thanhca
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/api/session', timeout=4)"

# --proxy-headers: behind a hosting platform's HTTPS proxy, the server sees the
# visitor's address (for sign-in rate limits) and that the site uses HTTPS (secure cookies).
CMD ["sh", "-c", "exec uvicorn thanhca.main:app --host 0.0.0.0 --port \"$PORT\" --proxy-headers --forwarded-allow-ips='*'"]
