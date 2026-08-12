// Static for now. The Drizzle client in `src/lib/db.ts` is wired up but not queried
// yet — there is no schema. Once tables exist, make this an async Server Component,
// call `await connection()` from `next/server` to opt out of prerendering, then read
// through `getDb()`.
const TAGLINE = "The Claude consulting arm of Code.Sydney Pty Ltd.";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden>
          🔷
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Bluehex
        </h1>
      </div>

      <p className="max-w-xl text-lg text-black/70 dark:text-white/70">
        {TAGLINE}
      </p>

      <p className="text-sm text-black/40 dark:text-white/40">
        Next.js + Neon template · placeholder page
      </p>
    </main>
  );
}
