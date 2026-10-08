#!/usr/bin/env bash
# Docker'siz zaxira yo'l: hostdagi redis-server'ni Gavhar porti va paroli bilan
# alohida ma'lumot papkasida ishga tushiradi. Mavjud Redis'larga tegmaydi.
set -euo pipefail
cd "$(dirname "$0")/.."

read_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }

port="$(read_env REDIS_PORT)"
password="$(read_env REDIS_PASSWORD)"
mkdir -p .data/redis

exec redis-server \
  --bind 127.0.0.1 \
  --port "${port:-6380}" \
  --requirepass "$password" \
  --dir .data/redis \
  --appendonly yes \
  --maxmemory-policy noeviction
