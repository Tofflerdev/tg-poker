#!/bin/sh
set -e

# The client build lives in a volume shared with nginx. Vite emits
# content-hashed filenames, so a plain copy leaves every past build behind — the
# volume had accumulated dozens of stale index-*.js / AdminApp-*.js chunks.
# Copy the fresh build FIRST, then delete whatever is not part of it: nginx
# always has a complete serveable set, and only orphans disappear.
NEW_BUILD=/app/client-build
SERVED=/app/client-dist

echo "🔄 Copying client files to shared volume..."
cp -r "$NEW_BUILD"/. "$SERVED"/ 2>/dev/null || true

echo "🧹 Pruning files left by previous builds..."
before=$(find "$SERVED" -type f | wc -l)
(cd "$SERVED" && find . -type f | while read -r file; do
  [ -f "$NEW_BUILD/$file" ] || rm -f "$file"
done)
find "$SERVED" -mindepth 1 -type d -empty -delete 2>/dev/null || true
after=$(find "$SERVED" -type f | wc -l)
echo "✅ Client files copied — $after served, $((before - after)) stale removed"

echo "🔄 Pushing database schema..."
npx prisma db push
echo "✅ Database schema synced"

echo "🚀 Starting server..."
exec node dist/server/index.js
