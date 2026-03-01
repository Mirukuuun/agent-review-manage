#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

HOST="127.0.0.1"
PORT="8787"
ADMIN_PASSWORD=""

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or not in PATH."
  echo "Please install Node.js 22+ and try again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm is not available in PATH."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "[ERROR] Node.js 22+ is required. Current major version: ${NODE_MAJOR}"
  exit 1
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  echo "[INFO] .env not found. Creating from .env.example..."
  cp ".env.example" ".env"
fi

if [ -f ".env" ]; then
  while IFS='=' read -r key value || [ -n "${key:-}" ]; do
    key="${key%%[[:space:]]*}"
    [ -z "${key}" ] && continue
    [[ "${key}" == \#* ]] && continue

    value="${value:-}"
    value="$(printf '%s' "${value}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    value="${value%\"}"
    value="${value#\"}"

    case "${key}" in
      HOST) HOST="${value}" ;;
      PORT) PORT="${value}" ;;
      ADMIN_PASSWORD) ADMIN_PASSWORD="${value}" ;;
    esac
  done < ".env"
fi

if [ "${HOST}" != "127.0.0.1" ] && [ "${HOST}" != "localhost" ] && [ "${HOST}" != "::1" ] && [ -z "${ADMIN_PASSWORD}" ]; then
  echo "[ERROR] ADMIN_PASSWORD is required when HOST is not local."
  echo "[INFO] Please set ADMIN_PASSWORD in .env and rerun ./start.sh"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[INFO] Installing dependencies..."
  npm install
fi

LISTEN_PID=""
if command -v lsof >/dev/null 2>&1; then
  LISTEN_PID="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
elif command -v ss >/dev/null 2>&1; then
  LISTEN_PID="$(ss -ltnp "sport = :${PORT}" 2>/dev/null | sed -n '2p' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1 || true)"
fi

if [ -n "${LISTEN_PID}" ]; then
  echo "[ERROR] Port ${PORT} is already in use by PID ${LISTEN_PID}."
  if command -v ps >/dev/null 2>&1; then
    LISTEN_CMD="$(ps -p "${LISTEN_PID}" -o args= 2>/dev/null || true)"
    [ -n "${LISTEN_CMD}" ] && echo "[INFO] Process: ${LISTEN_CMD}"
  fi
  echo "[INFO] Stop it with: kill -9 ${LISTEN_PID}"
  echo "[INFO] Or set another PORT in .env and rerun ./start.sh"
  exit 1
fi

echo "[INFO] Starting server..."
echo "[INFO] UI: http://${HOST}:${PORT}/"
echo "[INFO] MCP: http://${HOST}:${PORT}/mcp"
echo

npm run mcp:http
