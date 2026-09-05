import { createApp } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db.js";

getDb(); // ensure schema + seed before serving

const app = createApp();
app.listen(config.port, () => {
  console.log(`\n  CivicPulse API listening on http://localhost:${config.port}`);
  console.log(`  Feed:   http://localhost:${config.port}/api/feed`);
  console.log(`  Health: http://localhost:${config.port}/api/health\n`);
});