import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Phone, UserRound, Menu } from "lucide-react";

import { useAuthSession } from "@/hooks/useAuthSession";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import emblem from "@/assets/ft-emblem.png";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/resorts", label: "Destinations" },
  { to: "/membership", label: "Membership Plans" },
  { to: "/offers", label: "Offers" },
  { to: "/about", label: "About Us" },
  { to: "/faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  const { user } = useAuthSession();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="site-wrap flex items-center justify-between gap-2 py-2.5 sm:gap-4 sm:py-3">
        <Link to="/" className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
          <img
            src={emblem}
            alt="Forever Timeshare emblem"
            className="h-8 w-auto shrink-0 mix-blend-multiply sm:h-10 lg:h-11"
          />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate font-serif text-base font-semibold tracking-tight text-primary sm:text-xl lg:text-[1.35rem] xl:text-[1.6rem]">
              Forever Timeshare
            </span>
            <span className="mt-1 hidden whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.22em] text-accent sm:block sm:text-[10px] xl:text-[11px] xl:tracking-[0.3em]">
              Holidays for Generations
            </span>
          </span>
        </Link>

        <div className="hidden min-w-0 items-center gap-2.5 text-xs font-medium lg:flex xl:gap-6 xl:text-sm">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="shrink-0 whitespace-nowrap pb-1 transition-colors hover:text-accent"
              activeOptions={{ exact: item.to === "/" }}
              activeProps={{ className: "text-accent border-b-2 border-accent" }}
            >
              {item.to === "/membership" ? (
                <>
                  <span className="xl:hidden">Membership</span>
                  <span className="hidden xl:inline">Membership Plans</span>
                </>
              ) : (
                item.label
              )}
            </Link>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <div className="hidden items-center gap-2 2xl:flex">
            <Phone className="h-4 w-4 text-accent" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">1800 123 4567</div>
              <div className="text-[10px] text-muted-foreground">Mon–Sun 9:00 AM – 8:00 PM</div>
            </div>
          </div>

          <Link
            to={user ? "/portal" : "/auth"}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-2 text-[11px] font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90 sm:px-5 sm:py-2.5 sm:text-xs"
          >
            <UserRound className="h-4 w-4" />
            <span className="hidden xl:inline">{user ? "My Portal" : "Login / Register"}</span>
            <span className="xl:hidden">{user ? "Portal" : "Login"}</span>
          </Link>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="cursor-pointer lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="mt-6 flex flex-col gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-3 text-base font-medium transition-colors hover:bg-secondary hover:text-accent"
                    activeOptions={{ exact: item.to === "/" }}
                    activeProps={{ className: "bg-secondary text-accent" }}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  to="/contact"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-base font-medium transition-colors hover:bg-secondary hover:text-accent"
                  activeProps={{ className: "bg-secondary text-accent" }}
                >
                  Contact Us
                </Link>
              </div>

              <div className="mt-8 rounded-lg border border-border bg-secondary/50 p-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-accent" />
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">1800 123 4567</div>
                    <div className="text-[10px] text-muted-foreground">
                      Mon–Sun 9:00 AM – 8:00 PM
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
