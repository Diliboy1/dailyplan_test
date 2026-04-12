#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Starting PostgreSQL and Redis with Docker Compose..."
docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d

echo "==> Installing backend dependencies with uv..."
cd "${ROOT_DIR}/backend"
uv sync

echo "==> Installing frontend dependencies with pnpm..."
cd "${ROOT_DIR}/frontend"
pnpm install

echo "==> Starting backend (http://localhost:8000) and frontend (http://localhost:3000)..."
cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "${ROOT_DIR}/backend"
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

cd "${ROOT_DIR}/frontend"
pnpm dev &
FRONTEND_PID=$!

wait "${BACKEND_PID}" "${FRONTEND_PID}"
