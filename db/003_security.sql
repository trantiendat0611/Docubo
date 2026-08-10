-- Row Level Security. Run this last.
--
-- Supabase leaves RLS off for tables created through the SQL editor. That is a
-- real exposure here: the project's anon key is designed to ship to browsers,
-- and with RLS off it can read every table. Anyone who obtained it could dump
-- the whole corpus and the query log.
--
-- Docubo never reads from the browser. Every query goes through /api/chat on
-- the server using the service_role key, and service_role bypasses RLS
-- entirely. So the correct configuration is: enable RLS, and write no policies
-- at all.
--
-- RLS enabled with zero policies denies `anon` and `authenticated` completely
-- while leaving the server path untouched. Adding a permissive policy "so it
-- works" would undo the whole point — if something breaks after this file, the
-- cause is code reaching the database with the wrong key, not a missing policy.

alter table documents enable row level security;
alter table chunks    enable row level security;
alter table query_log enable row level security;

-- Verify: this should return three rows, all with rowsecurity = true.
--
--   select tablename, rowsecurity
--   from pg_tables
--   where schemaname = 'public'
--     and tablename in ('documents', 'chunks', 'query_log');
--
-- And this should return zero rows — no policies is the intended state:
--
--   select * from pg_policies where schemaname = 'public';
