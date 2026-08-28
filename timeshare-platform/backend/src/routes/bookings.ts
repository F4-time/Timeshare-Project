import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { supabaseForUser } from "../supabase.js";

export const bookingRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const createSchema = z.object({
  resortId: z.string().uuid(),
  roomTypeId: z.string().uuid(),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1).max(20).default(2),
  children: z.number().int().min(0).max(20).default(0),
  guestName: z.string().trim().max(120).optional(),
});

/**
 * Maps a Postgres error from book_stay onto an HTTP status.
 * P0001 raise_exception -> the rule the member broke (409)
 * P0002 no_data_found   -> nothing matched (404)
 * 40001 serialization   -> lost a race, retrying may succeed (409)
 * 23P01 exclusion       -> another booking took the unit first (409)
 */
function bookingError(code: string | undefined, message: string): HttpError {
  if (code === "23P01" || code === "40001") {
    return new HttpError(409, "Those dates were just taken. Please search again.");
  }
  if (code === "P0002") return new HttpError(404, message);
  if (code === "28000") return new HttpError(401, message);
  if (code === "42501") return new HttpError(403, message);
  return new HttpError(409, message);
}

/** Creates a reservation. All validation happens inside book_stay, in one transaction. */
bookingRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const b = parsed.data;

    // Called as the user so auth.uid() inside the function is their id — they
    // cannot book on anyone else's behalf.
    const db = supabaseForUser(req.auth!.accessToken);
    const { data, error } = await db.rpc("book_stay", {
      _resort_id: b.resortId,
      _room_type_id: b.roomTypeId,
      _check_in: b.checkIn,
      _check_out: b.checkOut,
      _adults: b.adults,
      _children: b.children,
      _guest_name: b.guestName ?? null,
    });

    if (error) throw bookingError(error.code, error.message);

    const row = Array.isArray(data) ? data[0] : data;
    res.status(201).json({
      reservationId: row.reservation_id,
      reference: row.reference,
      pointsUsed: Number(row.points_used),
      totalFees: Number(row.total_fees),
      status: "pending",
    });
  } catch (err) {
    next(err);
  }
});

/** The caller's own reservations. RLS restricts the rows; no filtering needed here. */
bookingRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const db = supabaseForUser(req.auth!.accessToken);
    const { data, error } = await db
      .from("reservations")
      .select("id, reference, status, check_in, check_out, nights, adults, children, points_used, nights_used, total_fees, resorts(name, location)")
      .order("check_in", { ascending: false });
    if (error) throw new HttpError(500, error.message);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

bookingRouter.post("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new HttpError(400, "Invalid reservation id");

    const reason = z.string().trim().max(500).optional().parse(req.body?.reason);
    const db = supabaseForUser(req.auth!.accessToken);
    const { error } = await db.rpc("cancel_reservation", {
      _reservation_id: id.data,
      _reason: reason ?? null,
    });
    if (error) throw bookingError(error.code, error.message);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
