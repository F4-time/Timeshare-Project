import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Loader2, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shared error boundary for any route with a loader or data fetch. */
export function RouteError({ error, reset }: { error: Error; reset?: () => void }) {
  const router = useRouter();
  console.error(error);

  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-6 font-display text-2xl">We couldn't load this page</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The request didn't complete. This is usually temporary — try again in a moment.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button
          onClick={() => {
            router.invalidate();
            reset?.();
          }}
        >
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </section>
  );
}

/** Shared not-found state for routes that resolve records by slug or id. */
export function RouteNotFound({
  title = "Not found",
  message = "This page doesn't exist, or it has been moved.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-6 font-display text-2xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </section>
  );
}

/** Shared loading state so no route ever flashes a blank screen. */
export function RoutePending({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground"
    >
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <p className="text-sm">{label}…</p>
    </div>
  );
}
