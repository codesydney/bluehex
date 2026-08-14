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

    // Scratch space the Supabase CLI writes while the local stack runs. It is
    // git-ignored by supabase/.gitignore, but ESLint does not read nested .gitignore
    // files, so without this `pnpm lint` fails with ~150 errors in a bundled Deno
    // entrypoint nobody wrote.
    "supabase/.temp/**",
    "supabase/.branches/**",
  ]),
]);

export default eslintConfig;
