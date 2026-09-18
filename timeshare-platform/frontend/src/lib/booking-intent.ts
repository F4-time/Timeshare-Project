/**
 * Remembers which property + dates a signed-in member was searching before being
 * redirected to choose a membership plan (booking requires a linked plan), so the
 * dashboard/membership pages can offer a "Continue booking" link back to that exact
 * search. Stored in sessionStorage so it survives the plan-selection redirect.
 */
const KEY = "bookingIntent";

export type BookingIntent = {
  resortSlug: string;
  resortName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
};

export function setBookingIntent(intent: BookingIntent) {
  sessionStorage.setItem(KEY, JSON.stringify(intent));
}

export function getBookingIntent(): BookingIntent | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BookingIntent;
  } catch {
    return null;
  }
}

export function clearBookingIntent() {
  sessionStorage.removeItem(KEY);
}
