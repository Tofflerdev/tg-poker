#!/bin/sh
set -e

echo "🔄 Copying client files to shared volume..."
cp -r /app/client-build/* /app/client-dist/ 2>/dev/null || true
echo "✅ Client files copied"

echo "🔄 Pushing database schema..."
npx prisma db push
echo "✅ Database schema synced"

echo "🚀 Starting server..."
exec node dist/server/index.js
