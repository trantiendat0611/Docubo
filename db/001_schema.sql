-- Docubo schema. Run in the Supabase SQL editor, in file-number order.
--
-- Bilingual design note
-- ---------------------
-- One shared vector space for both languages (the Gemini embedding model is
-- multilingual, so an English chunk and a Vietnamese question still land near
-- each other). Full-text is the opposite: Postgres ships an English stemmer but
-- has no Vietnamese dictionary, so lexical search needs one column per language
-- with a different text search config each.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- documents
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  filename      text not null,
  title         text,
  source_url    text,
  lang          text not null check (lang in ('en', 'vi', 'mixed')),
  n_pages       int,
  -- sha256 of the source file. Lets ingest skip a document it has already
  -- processed instead of burning vision quota a second time.
  content_hash  text not null unique,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------- chunks
create table if not exists chunks (
  id            bigserial primary key,
  document_id   uuid not null references documents (id) on delete cascade,
  chunk_index   int  not null,

  -- Citation target. A chunk may span a page break, hence start/end.
  page_start    int  not null,
  page_end      int  not null,

  lang          text not null check (lang in ('en', 'vi', 'mixed')),

  -- The dual representation, the core idea of this project:
  --   display_text -> markdown with LaTeX intact. Sent to the LLM, rendered by KaTeX.
  --   embed_text   -> plain prose. Formulas replaced by their spoken reading,
  --                   figures replaced by their description. This is what gets
  --                   embedded and full-text indexed, because raw LaTeX embeds
  --                   into near-meaningless vectors.
  display_text  text not null,
  embed_text    text not null,

  embedding     vector(768),

  -- Populated by the trigger below from embed_text, one per language.
  fts_en        tsvector,
  fts_vi        tsvector,

  has_formula   boolean not null default false,
  has_figure    boolean not null default false,
  -- [{ "id": "fig-87-1", "kind": "chart", "caption": "...", "image_path": "..." }]
  figure_refs   jsonb   not null default '[]'::jsonb,

  n_tokens      int,
  created_at    timestamptz not null default now(),

  unique (document_id, chunk_index)
);

-- ------------------------------------------------------------- fts trigger
create or replace function chunks_fts_update() returns trigger
language plpgsql
as $$
begin
  if new.lang in ('en', 'mixed') then
    new.fts_en := to_tsvector('english', coalesce(new.embed_text, ''));
  else
    new.fts_en := null;
  end if;

  -- 'simple' = lowercase + tokenize, no stemming, no stopwords. The best
  -- Postgres can do for Vietnamese without a custom dictionary.
  if new.lang in ('vi', 'mixed') then
    new.fts_vi := to_tsvector('simple', coalesce(new.embed_text, ''));
  else
    new.fts_vi := null;
  end if;

  return new;
end;
$$;

drop trigger if exists chunks_fts_trg on chunks;
create trigger chunks_fts_trg
  before insert or update of embed_text, lang on chunks
  for each row execute function chunks_fts_update();

-- ------------------------------------------------------------------ indexes
-- HNSW over cosine distance. Build this AFTER the first bulk load — creating it
-- on an empty table then inserting is slower than the reverse.
create index if not exists chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops);

create index if not exists chunks_fts_en_idx on chunks using gin (fts_en);
create index if not exists chunks_fts_vi_idx on chunks using gin (fts_vi);
create index if not exists chunks_document_id_idx on chunks (document_id);

-- --------------------------------------------------------------- query log
-- Feeds the "Kết quả đánh giá" chapter: which questions got refused, how often
-- retrieval came back empty, latency.
create table if not exists query_log (
  id            bigserial primary key,
  question      text not null,
  question_lang text,
  blocked_by    text,          -- null | 'injection' | 'too_long' | 'no_context'
  top_score     real,
  n_results     int,
  latency_ms    int,
  created_at    timestamptz not null default now()
);
