// `server-only` throws by design when resolved outside a React Server
// Component graph, which is exactly what vitest is. Aliasing it to this empty
// module lets the ingest modules be tested directly while the real package
// still guards the Next.js build.
export {};
