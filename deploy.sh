#!/bin/bash
# deploy.sh — деплой seobot на ru-1-vps
set -euo pipefail

SERVER="root@185.56.162.59"
REMOTE_DIR="/opt/seobot"

echo "=== seobot deploy ==="

# Собираем веб-версию локально
echo "→ Building web SPA..."
cd web
npm install --silent
npm run build
cd ..

# Синхронизируем файлы на сервер
echo "→ Syncing files to $SERVER:$REMOTE_DIR..."
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='backend/node_modules' \
  --exclude='web/node_modules' \
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

# Копируем собранный SPA
cp -r web/dist /opt/seobot/web-dist

# Обновляем nginx конфиг
cp nginx/seobot.conf /etc/nginx/sites-available/seobot.conf
ln -sf /etc/nginx/sites-available/seobot.conf /etc/nginx/sites-enabled/seobot.conf
nginx -t && nginx -s reload

# Первый запуск — миграции
docker compose build backend
docker compose up -d
docker compose exec -T backend node migrations/run.js
echo "✓ Done"
ENDSSH

echo "=== Deploy complete ==="
echo "Web: https://seo.mirobase.ru"
echo "API: https://seo.mirobase.ru/api/"
