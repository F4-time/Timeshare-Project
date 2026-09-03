import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Building2,
  Users,
  PiggyBank,
  RefreshCw,
  Headphones,
  MapPin,
  Search,
  ShieldCheck,
  Globe2,
  ThumbsUp,
  Check,
  CreditCard,
} from "lucide-react";

import heroVilla from "@/assets/hero-villa.jpg";
import lifestyleFamily from "@/assets/lifestyle-family.jpg";
import alpine from "@/assets/resort-alpine.jpg";
import vasindResort from "@/assets/vasind-resort.jpg";
import destLonavala from "@/assets/dest-lonavala.jpg";
import destKarjat from "@/assets/dest-karjat.jpg";
import destIgatpuri from "@/assets/dest-igatpuri.jpg";
import destMahabaleshwar from "@/assets/dest-mahabaleshwar.jpg";
import destAlibaug from "@/assets/dest-alibaug.jpg";
import destMurud from "@/assets/dest-murud.jpg";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forever Timeshare — Your Holiday. Your Forever." },
      {
        name: "description",
        content:
          "Holiday every year at the world's most beautiful destinations. Membership plans, verified resorts, exchange programme and dedicated member support.",
      },
      { property: "og:title", content: "Forever Timeshare — Your Holiday. Your Forever." },
      {
        property: "og:description",
        content: "Vacation ownership with fixed annual holidays across 350+ resorts.",
      },
    ],
  }),
  component: HomePage,
});

const BENEFITS = [
  { icon: CalendarDays, title: "Holiday Every Year", copy: "Enjoy fixed holidays every year" },
  { icon: Building2, title: "350+ Resorts", copy: "Across Europe & internationally" },
  { icon: Users, title: "Family Friendly", copy: "Create unforgettable memories" },
  { icon: PiggyBank, title: "Save More", copy: "Affordable vs annual vacations" },
  { icon: RefreshCw, title: "Exchange Program", copy: "Exchange your holidays anytime" },
  { icon: Headphones, title: "24x7 Support", copy: "We are always here for you" },
];

const DESTINATIONS = [
  { name: "Lonavala", price: "₹2,999", image: destLonavala },
  { name: "Karjat", price: "₹2,499", image: destKarjat },
  { name: "Vasind", price: "₹2,299", image: vasindResort },
  { name: "Igatpuri", price: "₹1,999", image: destIgatpuri },
  { name: "Mahabaleshwar", price: "₹3,499", image: destMahabaleshwar },
  { name: "Alibaug", price: "₹3,999", image: destAlibaug },
  { name: "Murud", price: "₹2,799", image: destMurud },
];

const STATS = [
  { icon: Users, value: "20,000+", label: "Happy Families" },
  { icon: Building2, value: "350+", label: "Resorts" },
  { icon: Globe2, value: "25+", label: "Destinations" },
  { icon: ShieldCheck, value: "10+", label: "Years of Trust" },
  { icon: ThumbsUp, value: "98%", label: "Member Satisfaction" },
];

const SEARCH_FIELDS = [
  { icon: MapPin, label: "Where do you want to go?", value: "Select Destination" },
  { icon: CalendarDays, label: "Check-in", value: "Select Date" },
  { icon: CalendarDays, label: "Check-out", value: "Select Date" },
  { icon: Users, label: "Guests", value: "2 Guests, 1 Room" },
];

function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="gradient-hero relative">
        <div className="grid grid-cols-1 items-stretch lg:grid-cols-2">
          <div className="order-2 w-full px-[clamp(1rem,4vw,4rem)] py-10 sm:py-14 lg:order-1 lg:flex lg:flex-col lg:justify-center lg:py-20 xl:py-24">
            <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:mb-4 sm:text-[11px]">
              Own <span className="text-accent">more than a holiday</span>
            </span>
            <h1 className="font-display text-[2.35rem] leading-[1.08] sm:text-5xl md:text-6xl xl:text-7xl">
              Your Holiday.
              <br />
              <span className="text-gold italic">Your Forever.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:mt-6 sm:text-base lg:max-w-2xl">
              Forever Timeshare gives you the freedom to holiday every year at the world's most
              beautiful destinations with the people you love.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-4">
              <Link
                to="/membership"
                className="inline-flex items-center justify-center gap-2 shine hover-lift gradient-gold rounded-full px-6 py-3 text-sm font-semibold text-accent-foreground shadow-luxe sm:px-7 sm:py-3.5"
              >
                Discover Memberships <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/resorts"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/20 px-6 py-3 text-sm font-semibold transition-colors hover:bg-secondary sm:px-7 sm:py-3.5"
              >
                Explore Destinations <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <ul className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
              {["Verified Resorts", "Best Price Guarantee", "Dedicated Member Support"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="order-1 min-h-0 lg:order-2">
            <img
              src={heroVilla}
              alt="Luxury resort villa with infinity pool overlooking the ocean"
              width={1600}
              height={1104}
              className="h-56 w-full object-cover sm:h-80 lg:h-full lg:min-h-[32rem] lg:rounded-bl-[3rem] xl:min-h-[38rem]"
            />
          </div>
        </div>

        <div className="site-wrap relative z-20 -mt-6 sm:-mt-8 lg:-mt-12">
          <div className="relative z-20 grid grid-cols-1 gap-3 rounded-2xl border border-accent/20 bg-card p-4 shadow-luxe sm:gap-4 sm:p-5 md:grid-cols-2 lg:grid-cols-5">
            {SEARCH_FIELDS.map((field) => (
              <div key={field.label} className="flex items-center gap-3 px-1 sm:px-2">
                <field.icon className="h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-xs text-muted-foreground">{field.label}</div>
                  <div className="truncate text-sm font-medium">{field.value}</div>
                </div>
              </div>
            ))}

            <Link
              to="/resorts"
              className="inline-flex items-center justify-center gap-2 shine gradient-ink rounded-xl px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:py-4 md:col-span-2 lg:col-span-1"
            >
              <Search className="h-4 w-4" /> Search Availability
            </Link>
          </div>
        </div>
      </section>

      {/* Benefit strip */}
      <section className="site-wrap py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-x-2 gap-y-8 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-6">
          {BENEFITS.map((b, i) => (
            <Reveal
              key={b.title}
              delay={i * 70}
              className={`group px-2 text-center sm:px-4 ${i !== 0 ? "lg:border-l lg:border-accent/20" : ""}`}
            >
              <b.icon
                className="mx-auto mb-3 h-8 w-8 text-accent transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110"
                strokeWidth={1.5}
              />
              <div className="text-sm font-semibold">{b.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{b.copy}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Why timeshare */}
      <section className="relative overflow-x-clip bg-linear-to-b from-secondary/70 via-background to-secondary/40 py-14 sm:py-20">
        <div className="site-wrap grid grid-cols-1 items-center gap-10 sm:gap-14 lg:grid-cols-2">
          <div>
            <span className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
              Why Timeshare?
            </span>
            <h2 className="font-display text-3xl leading-tight sm:text-4xl md:text-5xl">
              A Smarter Way
              <br />
              to <span className="text-gold italic">Holiday</span>
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Our vacation ownership programme gives you the right to enjoy luxurious holidays every
              year at a fraction of the cost of regular vacations.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Fixed holidays every year",
                "Luxury stays at affordable prices",
                "More value, more savings",
                "Lifetime of memorable experiences",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent">
                    <Check className="h-3 w-3 text-accent-foreground" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              to="/how-it-works"
              className="mt-8 inline-flex items-center gap-2 hover-lift gradient-ink rounded-full px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-luxe"
            >
              How It Works <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="relative mb-10 sm:mb-6 lg:mb-0">
            <img
              src={lifestyleFamily}
              alt="Family walking together on a tropical beach"
              width={1200}
              height={900}
              loading="lazy"
              className="aspect-4/3 w-full rounded-2xl object-cover shadow-lg"
            />
            <img
              src={alpine}
              alt="Resort balcony overlooking a green mountain valley"
              width={900}
              height={700}
              loading="lazy"
              className="absolute right-3 -bottom-8 hidden w-36 rounded-2xl border-4 border-background object-cover shadow-xl sm:block lg:right-0 lg:w-48 xl:-right-2"
            />
            <div className="absolute -bottom-6 left-3 flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-xl sm:-bottom-8 sm:left-6 sm:px-5 sm:py-4">
              <Users className="h-7 w-7 text-accent" strokeWidth={1.5} />
              <div className="leading-tight">
                <div className="font-display text-xl">20,000+</div>
                <div className="text-xs text-muted-foreground">Happy Families</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Destinations */}
      <section className="site-wrap py-14 sm:py-20">
        <Reveal className="mb-8 text-center sm:mb-10">
          <span className="ornament mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
            Popular Destinations
          </span>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl">
            Explore <span className="text-gold italic">Dream</span> Destinations
          </h2>
        </Reveal>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {DESTINATIONS.map((d, i) => (
            <Reveal key={d.name} delay={i * 80}>
              <Link to="/resorts" className="group card-luxe overflow-hidden rounded-xl shadow-sm">
                <div className="aspect-4/3 overflow-hidden">
                  <img
                    src={d.image}
                    alt={`${d.name} resort destination`}
                    width={900}
                    height={700}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <div className="text-sm font-semibold">{d.name}</div>
                  <div className="text-xs text-muted-foreground">From {d.price} / night</div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Membership banner */}
      <section className="site-wrap pb-14 sm:pb-20">
        <Reveal className="shadow-luxe relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-2xl border border-accent/20 bg-linear-to-br from-secondary via-background to-accent/25 px-5 py-8 sm:px-8 sm:py-10 md:flex-row">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl"
          />
          <div className="flex items-center gap-6">
            <div className="hidden h-24 w-36 rotate-[-8deg] items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xl sm:flex">
              <CreditCard className="h-8 w-8 text-accent" strokeWidth={1.5} />
            </div>
            <div>
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
                Membership Plans
              </span>
              <h2 className="font-display text-2xl sm:text-3xl">Choose a Plan That Suits You</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Flexible plans for every lifestyle and every family.
              </p>
            </div>
          </div>
          <Link
            to="/membership"
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 shine hover-lift gradient-gold rounded-full px-7 py-3.5 text-sm font-semibold text-accent-foreground shadow-luxe sm:w-auto"
          >
            View Membership Plans <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>

      {/* Stats */}
      <section className="site-wrap pb-10">
        <Reveal className="card-luxe grid grid-cols-2 gap-y-6 rounded-2xl px-4 py-6 shadow-luxe sm:gap-y-8 sm:px-6 sm:py-8 md:grid-cols-3 lg:grid-cols-5">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`flex items-center justify-center gap-3 ${i !== 0 ? "lg:border-l lg:border-accent/20" : ""}`}
            >
              <s.icon className="h-7 w-7 text-accent" strokeWidth={1.5} />
              <div className="leading-tight">
                <div className="font-display text-xl">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </Reveal>
      </section>
    </main>
  );
}
