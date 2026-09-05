import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import path from "node:path";
import multer from "multer";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import feedRoutes from "./routes/feed.js";
import issueRoutes from "./routes/issues.js";
import reportRoutes from "./routes/reports.js";
import meRoutes from "./routes/me.js";
import notificationRoutes from "./routes/notifications.js";
import geoRoutes from "./routes/geo.js";
import adminRoutes from "./routes/admin.js";

export function createApp(): express.Express {
  const app = express();

  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(
    cors(
      corsOrigin
        ? { origin: corsOrigin.split(",").map((o) => o.trim()), credentials: true }
        : { origin: true, credentials: true },
    ),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/media", express.static(path.join(config.mediaDir)));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "civicpulse-api", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/feed", feedRoutes);
  app.use("/api/issues", issueRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/geo", geoRoutes);
  app.use("/api/admin", adminRoutes);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Photo is too large (max 8 MB)" });
        return;
      }
      res.status(400).json({ error: `Upload error: ${err.message}` });
      return;
    }
    console.error("[api]", err);
    res.status(500).json({ error: "Something went wrong on our side" });
  });

  return app;
}