import { FlatCompat } from "@eslint/eslintrc";

// `next lint` is deprecated in Next 15 and removed in Next 16, and with no
// config file it drops into an interactive prompt — which hangs CI rather than
// failing it. This is the ESLint CLI flat config it wants instead.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "data/**",
      "ingest/**",
      "eval/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
