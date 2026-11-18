#!/usr/bin/env bash
# Builds a throwaway database the way production looks, applies 02→04 (04 twice: re-runnable), runs the readiness check and the functional tests.
# Usage: PGHOST=/var/tmp/pgtest PGPORT=5433 PGUSER=postgres supabase/test/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-ts_test}
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
for f in supabase/test/00_supabase_stub.sql supabase_schema.sql supabase/test/01_live_baseline.sql supabase/02_add_missing.sql supabase/03_pii_guards.sql \
         supabase/04_core_schema.sql supabase/04_core_schema.sql; do
  $P -d $DB -f "$f" 2>&1 | grep -v NOTICE || true
done
bad=$($P -d $DB -tA -f supabase/01_verify.sql | grep -v '|OK$' || true)
if [ -n "$bad" ]; then echo "Readiness check failed:"; echo "$bad"; exit 1; fi
echo "Readiness check: all OK"
$P -d $DB -f supabase/test/10_functional.sql 2>&1 | grep -v '^WARNING:  ok' 
