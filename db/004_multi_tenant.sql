-- Multi-tenancy. Run after 003_security.sql.
--
-- Users upload their own documents, so isolation has to be real. It is enforced
-- in the database rather than in application code: the query path runs under
-- the user's JWT and RLS decides what exists. A missing `where owner_id = ...`
-- in a route handler then returns nothing instead of returning someone else's
-- corpus.
--
-- Writes stay on the service_role key, which bypasses RLS, and set owner_id
-- explicitly. That split — reads under the user, writes under the server — is
-- what makes the read path safe by construction.

-- ------------------------------------------------------------------- columns
-- Nullable on purpose. Rows with a NULL owner are invisible to every
-- authenticated user, because `null = auth.uid()` is null, never true. That is
-- exactly the right behaviour for the CLI dev flow, which ingests without a
-- logged-in user, and for the test data already in the table.
alter table documents add column if not exists
  owner_id uuid references auth.users (id) on delete cascade;

alter table chunks add column if not exists
  owner_id uuid references auth.users (id) on delete cascade;

alter table query_log add column if not exists
  user_id uuid references auth.users (id) on delete set null;

create index if not exists documents_owner_idx on documents (owner_id);
create index if not exists chunks_owner_idx on chunks (owner_id);

-- Page count, so the upload path can reject oversized documents before it
-- spends any quota on them.
alter table documents add column if not exists
  page_limit_exceeded boolean not null default false;

-- ------------------------------------------------------------ owner sync
-- chunks.owner_id is denormalised from its parent document so RLS on chunks is
-- a column comparison rather than a subquery on every row of every search.
-- The trigger keeps the two in step, which removes the possibility of an insert
-- path forgetting to set it.
create or replace function chunks_owner_sync() returns trigger
language plpgsql
as $$
begin
  if new.owner_id is null then
    select d.owner_id into new.owner_id from documents d where d.id = new.document_id;
  end if;
  return new;
end;
$$;

drop trigger if exists chunks_owner_trg on chunks;
create trigger chunks_owner_trg
  before insert on chunks
  for each row execute function chunks_owner_sync();

-- ------------------------------------------------------------------ policies
-- 003_security.sql enabled RLS with no policies at all, which denied everyone
-- but service_role. Now that there are real users, they get read access to
-- their own rows and nothing else.
--
-- Read-only by design: uploads and ingest go through server routes holding the
-- service_role key, so there is no reason for a browser session to ever hold
-- insert or update rights on these tables.

drop policy if exists documents_select_own on documents;
create policy documents_select_own on documents
  for select using (owner_id = auth.uid());

drop policy if exists documents_delete_own on documents;
create policy documents_delete_own on documents
  for delete using (owner_id = auth.uid());

drop policy if exists chunks_select_own on chunks;
create policy chunks_select_own on chunks
  for select using (owner_id = auth.uid());

-- query_log stays write-only from the server and unreadable by users. It exists
-- for the evaluation chapter, not as a feature.

-- --------------------------------------------------------------- ingest jobs
-- A 25-page upload takes minutes, far past the Vercel Hobby function limit, so
-- ingest runs as a sequence of short steps. This table is what makes that
-- resumable and what the progress bar reads from.
create table if not exists ingest_jobs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  document_id   uuid references documents (id) on delete cascade,
  filename      text not null,
  storage_path  text not null,
  n_pages       int  not null,
  pages_done    int  not null default 0,
  status        text not null default 'pending'
                check (status in ('pending', 'rendering', 'extracting',
                                  'indexing', 'done', 'failed')),
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ingest_jobs_owner_idx on ingest_jobs (owner_id, created_at desc);

alter table ingest_jobs enable row level security;

drop policy if exists ingest_jobs_select_own on ingest_jobs;
create policy ingest_jobs_select_own on ingest_jobs
  for select using (owner_id = auth.uid());

-- ---------------------------------------------------------- verification
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('documents','chunks','query_log','ingest_jobs');
--   -- all four true
--
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename;
--   -- documents: select + delete, chunks: select, ingest_jobs: select
--   -- query_log: none, deliberately
