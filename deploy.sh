#!/bin/bash
# deploy.sh — деплой seobot на ru-1-vps
set -euo pipefail

SERVER="root@185.56.162.59"
REMOTE_DIR="/opt/seobot"

echo "=== seobot deploy ==="

# Синхронизируем файлы на сервер
echo "→ Syncing files to $SERVER:$REMOTE_DIR..."
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='backend/node_modules' \
  ./ "$SERVER:$REMOTE_DIR/"

# Деплой на сервере
ssh "$SERVER" bash << 'ENDSSH'
set -e
cd /opt/seobot

if [ ! -f .env ]; then
  echo "⚠ .env not found!"
  cp backend/.env.example .env
  echo "Edit /opt/seobot/.env and re-run deploy!"
  exit 1
fi

# Первый запуск — миграции
docker compose build backend
docker compose up -d
docker compose exec -T backend node migrations/run.js
echo "✓ Done"
ENDSSH

echo "=== Deploy complete ==="
echo "API: https://seo.mirobase.ru/api/"
