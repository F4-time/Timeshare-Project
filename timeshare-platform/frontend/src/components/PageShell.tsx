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
    <main className="site-wrap w-full py-8 sm:py-12 lg:py-16">
      <header className="mb-8 max-w-4xl sm:mb-12 lg:mb-16">
        <span className="mb-3 block text-[10px] font-medium uppercase tracking-[0.3em] text-accent sm:mb-4">
          {eyebrow}
        </span>
        <h1 className="mb-4 font-display text-3xl italic leading-[1.15] sm:mb-6 sm:text-5xl lg:text-6xl lg:leading-[1.1]">
          {title}
        </h1>
        {intro ? (
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base lg:text-lg">{intro}</p>
        ) : null}
      </header>
      {children}
    </main>
  );
}
