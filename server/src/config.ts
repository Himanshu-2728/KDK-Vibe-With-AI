import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbFile:
    process.env.DB_FILE ??
    path.join(__dirname, "..", "data", "civicpulse.db"),
  mediaDir:
    process.env.MEDIA_DIR ?? path.join(__dirname, "..", "data", "media"),
  sessionSecret: process.env.SESSION_SECRET ?? "civicpulse-dev-secret",
  maxUploadBytes: 8 * 1024 * 1024, // 8 MB
  duplicateRadiusMeters: 150,
  reportRateLimit: { max: 5, windowMs: 60 * 60 * 1000 }, // 5 reports / hour
};