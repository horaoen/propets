#!/usr/bin/env sh

set -eu

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-pet_user}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-pet_password}"
MYSQL_DATABASE="${MYSQL_DATABASE:-pet_rescue}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MIGRATION_DIR="$SCRIPT_DIR/../migrations"

for file in "$MIGRATION_DIR"/*.sql; do
  echo "Applying migration: $file"
  if command -v mysql >/dev/null 2>&1; then
    mysql \
      --host="$MYSQL_HOST" \
      --port="$MYSQL_PORT" \
      --user="$MYSQL_USER" \
      --password="$MYSQL_PASSWORD" \
      "$MYSQL_DATABASE" < "$file"
  else
    docker compose exec -T mysql mysql \
      --host=127.0.0.1 \
      --port=3306 \
      --user="$MYSQL_USER" \
      --password="$MYSQL_PASSWORD" \
      "$MYSQL_DATABASE" < "$file"
  fi
done

echo "Migrations applied successfully."
