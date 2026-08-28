import cors from "cors";
import express from "express";
import helmet from "helmet";

import { allowedOrigins, env } from "./env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { accountRouter } from "./routes/account.js";
import { availabilityRouter } from "./routes/availability.js";
import { bookingRouter } from "./routes/bookings.js";

const app = express();

app.disable("x-powered-by");

// Behind a load balancer the client IP is in X-Forwarded-For; without this the
// login audit records the proxy's address instead of the user's.
if (env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // No Origin header: same-origin, curl, or a webhook. Not a browser CORS
      // request, so there is nothing to protect against here.
      if (!origin) return callback(null, true);
      const clean = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(clean)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed`));
    },
  }),
);

// Razorpay webhooks need the raw body for signature verification, so JSON
// parsing is mounted per-router rather than globally once that route exists.
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: env.NODE_ENV, time: new Date().toISOString() });
});

app.use("/api/account", accountRouter);
app.use("/api/availability", availabilityRouter);
app.use("/api/bookings", bookingRouter);

app.use(notFound);
app.use(errorHandler);

// 0.0.0.0 so the container is reachable from outside itself.
app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`API listening on :${env.PORT} — allowed origins: ${allowedOrigins.join(", ")}`);
});
