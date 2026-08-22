import { signOut } from "@/lib/auth/actions";

/**
 * Sign out. A form rather than a link, because signing out changes state and a
 * `GET` that changes state is one prefetch away from doing it by accident.
 */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex h-11 items-center rounded-full border border-stroke-strong px-5 text-sm font-medium transition-colors hover:bg-ink hover:text-t-invert"
      >
        Sign out
      </button>
    </form>
  );
}
