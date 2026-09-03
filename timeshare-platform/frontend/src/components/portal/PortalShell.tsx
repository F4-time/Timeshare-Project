import { Link, useNavigate, useRouterState, type LinkProps } from "@tanstack/react-router";
import { useState, type ComponentType, type ReactNode } from "react";
import { ChevronLeft, LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/hooks/useAccount";
import { initialsOf } from "@/lib/account-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import emblem from "@/assets/ft-emblem.png";

export type PortalNavItem = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Omitted while the destination route has not been built yet. */
  to?: LinkProps["to"];
};

export function PortalShell({
  title,
  nav,
  children,
}: {
  title: string;
  nav: PortalNavItem[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: account } = useAccount();

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      navigate({ to: "/auth", replace: true });
    }
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {open && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-background transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img
              src={emblem}
              alt="Forever Timeshare"
              className="h-10 w-auto mix-blend-multiply"
            />
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {nav.map((item) =>
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  pathname === item.to || pathname.startsWith(`${item.to}/`)
                    ? "bg-accent/15 font-medium text-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground/50"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[9px] uppercase tracking-widest">Soon</span>
              </span>
            ),
          )}
        </nav>

        <div className="border-t border-border p-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to website
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {account?.profile?.full_name ?? account?.profile?.email ?? "Welcome"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {account?.roles?.join(" · ") || "Loading account…"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initialsOf(account)}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} className="shrink-0 px-2 sm:px-3">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PortalPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="w-full">
      <h1 className="font-serif text-2xl sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function ComingSoon({ note }: { note: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}
