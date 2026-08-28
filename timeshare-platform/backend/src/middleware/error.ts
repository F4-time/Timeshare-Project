import type { NextFunction, Request, Response } from "express";

import { env } from "../env.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  console.error("[unhandled]", err);
  // Internal details are never returned to the client in production.
  res.status(500).json({
    error: env.NODE_ENV === "production" ? "Internal server error" : String(err),
  });
}
