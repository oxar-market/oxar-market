#!/usr/bin/env bash
# SQL-тесты инвариантов базы (supabase/tests/*.test.sql).
#
# Каждый файл - в своей транзакции, которая откатывается: тестовые люди и
# строки в базе не остаются, поэтому гонять можно и на общей локальной базе.
# Миграции, которых в базе ещё нет, подаются в ту же транзакцию через APPLY:
#   APPLY="supabase/migrations/2026..._x.sql" scripts/sql-tests.sh
set -euo pipefail
DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
for test in supabase/tests/*.test.sql; do
  echo "== $test"
  {
    echo "begin;"
    for migration in ${APPLY:-}; do echo "\\i $migration"; done
    echo "\\i $test"
    echo "rollback;"
  } | psql "$DB" -v ON_ERROR_STOP=1 -q -X -t
done
