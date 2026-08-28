import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin, supabaseForUser } from "../supabase.js";

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

/**
 * Records a sign-in. Written server-side so IP and user agent come from the
 * request rather than the client, and because login_sessions grants only SELECT
 * to authenticated users.
 */
accountRouter.post("/login-event", requireAuth, async (req, res, next) => {
  try {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;

    const { data, error } = await supabaseAdmin
      .from("login_sessions")
      .insert({
        user_id: req.auth!.userId,
        ip_address: ip,
        user_agent: req.headers["user-agent"]?.slice(0, 500) ?? null,
      })
      .select("id")
      .single();

    // A failed audit write must never block the user from signing in.
    if (error) {
      console.error("[login-event]", error.message);
      res.status(202).json({ recorded: false });
      return;
    }
    res.status(201).json({ recorded: true, sessionId: data.id });
  } catch (err) {
    next(err);
  }
});
