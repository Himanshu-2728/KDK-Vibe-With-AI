import { createApp } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db.js";

getDb(); // ensure schema + seed before serving

const app = createApp();
const MAX_PORT = config.port + 10;

function tryListen(port: number): void {
  const server = app.listen(port, () => {
    console.log(`\n  CivicPulse API listening on http://localhost:${port}`);
    console.log(`  Feed:   http://localhost:${port}/api/feed`);
    console.log(`  Health: http://localhost:${port}/api/health\n`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && port < MAX_PORT) {
      console.warn(`[server] port ${port} in use, trying ${port + 1}...`);
      tryListen(port + 1);
    } else {
      throw err;
    }
  });
}

tryListen(config.port);