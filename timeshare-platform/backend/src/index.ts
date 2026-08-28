import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { accountRouter } from "./routes/account.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGIN, credentials: true }));

// Razorpay webhooks need the raw body for signature verification, so JSON
// parsing is mounted per-router rather than globally once that route exists.
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: env.NODE_ENV, time: new Date().toISOString() });
});

app.use("/api/account", accountRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (origin allowed: ${env.ALLOWED_ORIGIN})`);
});
