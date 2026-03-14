#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "Starting backend..."
exec node dist/server.js
