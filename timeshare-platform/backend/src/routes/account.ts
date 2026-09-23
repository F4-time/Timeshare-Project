import { Router } from "express";
import { z } from "zod";

import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
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
      db.from("owners").select("id, owner_code, status, resort_id").eq("user_id", userId).maybeSingle(),
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

const createOwnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
});

function ownerPassword(name: string) {
  const letters = name.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  return `${letters}123`;
}

accountRouter.post("/owners", requireAuth, requireRole("ADMIN_STAFF", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const parsed = createOwnerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const { name, email } = parsed.data;

    const password = ownerPassword(name);
    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (authError || !created.user) {
      throw new HttpError(409, authError?.message ?? "Could not create owner account");
    }

    const userId = created.user.id;
    const { error: roleError } = await supabaseAdmin.rpc("admin_set_role", {
      _user_id: userId,
      _role: "OWNER",
      _grant: true,
    });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new HttpError(409, roleError.message);
    }
    const { error: memberRoleError } = await supabaseAdmin.rpc("admin_set_role", {
      _user_id: userId,
      _role: "MEMBER",
      _grant: false,
    });
    if (memberRoleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new HttpError(409, memberRoleError.message);
    }

    const ownerCode = `FT-O-${userId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const { error: ownerError } = await supabaseAdmin.from("owners").insert({
      user_id: userId,
      owner_code: ownerCode,
      status: "active",
    });
    if (ownerError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new HttpError(409, ownerError.message);
    }

    res.status(201).json({ name, email: email.toLowerCase(), password, ownerCode });
  } catch (err) {
    next(err);
  }
});

accountRouter.get("/owners", requireAuth, requireRole("ADMIN_STAFF", "SUPER_ADMIN"), async (_req, res, next) => {
  try {
    const { data: owners, error: ownersError } = await supabaseAdmin
      .from("owners")
      .select("id, user_id, owner_code, status, owner_resorts(resort_id, resorts(id, name))")
      .order("created_at", { ascending: false });
    if (ownersError) throw new HttpError(500, ownersError.message);

    const userIds = (owners ?? []).map((owner) => owner.user_id);
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [], error: null };
    if (profilesError) throw new HttpError(500, profilesError.message);
    const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    res.json((owners ?? []).map((owner) => ({
      id: owner.id,
      ownerCode: owner.owner_code,
      status: owner.status,
      name: profilesById.get(owner.user_id)?.full_name ?? "—",
      email: profilesById.get(owner.user_id)?.email ?? "—",
      resorts: (owner.owner_resorts ?? []).map((link) => {
        const resort = Array.isArray(link.resorts) ? link.resorts[0] : link.resorts;
        return resort ? { id: resort.id, name: resort.name } : null;
      }).filter(Boolean),
    })));
  } catch (err) {
    next(err);
  }
});

accountRouter.get("/owner-overview", requireAuth, requireRole("OWNER"), async (req, res, next) => {
  try {
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("owners")
      .select("id, resort_id, owner_resorts(resort_id)")
      .eq("user_id", req.auth!.userId)
      .maybeSingle();
    if (ownerError) throw new HttpError(500, ownerError.message);
    const resortIds = [
      ...(owner?.owner_resorts ?? []).map((link) => link.resort_id),
      ...(owner?.resort_id ? [owner.resort_id] : []),
    ].filter((id, index, ids) => ids.indexOf(id) === index);
    if (resortIds.length === 0) {
      res.json({ resorts: [], totalRooms: 0, bookedRooms: 0, availableRooms: 0, roomTypes: [], bookings: [] });
      return;
    }

    const [resortRes, unitsRes, reservationsRes] = await Promise.all([
      supabaseAdmin.from("resorts").select("id, name, location, country").in("id", resortIds).order("name"),
      supabaseAdmin.from("resort_units").select("id, resort_id, unit_number, status, room_types(name)").in("resort_id", resortIds).eq("status", "active").order("unit_number"),
      supabaseAdmin.from("reservations").select("id, reference, resort_id, check_in, check_out, status").in("resort_id", resortIds).in("status", ["pending", "confirmed"]).gte("check_out", new Date().toISOString().slice(0, 10)).order("check_in"),
    ]);
    if (resortRes.error) throw new HttpError(500, resortRes.error.message);
    if (unitsRes.error) throw new HttpError(500, unitsRes.error.message);
    if (reservationsRes.error) throw new HttpError(500, reservationsRes.error.message);

    const reservations = reservationsRes.data ?? [];
    const reservationIds = reservations.map((reservation) => reservation.id);
    const itemsRes = reservationIds.length
      ? await supabaseAdmin.from("reservation_items").select("reservation_id, resort_unit_id").in("reservation_id", reservationIds).eq("is_active", true)
      : { data: [], error: null };
    if (itemsRes.error) throw new HttpError(500, itemsRes.error.message);

    const units = unitsRes.data ?? [];
    const bookedUnitIds = new Set((itemsRes.data ?? []).map((item) => item.resort_unit_id));
    const roomTypes = new Map<string, { name: string; total: number; booked: number }>();
    for (const unit of units) {
      const rawRoomType = unit.room_types;
      const roomType = Array.isArray(rawRoomType) ? rawRoomType[0] : rawRoomType;
      const current = roomTypes.get(roomType?.name ?? "Room") ?? { name: roomType?.name ?? "Room", total: 0, booked: 0 };
      current.total += 1;
      if (bookedUnitIds.has(unit.id)) current.booked += 1;
      roomTypes.set(current.name, current);
    }

    res.json({
      resorts: resortRes.data ?? [],
      totalRooms: units.length,
      bookedRooms: bookedUnitIds.size,
      availableRooms: Math.max(0, units.length - bookedUnitIds.size),
      roomTypes: [...roomTypes.values()].map((roomType) => ({ ...roomType, available: roomType.total - roomType.booked })),
      bookings: reservations,
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

const enrollSchema = z.object({ planId: z.string().uuid() });

/**
 * Self-service enrollment. Runs the admin onboarding routine with the service
 * role so it bypasses the members.write permission check — admin_onboard_member
 * only skips that check when auth.uid() is NULL, which is true for this client.
 * The caller can only ever enroll themselves: _user_id comes from their verified
 * token, never from the request body.
 */
accountRouter.post("/enroll", requireAuth, async (req, res, next) => {
  try {
    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }

    const { data, error } = await supabaseAdmin.rpc("admin_onboard_member", {
      _user_id: req.auth!.userId,
      _plan_id: parsed.data.planId,
    });
    if (error) {
      if (error.code === "P0002") throw new HttpError(404, error.message);
      throw new HttpError(409, error.message);
    }

    res.status(201).json(data?.[0] ?? data);
  } catch (err) {
    next(err);
  }
});
