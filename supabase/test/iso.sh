#!/usr/bin/env bash
# Fresh database from the real scripts, then the tenant-isolation attack suite. Usage: PGHOST=… PGPORT=… PGUSER=postgres supabase/test/iso.sh
set -euo pipefail; cd "$(dirname "$0")/../.."
DB=${TEST_DB:-ts_iso}; P="psql -v ON_ERROR_STOP=1 -q -X"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
for f in supabase/test/00_supabase_stub.sql supabase_schema.sql supabase/test/01_live_baseline.sql supabase/02_add_missing.sql supabase/03_pii_guards.sql supabase/04_core_schema.sql ${EXTRA_SQL:-}; do
  $P -d $DB -f "$f" 2>&1 | grep -v NOTICE || true
done
$P -d $DB -tA -f supabase/test/20_tenant_isolation.sql 2>&1 | grep -v '^$'
