/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The ingest routes read ingest/prompts/page_extract.md at runtime so the
  // Python and TypeScript pipelines share one extraction prompt. Without this,
  // the file is not traced into the serverless bundle and the route fails on
  // Vercel while working perfectly in `next dev`.
  outputFileTracingIncludes: {
    "/api/ingest/**": ["./ingest/prompts/**"],
  },
};

export default nextConfig;
