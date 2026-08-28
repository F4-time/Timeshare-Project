import type { NextFunction, Request, Response } from "express";

import { supabaseAdmin } from "../supabase.js";
import type { AppRole } from "../types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; accessToken: string; roles: AppRole[] };
    }
  }
}

/** Rejects the request unless it carries a valid Supabase access token. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  req.auth = {
    userId: data.user.id,
    accessToken: token,
    roles: (roleRows ?? []).map((r) => r.role as AppRole),
  };
  next();
}

/** Requires the caller to hold at least one of the given roles. */
export function requireRole(...allowed: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const roles = req.auth?.roles ?? [];
    if (!allowed.some((r) => roles.includes(r))) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}
