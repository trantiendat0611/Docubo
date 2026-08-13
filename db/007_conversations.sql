-- Conversations. Run after 006_document_overview.sql.
--
-- Until now a user had one implicit chat over their whole corpus, and the
-- transcript lived in React state — a reload lost it. This adds named
-- conversations, each with its own set of documents, so a question is answered
-- from the documents belonging to the conversation it was asked in.
--
-- Why a join table rather than documents.conversation_id
-- -----------------------------------------------------
-- Vision ingest is the expensive part of this system: roughly four requests per
-- 25-page document against a budget of about twenty per model per day. Pinning
-- a document to exactly one conversation would mean re-ingesting it to ask
-- about it somewhere else, paying that cost again for bytes already extracted.
-- A join row costs nothing and the chunks are reused as they are.

-- ------------------------------------------------------------ conversations
create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  -- Null until the first question arrives; the client names it from that.
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_owner_idx
  on conversations (owner_id, updated_at desc);

-- ------------------------------------------------- conversation ↔ documents
create table if not exists conversation_documents (
  conversation_id uuid not null references conversations (id) on delete cascade,
  document_id     uuid not null references documents (id) on delete cascade,
  -- Denormalised for the same reason chunks.owner_id is: RLS stays a column
  -- comparison instead of a subquery on every retrieval.
  owner_id        uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, document_id)
);

create index if not exists conversation_documents_doc_idx
  on conversation_documents (document_id);

-- ------------------------------------------------------------------ messages
create table if not exists messages (
  id              bigserial primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- Mirrors the response type the chat route returns, so a reloaded transcript
  -- renders refusals and errors the way they were shown originally instead of
  -- promoting every stored row to a normal answer.
  kind            text check (kind in ('answer', 'refusal', 'blocked',
                                       'needs_document', 'error')),
  citations       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on messages (conversation_id, id);

-- -------------------------------------------------------- document identity
-- content_hash was globally unique, but upsert_document looks it up scoped by
-- owner. The two disagree: the lookup finds nothing for a second user, the
-- insert then trips the global constraint, and that user simply cannot ingest a
-- PDF someone else already has. Uniqueness belongs per owner, which is what the
-- application code always assumed.
alter table documents drop constraint if exists documents_content_hash_key;

create unique index if not exists documents_owner_hash_idx
  on documents (owner_id, content_hash);

-- ------------------------------------------------------------------ triggers
-- Ordering the sidebar by "most recently used" requires the parent row to move
-- when a message lands in it. Doing that here rather than in the route means a
-- write path that forgets cannot leave the list stale.
create or replace function conversations_touch() returns trigger
language plpgsql
as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on messages;
create trigger messages_touch_conversation
  after insert on messages
  for each row execute function conversations_touch();

-- ------------------------------------------------------------------ policies
-- Conversations are the one thing here the browser both reads and writes:
-- creating, renaming and deleting a chat is pure UI with no server work to do,
-- and RLS is what makes that safe. Messages stay server-written — they are
-- produced by the route that generates them — so users get select only.

alter table conversations enable row level security;
alter table conversation_documents enable row level security;
alter table messages enable row level security;

drop policy if exists conversations_select_own on conversations;
create policy conversations_select_own on conversations
  for select using (owner_id = auth.uid());

drop policy if exists conversations_insert_own on conversations;
create policy conversations_insert_own on conversations
  for insert with check (owner_id = auth.uid());

drop policy if exists conversations_update_own on conversations;
create policy conversations_update_own on conversations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists conversations_delete_own on conversations;
create policy conversations_delete_own on conversations
  for delete using (owner_id = auth.uid());

drop policy if exists conversation_documents_select_own on conversation_documents;
create policy conversation_documents_select_own on conversation_documents
  for select using (owner_id = auth.uid());

-- Attaching an already-ingested document to another conversation is a UI
-- action with no server work, so the browser may do it. Deleting the link is
-- how a document leaves a conversation without being destroyed.
drop policy if exists conversation_documents_insert_own on conversation_documents;
create policy conversation_documents_insert_own on conversation_documents
  for insert with check (owner_id = auth.uid());

drop policy if exists conversation_documents_delete_own on conversation_documents;
create policy conversation_documents_delete_own on conversation_documents
  for delete using (owner_id = auth.uid());

drop policy if exists messages_select_own on messages;
create policy messages_select_own on messages
  for select using (owner_id = auth.uid());

-- ---------------------------------------------------------- verification
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('conversations','conversation_documents','messages');
--   -- all three true
--
--   select indexname from pg_indexes
--   where tablename = 'documents' and indexname = 'documents_owner_hash_idx';
--   -- one row
--
--   -- the old global constraint is gone:
--   select conname from pg_constraint where conname = 'documents_content_hash_key';
--   -- no rows
