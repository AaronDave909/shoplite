#!/usr/bin/env bash
# Runs once, when a Postgres container starts with an empty data volume
# (mounted into /docker-entrypoint-initdb.d by docker-compose.yml).
# Creates the `datadog` user and helpers that Database Monitoring (DBM) needs:
# https://docs.datadoghq.com/database_monitoring/setup_postgres/selfhosted/
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v dd_password="${DD_POSTGRES_PASSWORD:?DD_POSTGRES_PASSWORD is not set}" <<'SQL'
CREATE USER datadog WITH PASSWORD :'dd_password';
ALTER ROLE datadog INHERIT;
GRANT pg_monitor TO datadog;

CREATE SCHEMA IF NOT EXISTS datadog;
GRANT USAGE ON SCHEMA datadog TO datadog;
GRANT USAGE ON SCHEMA public TO datadog;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA public;

-- Lets the Agent collect execution plans without the datadog user reading table data.
CREATE OR REPLACE FUNCTION datadog.explain_statement(
   l_query TEXT,
   OUT explain JSON
)
RETURNS SETOF JSON AS
$$
DECLARE
curs REFCURSOR;
plan JSON;
BEGIN
   OPEN curs FOR EXECUTE pg_catalog.concat('EXPLAIN (FORMAT JSON) ', l_query);
   FETCH curs INTO plan;
   CLOSE curs;
   RETURN QUERY SELECT plan;
END;
$$
LANGUAGE 'plpgsql'
RETURNS NULL ON NULL INPUT
SECURITY DEFINER;
SQL
