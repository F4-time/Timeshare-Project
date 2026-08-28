import type { ReactNode } from "react";

export function PageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: string;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-10 max-w-3xl sm:mb-16">
        <span className="mb-4 block text-[10px] font-medium uppercase tracking-[0.3em] text-accent">
          {eyebrow}
        </span>
        <h1 className="mb-6 font-display text-3xl italic leading-[1.15] sm:text-5xl md:text-6xl md:leading-[1.1]">
          {title}
        </h1>
        {intro ? (
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{intro}</p>
        ) : null}
      </header>
      {children}
    </main>
  );
}
