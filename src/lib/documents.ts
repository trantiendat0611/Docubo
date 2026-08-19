import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Delete a document and the file it came from.
 *
 * Everything in Postgres already goes on its own: chunks cascade from the
 * document, ingest_jobs cascades from the document, and document_pages
 * cascades from the job. That chain was verified against the database rather
 * than read off the schema — a document, its job and its page row were
 * inserted and the document deleted, and all three rows went.
 *
 * Storage is the part with no foreign key to ride on. The uploaded PDF sits in
 * the bucket until something removes it explicitly, and with 500MB on the free
 * tier that is a real leak rather than a tidy-up.
 *
 * Two ordering constraints, both easy to get backwards:
 *
 *  - The path is on the job, and the job cascades away with the document, so
 *    it has to be read *before* the delete or it is unrecoverable.
 *  - The row goes first and the file second. If the file removal fails the
 *    result is an orphaned object, which costs storage. The other order can
 *    leave a document whose PDF is gone.
 *
 * Documents ingested by the Python CLI have no job and no uploaded file, so
 * they simply come back with no paths.
 */
export async function deleteDocument(
  client: SupabaseClient,
  documentId: string,
): Promise<{ removedFiles: number }> {
  const { data: jobs } = await client
    .from("ingest_jobs")
    .select("storage_path")
    .eq("document_id", documentId);

  const paths = (jobs ?? [])
    .map((job) => job.storage_path as string | null)
    .filter((path): path is string => Boolean(path));

  await client.from("documents").delete().eq("id", documentId);

  if (paths.length > 0) {
    await client.storage.from("documents").remove(paths);
  }

  return { removedFiles: paths.length };
}
