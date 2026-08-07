"""Ingest pipeline stages.

The stages are deliberately separate modules with file boundaries between them,
so any stage can be re-run without re-running the expensive one before it:

    render  ->  data/pages/<doc>/p0042.png
    vision  ->  data/cache/<doc>/p0042.json     <- the only stage that costs quota
    chunk   ->  in-memory Chunk list
    embed   ->  vectors
    store   ->  supabase

Rule for the whole pipeline: never call the vision model for a page whose cache
file already exists. Re-running the chunker or swapping the embedding model must
cost zero vision requests.
"""
