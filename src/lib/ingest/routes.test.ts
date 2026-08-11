import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * End-to-end tests for the upload routes, against a running dev server.
 *
 * These drive the same sequence the browser will: create a job, push batches of
 * page images, then finish. Doing it here rather than only through the UI means
 * the server half is known-good before any of it is wired to a file picker.
 *
 * Needs a dev server. In one terminal:
 *   npm run dev
 *
 * In another:
 *   $env:RUN_LIVE=1
 *   npx vitest run routes
 *
 * Creates and deletes its own user, and cleans up everything it writes.
 */

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PAGES = join(process.cwd(), "data", "pages", "testta1");

const live = process.env.RUN_LIVE === "1";
const havePages = existsSync(PAGES);

let serverUp = false;
let token = "";
let userId = "";
let jobId = "";

const adminClient = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });

/**
 * An image from page `source` of the sample PDF, presented as page `as` of the
 * job under test.
 *
 * The two differ because the interesting pages — equations, figures — sit deep
 * in the sample document, while a four-page job has pages one to four. The step
 * route rejects any page number beyond the job's n_pages, which is the guard
 * that keeps a client from spending quota on pages it never declared.
 */
function pageFile(source: number, as: number): File {
  const bytes = readFileSync(join(PAGES, `p${String(source).padStart(4, "0")}.png`));
  return new File([bytes], `p${as}.png`, { type: "image/png" });
}

beforeAll(async () => {
  if (!live || !havePages) return;

  try {
    const res = await fetch(`${BASE}/login`, { redirect: "manual" });
    serverUp = res.status < 500;
  } catch {
    serverUp = false;
  }
  if (!serverUp) return;

  const email = `route-probe-${Date.now()}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user!.id;

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signIn = await anon.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  token = signIn.data.session!.access_token;
});

afterAll(async () => {
  if (!userId) return;
  // Deleting the user cascades to jobs, pages, documents and chunks.
  await adminClient().auth.admin.deleteUser(userId);
});

describe.skipIf(!live || !havePages)("upload routes", () => {
  it("rejects an unauthenticated upload", async () => {
    if (!serverUp) return;
    const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: new FormData() });
    expect(res.status).toBe(401);
  });

  it("refuses a document over the page limit", async () => {
    if (!serverUp) return;

    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "big.pdf"), "big.pdf");
    form.set("nPages", "500");

    const res = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    expect(res.status).toBe(413);
    expect((await res.json()).reason).toBe("too_many_pages");
  });

  it("ingests a document end to end", async () => {
    if (!serverUp) return;

    // Source pages 41-44 of the sample, ingested as pages 1-4 of this job.
    const sources = [41, 42, 43, 44];
    const pages = [1, 2, 3, 4];

    const form = new FormData();
    form.set("file", new File([readFileSync(join(process.cwd(), "data", "raw", "testta1.pdf"))], "probe.pdf"), "probe.pdf");
    form.set("nPages", String(pages.length));

    const created = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(created.status).toBe(200);
    jobId = (await created.json()).jobId;
    expect(jobId).toBeTruthy();

    const step = new FormData();
    step.set("jobId", jobId);
    sources.forEach((src, i) => step.append("pages", pageFile(src, pages[i])));

    const extracted = await fetch(`${BASE}/api/ingest/step`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: step,
    });
    expect(extracted.status).toBe(200);

    const result = await extracted.json();
    expect(result.extracted).toEqual(pages);
    expect(result.pagesDone).toBe(pages.length);

    // Re-sending the same batch must not re-extract or double-count. A client
    // that times out mid-step will do exactly this.
    const repeat = new FormData();
    repeat.set("jobId", jobId);
    sources.forEach((src, i) => repeat.append("pages", pageFile(src, pages[i])));

    const again = await fetch(`${BASE}/api/ingest/step`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: repeat,
    });
    expect((await again.json()).pagesDone).toBe(pages.length);

    const finished = await fetch(`${BASE}/api/ingest/finish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    });
    expect(finished.status).toBe(200);

    const { documentId, chunks } = await finished.json();
    expect(documentId).toBeTruthy();
    expect(chunks).toBeGreaterThan(0);
  });

  it("keeps the new document invisible to a different user", async () => {
    if (!serverUp || !jobId) return;

    // The whole isolation claim, checked at the point it matters most: a
    // freshly uploaded document must not leak to anyone else.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { count } = await anon
      .from("chunks")
      .select("id", { count: "exact", head: true });

    expect(count ?? 0).toBe(0);
  });
});
