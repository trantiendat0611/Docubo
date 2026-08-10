-- Hybrid retrieval: three independent ranked lists fused with Reciprocal Rank
-- Fusion (RRF).
--
--   dense   -> cosine similarity, catches paraphrase and cross-language matches
--   lex_en  -> English full-text, catches exact technical terms
--   lex_vi  -> Vietnamese full-text, same job on Vietnamese pages
--
-- RRF score = sum over arms of 1 / (k + rank). It needs no score normalisation
-- between arms, which matters here because cosine distance and ts_rank_cd are
-- on completely different scales.

create or replace function hybrid_search(
  query_embedding   vector(768),
  query_en          text,
  query_vi          text,
  match_limit       int    default 8,
  candidate_limit   int    default 30,
  rrf_k             int    default 60,
  filter_documents  uuid[] default null
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
-- Load-bearing, even though it is the default. The function must run as the
-- caller so that the row-level policies in 004_multi_tenant.sql apply to the
-- tables it reads. Marking it SECURITY DEFINER would make every user search
-- every user's corpus.
security invoker
as $$
  with dense as (
    select c.id,
           row_number() over (order by c.embedding <=> query_embedding) as rank,
           1 - (c.embedding <=> query_embedding) as sim
    from chunks c
    where c.embedding is not null
      and (filter_documents is null or c.document_id = any (filter_documents))
    order by c.embedding <=> query_embedding
    limit candidate_limit
  ),
  lex_en as (
    select c.id,
           row_number() over (order by ts_rank_cd(c.fts_en, q) desc) as rank
    from chunks c, websearch_to_tsquery('english', coalesce(query_en, '')) q
    where c.fts_en @@ q
      and (filter_documents is null or c.document_id = any (filter_documents))
    order by ts_rank_cd(c.fts_en, q) desc
    limit candidate_limit
  ),
  lex_vi as (
    select c.id,
           row_number() over (order by ts_rank_cd(c.fts_vi, q) desc) as rank
    from chunks c, websearch_to_tsquery('simple', coalesce(query_vi, '')) q
    where c.fts_vi @@ q
      and (filter_documents is null or c.document_id = any (filter_documents))
    order by ts_rank_cd(c.fts_vi, q) desc
    limit candidate_limit
  ),
  fused as (
    select s.id, sum(s.score)::real as rrf_score
    from (
      select id, 1.0 / (rrf_k + rank) as score from dense
      union all
      select id, 1.0 / (rrf_k + rank) from lex_en
      union all
      select id, 1.0 / (rrf_k + rank) from lex_vi
    ) s
    group by s.id
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
         f.rrf_score,
         coalesce(dn.sim, 0)::real as cosine_sim
  from fused f
  join chunks c    on c.id = f.id
  join documents d on d.id = c.document_id
  left join dense dn on dn.id = f.id
  order by f.rrf_score desc
  limit match_limit;
$$;

-- Dense-only variant. Used by the eval harness to measure how much the lexical
-- arms actually contribute — report the delta between the two in chapter 4.
create or replace function dense_search(
  query_embedding vector(768),
  match_limit     int default 8
)
returns table (
  id bigint, page_start int, page_end int, display_text text, cosine_sim real
)
language sql stable
security invoker
as $$
  select c.id, c.page_start, c.page_end, c.display_text,
         (1 - (c.embedding <=> query_embedding))::real
  from chunks c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_limit;
$$;
