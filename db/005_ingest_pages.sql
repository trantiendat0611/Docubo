-- Page cache for the browser-driven upload path. Run after 004_multi_tenant.sql.
--
-- The CLI keeps one JSON file per page under data/cache, which is what makes it
-- safe to re-chunk or swap the embedding model without spending vision quota
-- again. The uploaded path needs the same property, and a Vercel function has
-- no durable disk, so the cache lives here instead.
--
-- Why a table rather than a jsonb column on ingest_jobs: a 25-page upload is 25
-- independent extractions arriving across several requests. Separate rows let a
-- step write only what it produced, and let a retried step be idempotent.

create table if not exists document_pages (
  id            bigserial primary key,
  job_id        uuid not null references ingest_jobs (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  page          int  not null,

  -- The vision model's output, stored exactly as returned. Same shape as
  -- ingest/pipeline/models.py PageExtraction, so both pipelines produce a
  -- cache the chunker can read.
  content       jsonb not null,
  extracted_by  text,

  created_at    timestamptz not null default now(),
  unique (job_id, page)
);

create index if not exists document_pages_job_idx on document_pages (job_id, page);

alter table document_pages enable row level security;

drop policy if exists document_pages_select_own on document_pages;
create policy document_pages_select_own on document_pages
  for select using (owner_id = auth.uid());

-- ------------------------------------------------------------------ storage
-- Original PDFs, so a document can be re-processed without a second upload,
-- and so the citation panel can eventually show the real page.
--
-- Private bucket: reads go through signed URLs issued by the server, never by
-- making the bucket public.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Objects are keyed <user-id>/<timestamp>-<filename>, so the owner check is the
-- first path segment. Uploads are performed server-side with the service-role
-- key; these policies exist so a user can read back their own files and delete
-- them, and nothing more.
drop policy if exists documents_read_own on storage.objects;
create policy documents_read_own on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists documents_delete_own on storage.objects;
create policy documents_delete_own on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --------------------------------------------------------- job progress
-- Called by the ingest step so the client's progress bar has a single source of
-- truth. SECURITY DEFINER because it writes, and the caller is a signed-in user
-- whose policies are read-only by design — the owner check is done here instead.
create or replace function bump_job_progress(
  job uuid,
  pages_added int,
  new_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update ingest_jobs
     set pages_done = least(pages_done + pages_added, n_pages),
         status     = coalesce(new_status, status),
         updated_at = now()
   where id = job
     and owner_id = auth.uid();

  if not found then
    raise exception 'job not found or not yours';
  end if;
end;
$$;

-- ---------------------------------------------------------- verification
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename = 'document_pages';
--   select id, public from storage.buckets where id = 'documents';
