#!/usr/bin/env bash
# Levanta un PostgreSQL local SOLO para pruebas automáticas y muestra la URL.
# Uso:  npm run db:prueba
#       export DATABASE_URL_PRUEBAS=postgres://facturador:facturador@localhost:54329/facturador_pruebas
#       npm test
# Nunca apuntes DATABASE_URL_PRUEBAS a la base de datos real: las pruebas la reinician.
set -euo pipefail

PUERTO="${PUERTO:-54329}"
DATOS="${DATOS:-${TMPDIR:-/tmp}/facturador-pg-pruebas}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$BIN" ] || { echo "No encontré PostgreSQL instalado." >&2; exit 1; }

correr() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ ! -f "$DATOS/PG_VERSION" ]; then
  mkdir -p "$DATOS"
  [ "$(id -u)" = "0" ] && chown postgres "$DATOS"
  correr "$BIN/initdb -D '$DATOS' -U postgres --auth=trust >/dev/null"
fi
if ! correr "$BIN/pg_ctl -D '$DATOS' status" >/dev/null 2>&1; then
  correr "$BIN/pg_ctl -D '$DATOS' -o '-p $PUERTO -k /tmp' -l '$DATOS/log' start -w >/dev/null"
fi
correr "psql -h localhost -p $PUERTO -U postgres -tc \"SELECT 1 FROM pg_roles WHERE rolname='facturador'\"" | grep -q 1 \
  || correr "psql -h localhost -p $PUERTO -U postgres -c \"CREATE ROLE facturador LOGIN PASSWORD 'facturador'\"" >/dev/null
correr "psql -h localhost -p $PUERTO -U postgres -tc \"SELECT 1 FROM pg_database WHERE datname='facturador_pruebas'\"" | grep -q 1 \
  || correr "psql -h localhost -p $PUERTO -U postgres -c 'CREATE DATABASE facturador_pruebas OWNER facturador'" >/dev/null

echo "postgres://facturador:facturador@localhost:$PUERTO/facturador_pruebas"
