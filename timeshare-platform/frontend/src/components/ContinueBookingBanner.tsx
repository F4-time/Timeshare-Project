import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";

import { getBookingIntent } from "@/lib/booking-intent";
import { formatDate } from "@/lib/booking-api";

/** Shown on dashboard/membership pages when a booking search was interrupted by the plan-selection redirect. */
export function ContinueBookingBanner() {
  const intent = getBookingIntent();
  if (!intent) return null;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p>
          <span className="font-medium text-foreground">Pick up where you left off</span> — you were booking{" "}
          <span className="font-medium text-foreground">{intent.resortName}</span> for{" "}
          {formatDate(intent.checkIn)} – {formatDate(intent.checkOut)}.
        </p>
      </div>
      <Link
        to="/resorts/$slug"
        params={{ slug: intent.resortSlug }}
        className="inline-flex shrink-0 items-center gap-1 font-medium text-accent underline-offset-4 hover:underline"
      >
        Continue booking <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
