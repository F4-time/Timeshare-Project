import { apiGet, apiPost } from "@/lib/api";

export type RoomOption = {
  roomTypeId: string;
  code: string;
  name: string;
  description: string | null;
  maxAdults: number;
  maxChildren: number;
  unitsAvailable: number;
  points: number;
  fee: number;
};

export type SearchResult = {
  resort: { id: string; name: string; slug: string | null; location: string | null };
  nights: number;
  checkIn: string;
  checkOut: string;
  options: RoomOption[];
};

export type BookingRow = {
  id: string;
  reference: string;
  status: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  points_used: number;
  nights_used: number;
  total_fees: number;
  resorts: { name: string; location: string | null } | null;
};

export type CreatedBooking = {
  reservationId: string;
  reference: string;
  pointsUsed: number;
  totalFees: number;
  nights: number;
  status: string;
};

export function searchAvailability(p: {
  resortId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
}) {
  const qs = new URLSearchParams({
    resortId: p.resortId,
    checkIn: p.checkIn,
    checkOut: p.checkOut,
    adults: String(p.adults),
    children: String(p.children),
  });
  return apiGet<SearchResult>(`/api/availability/search?${qs.toString()}`);
}

export function createBooking(p: {
  resortId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestName?: string;
}) {
  return apiPost<CreatedBooking>("/api/bookings", p);
}

export function listMyBookings() {
  return apiGet<BookingRow[]>("/api/bookings");
}

export function cancelBooking(id: string, reason?: string) {
  return apiPost<{ ok: true }>(`/api/bookings/${id}/cancel`, { reason });
}

export const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** yyyy-mm-dd, n days from today — used for the date inputs' defaults and min. */
export function isoDaysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
