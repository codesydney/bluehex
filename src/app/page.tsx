import { db } from "@/lib/db";

// Server Component: read directly from SQLite on the server.
export default function Home() {
  const tagline = (
    db.prepare("SELECT value FROM site_meta WHERE key = ?").get("tagline") as
      | { value: string }
      | undefined
  )?.value;

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
        {tagline}
      </p>

      <p className="text-sm text-black/40 dark:text-white/40">
        Next.js + SQLite template · placeholder page
      </p>
    </main>
  );
}
