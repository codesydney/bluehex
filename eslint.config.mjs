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

    // Git worktrees. Claude Code checks branches out under here, and each one is a
    // full copy of this repository — its own `src/`, its own `e2e/`, and its own
    // `.next/` once anything has been built or served in it. On a checkout with a few
    // worktrees `pnpm lint` reports upwards of 11,000 problems in generated Turbopack
    // chunks nobody wrote, which reads as "you broke the repo" rather than as noise.
    //
    // The reason `.next/**` above does not already cover it is the part worth knowing:
    // ESLint makes each candidate path relative to the config's `basePath` — the
    // directory holding this file — and runs `minimatch` on that relative string. So
    // `.next/**` means `<repo>/.next/**` and matches nothing at any greater depth; a
    // pattern intended to match anywhere needs a leading `**/`. The same is true of
    // every other entry here.
    //
    // This is *not* gitignore semantics, which is the trap. Under those, a pattern
    // with no slash in it matches at any depth — so `next-env.d.ts` above would cover
    // a nested one. It does not. Confirmed both ways rather than reasoned about: a
    // planted `nested/.next/probe.ts` and a planted `nested/next-env.d.ts` are each
    // linted, not ignored.
    //
    // Narrowed to `worktrees/` because that is where the problem is, and not to keep
    // `.claude/skills/` lintable — it is not linted from here either way. Those are
    // symlinks into `.agents/skills/`, and ESLint does not follow symlinked
    // directories: Node reports them with `isDirectory() === false`, and the walker
    // only recurses when that is true. Skills are linted, but through `.agents/`,
    // their real location. Verified by planting a file in a skill and watching it
    // reported once, as `.agents/...`, then adding `.agents/**` here and watching it
    // disappear rather than resurface under `.claude/`. So a future change ignoring
    // `.claude/**` wholesale would cost nothing — worth knowing before someone talks
    // themselves out of it to protect something that was never protected.
    ".claude/worktrees/**",

    // Agent scratch space, git-ignored for the same reason it is ignored here: nothing
    // in it is ours. Empty of anything lintable today — it holds handoff notes and
    // ticket drafts — so this is the class of problem above being closed rather than a
    // failure being fixed.
    ".scratch/**",
  ]),
]);

export default eslintConfig;
