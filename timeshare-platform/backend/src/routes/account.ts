import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import { supabaseForUser } from "../supabase.js";

export const accountRouter = Router();

/** The caller's profile, roles and member/owner linkage. Read under their own RLS. */
accountRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { userId, accessToken, roles } = req.auth!;
    const db = supabaseForUser(accessToken);

    const [profile, member, owner] = await Promise.all([
      db.from("profiles").select("id, full_name, email, phone, status, locale").eq("id", userId).maybeSingle(),
      db.from("members").select("id, member_code, status").eq("user_id", userId).maybeSingle(),
      db.from("owners").select("id, owner_code, status").eq("user_id", userId).maybeSingle(),
    ]);

    res.json({
      userId,
      roles,
      profile: profile.data ?? null,
      member: member.data ?? null,
      owner: owner.data ?? null,
    });
  } catch (err) {
    next(err);
  }
});
