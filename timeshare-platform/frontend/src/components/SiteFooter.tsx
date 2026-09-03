import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Youtube, Linkedin, Mail, Phone, MapPin, Send } from "lucide-react";

import emblem from "@/assets/ft-emblem.png";

const QUICK = [
  { to: "/", label: "Home" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/resorts", label: "Destinations" },
  { to: "/membership", label: "Membership Plans" },
  { to: "/offers", label: "Offers" },
] as const;

const SUPPORT = [
  { to: "/faq", label: "FAQs" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact Us" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border bg-secondary/60 sm:mt-24">
      <div className="site-wrap grid grid-cols-1 gap-10 py-10 sm:py-12 md:grid-cols-2 lg:grid-cols-5 lg:py-14">
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-4">
            <img
              src={emblem}
              alt="Forever Timeshare emblem"
              className="h-12 w-auto shrink-0 mix-blend-multiply sm:h-14"
            />
            <span className="flex flex-col leading-tight">
              <span className="font-serif text-lg font-semibold tracking-tight text-primary sm:text-2xl">
                Forever Timeshare
              </span>
              <span className="mt-1 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.25em] text-accent sm:text-[11px] sm:tracking-[0.3em]">
                Holidays for Generations
              </span>
            </span>
          </div>

          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Creating lifetime memories through extraordinary holidays. Because memories are forever.
          </p>
          <div className="mt-6 flex gap-4 text-muted-foreground">
            <Facebook className="h-5 w-5 transition-colors hover:text-accent" />
            <Instagram className="h-5 w-5 transition-colors hover:text-accent" />
            <Youtube className="h-5 w-5 transition-colors hover:text-accent" />
            <Linkedin className="h-5 w-5 transition-colors hover:text-accent" />
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold">Quick Links</h3>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {QUICK.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="transition-colors hover:text-accent">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold">Member Support</h3>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {SUPPORT.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="transition-colors hover:text-accent">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-semibold">Get In Touch</h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-accent" /> 1800 123 4567
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-accent" />
              <span className="break-all">info@forevertimeshare.com</span>
            </li>
            <li className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>Forever Timeshare Holdings, 12 Harbour Road, Lisbon</span>
            </li>
          </ul>
          <h3 className="mt-6 mb-3 text-sm font-semibold">Newsletter</h3>
          <div className="flex overflow-hidden rounded-md border border-border bg-background">
            <input
              type="email"
              aria-label="Email address"
              placeholder="Enter your email"
              className="w-full bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              aria-label="Subscribe"
              className="bg-accent px-3 text-accent-foreground"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Forever Timeshare. All rights reserved.
      </div>
    </footer>
  );
}
