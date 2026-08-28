import { Router } from "express";
import { z } from "zod";

import { HttpError } from "../middleware/error.js";
import { searchAvailability } from "../services/availability.js";

export const availabilityRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const querySchema = z
  .object({
    resortId: z.string().uuid(),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.coerce.number().int().min(1).max(20).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
  })
  .refine((v) => v.checkOut > v.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  })
  .refine((v) => v.checkIn >= new Date().toISOString().slice(0, 10), {
    message: "checkIn cannot be in the past",
    path: ["checkIn"],
  });

/** Public search. Raw inventory stays hidden; only the computed result is returned. */
availabilityRouter.get("/search", async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const nights = Math.round(
      (Date.parse(`${parsed.data.checkOut}T00:00:00Z`) - Date.parse(`${parsed.data.checkIn}T00:00:00Z`)) / 86_400_000,
    );
    if (nights > 30) throw new HttpError(400, "Maximum stay is 30 nights");

    res.json(await searchAvailability(parsed.data));
  } catch (err) {
    next(err);
  }
});
