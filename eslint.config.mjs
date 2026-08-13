import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext's Cloudflare bundle: generated output, and large enough
    // that linting it exhausts V8's heap.
    ".open-next/**",
    // Wrangler bundles the worker into .wrangler/tmp on every dev run and
    // leaves it there. Thousands of generated files, and linting them is
    // what exhausted the heap.
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
