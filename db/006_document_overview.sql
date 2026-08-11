-- Document-level retrieval. Run after 005_ingest_pages.sql.
--
-- "Summarise this document" is not a retrieval question. Similarity search
-- finds the passages closest to the query, and no passage means "all of it" —
-- so the request returns whatever happens to be vaguely on-topic, from any
-- document in the corpus, and the model answers about the wrong thing.
--
-- Observed exactly that: asking for a summary of one paper returned eight
-- chunks of an unrelated slide deck at cosine 0.64, comfortably above the
-- refusal floor, because both are about machine learning.
--
-- The fix is to stop searching. For a whole-document request, take a spread of
-- chunks across the document in reading order and let the model work from that.

create or replace function document_overview(
  doc         uuid,
  max_chunks  int default 12
)
returns table (
  id           bigint,
  document_id  uuid,
  filename     text,
  title        text,
  page_start   int,
  page_end     int,
  lang         text,
  display_text text,
  figure_refs  jsonb,
  rrf_score    real,
  cosine_sim   real
)
language sql stable
-- Same reasoning as hybrid_search: runs as the caller so the row-level
-- policies apply. A user must not be able to summarise a document they cannot
-- read.
security invoker
as $$
  with numbered as (
    select c.id,
           c.chunk_index,
           -- Bucket the document into max_chunks slices and take the first
           -- chunk of each. Reading the opening N chunks instead would
           -- summarise the introduction and miss everything after it.
           ntile(max_chunks) over (order by c.chunk_index) as bucket
    from chunks c
    where c.document_id = doc
  ),
  picked as (
    select distinct on (bucket) id
    from numbered
    order by bucket, chunk_index
  )
  select c.id,
         c.document_id,
         d.filename,
         d.title,
         c.page_start,
         c.page_end,
         c.lang,
         c.display_text,
         c.figure_refs,
         -- Scored so the caller can treat these rows exactly like search
         -- results. There is no similarity here — the document was chosen, not
         -- matched — and reporting a fake similarity would make the refusal
         -- threshold compare two different things.
         1.0::real as rrf_score,
         1.0::real as cosine_sim
  from picked p
  join chunks c    on c.id = p.id
  join documents d on d.id = c.document_id
  order by c.chunk_index;
$$;

-- Verify against a document you own:
--   select page_start, page_end from document_overview('<uuid>', 12);
--   -- rows should span the document, not cluster at the start
