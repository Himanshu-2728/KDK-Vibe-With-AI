/**
 * Browser smoke test (build-and-test gate).
 * Requires the API on :3001 and the web dev server on :5173.
 *   npm run dev   (in another terminal)
 *   node scripts/smoke.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const API = "http://localhost:3001";
const WEB = "http://localhost:5173";

function findChrome() {
  const isWin = process.platform === "win32";
  const candidates = [
    process.env.CHROME_PATH,
    ...(isWin
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
      : []),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      fs.accessSync(p);
      return true;
    } catch {
      return false;
    }
  });
}

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

async function loginToken(email) {
  return (await api("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  })).token;
}

// A tiny real 8-bit RGBA PNG (dark asphalt-ish) so the server's pixel
// analyzer actually decodes and scores it.
function fakeAsphaltPng() {
  const w = 48;
  const h = 32;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      const crack = x % 7 === 0 ? 0 : 0; // keep it uniform-dark
      raw[o] = 58 + crack;
      raw[o + 1] = 55;
      raw[o + 2] = 50;
      raw[o + 3] = 255;
    }
  }
  // Minimal PNG: signature + IHDR + IDAT (zlib: stored blocks) + IEND.
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // zlib stream with one stored (uncompressed) deflate block.
  const deflated = Buffer.alloc(raw.length + 11);
  let p = 0;
  deflated[p++] = 0x78;
  deflated[p++] = 0x01;
  const len = raw.length;
  deflated[p++] = 0x01; // final block, stored
  deflated[p++] = len & 0xff;
  deflated[p++] = (len >> 8) & 0xff;
  deflated[p++] = (~len) & 0xff;
  deflated[p++] = ((~len) >> 8) & 0xff;
  raw.copy(deflated, p);
  p += len;
  const adler = (() => {
    let a = 1;
    let b = 0;
    for (const byte of raw) {
      a = (a + byte) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  })();
  deflated.writeUInt32BE(adler, p);
  const idat = deflated.subarray(0, p + 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  const executablePath = findChrome();
  if (!executablePath) throw new Error("Chrome not found — set CHROME_PATH");
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.setDefaultTimeout(25000);
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const realErrors = () =>
    consoleErrors.filter(
      (e) => !e.toLowerCase().includes("favicon") && !e.includes("net::"),
    );

  console.log("Fresh citizen upvote + detail flow:");
  const email = `smoke${Date.now()}@test.dev`;
  const signup = await api("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password123", displayName: "Smoke Tester" }),
  });
  await page.evaluateOnNewDocument((t) => localStorage.setItem("civicpulse_token", t), signup.token);

  await page.goto(`${WEB}/feed`, { waitUntil: "networkidle0" });
  const cardCount = await page.$$eval(".issue-card", (els) => els.length);
  check("feed shows issue cards", cardCount >= 3, `(got ${cardCount})`);
  // Desktop shell: sidebar + right rail visible at this viewport.
  check("desktop sidebar renders", !!(await page.$(".desktop-sidebar")));
  check("desktop right rail renders", !!(await page.$(".desktop-rail")));
  const dupNote = await page.$eval(".dup-note", (el) => el.textContent).catch(() => null);
  check("duplicate note visible", !!dupNote && dupNote.includes("other people reported"), `(${dupNote})`);

  const pothole = await page.$$eval(".issue-card", (cards) => {
    const c = cards.find((el) => el.textContent.includes("Deep pothole"));
    if (!c) return null;
    return { count: parseInt(c.querySelector(".count-up")?.textContent || "0", 10) };
  });
  check("pothole card visible", !!pothole);
  if (pothole) {
    await page.$$eval(".issue-card", (cards) => {
      const c = cards.find((el) => el.textContent.includes("Deep pothole"));
      c.querySelector(".upvote-btn").click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    const after = await page.$$eval(".issue-card", (cards) => {
      const c = cards.find((el) => el.textContent.includes("Deep pothole"));
      return parseInt(c.querySelector(".count-up")?.textContent || "0", 10);
    });
    check("upvote increments count", after === pothole.count + 1, `(${pothole.count} → ${after})`);
  }

  await page.goto(`${WEB}/issue/iss_oak_pothole`, { waitUntil: "networkidle0" }).catch(() => undefined);
  await page.waitForSelector("h1", { timeout: 15000 }).catch(() => undefined);
  const title = await page.$eval("h1", (el) => el.textContent).catch(() => null);
  check("detail page renders", !!title && title.includes("Deep pothole"), `(${title})`);
  check("priority breakdown rendered", !!(await page.$(".breakdown-row")));
  check("status timeline rendered", !!(await page.$(".tl-item")));
  check("comments rendered", !!(await page.$(".comment-body")));
  const evText = await page.$eval("body", (el) => el.innerText.toLowerCase().includes("evidence")).catch(() => false);
  check("AI evidence section on detail", evText);

  console.log("Report wizard → merge into the pothole:");
  await page.goto(`${WEB}/report`, { waitUntil: "networkidle0" });
  check("report photo step renders", !!(await page.$(".photo-drop")));

  // Upload a real photo file.
  const pngPath = path.join(os.tmpdir(), `smoke-${Date.now()}.png`);
  fs.writeFileSync(pngPath, fakeAsphaltPng());
  const input = await page.$('input[type="file"]');
  await input.uploadFile(pngPath);
  await new Promise((r) => setTimeout(r, 400));
  check("photo preview appears", !!(await page.$(".photo-preview img")));
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Continue"))?.click();
  });

  // Location step — open the pin-map picker and choose Great Nag Rd (pothole turf).
  await page.waitForSelector("button", { timeout: 10000 });
  await page.evaluate(() => {
    const open = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Open the map"));
    if (open) open.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  check("pin-map picker opens", !!(await page.$("svg[aria-label*='map']")) || !!(await page.$eval("body", (b) => b.innerText.includes("Where are you?"))));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Great Nag Rd"));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const locText = await page.evaluate(() => document.body.innerText.includes("Great Nag Rd, Nandanvan"));
  check("pin picked shows in location card", locText);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Continue"))?.click();
  });

  // Details — description keywords matching the pothole issue.
  await page.waitForFunction(
    () => document.body.innerText.includes("What's happening"),
    { timeout: 10000 },
  );
  await page.type("textarea", "Deep pothole on Great Nag Rd, cars are swerving around it");
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Submit report"))?.click();
  });

  // AI review step with the duplicate prompt.
  await page.waitForFunction(
    () => document.body.innerText.includes("existing report") || document.body.innerText.includes("AI analyzed"),
    { timeout: 20000 },
  );
  const aiText = await page.evaluate(() => document.body.innerText);
  check("AI review appears", aiText.includes("AI analyzed"));
  check("duplicate merge prompt appears", aiText.includes("existing report") && aiText.includes("Add your upvote instead"));
  // The duplicate prompt shows why the AI matched, incl. photo evidence.
  const aiReviewText = await page.evaluate(() => document.body.innerText.toLowerCase());
  check("AI evidence on review", aiReviewText.includes("why the match") && aiReviewText.includes("photo analyzed"), `(why-match=${aiReviewText.includes("why the match")})`);
  // Back out and take the merge path.
  await page.evaluate(() => {
    const back = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Back to AI suggestion"));
    if (back) back.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const mergeBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((el) => el.textContent.includes("Add your upvote instead"));
    if (b) { b.click(); return true; }
    return false;
  });
  check("merge prompt present for click", mergeBtn);
  if (mergeBtn) {
    await page.waitForFunction(
      () => document.body.innerText.includes("You joined the crowd"),
      { timeout: 15000 },
    );
    check("merge success state", true);
  } else {
    check("merge success state", false, "(merge prompt missing)");
  }

  console.log("Authority flow (tom):");
  const adminToken = await loginToken("rahul@city.gov");
  await page.evaluateOnNewDocument((t) => localStorage.setItem("civicpulse_token", t), adminToken);
  await page.goto(`${WEB}/admin`, { waitUntil: "networkidle0" });
  const statCards = await page.$$eval(".stat-card", (els) => els.length);
  check("admin dashboard stats render", statCards >= 5, `(got ${statCards})`);
  check("heatmap svg renders", !!(await page.$("svg[aria-label*='density']")), "(no heatmap svg)");
  // Wait until the summary data loaded and clusters have labels.
  await page.waitForFunction(
    () => {
      const svg = document.querySelector("svg[aria-label*='density']");
      if (!svg) return false;
      return [...svg.querySelectorAll("g")].some((g) => g.querySelectorAll("circle").length >= 2 && [...g.querySelectorAll("text")].some((t) => /open/.test(t.textContent)));
    },
    { timeout: 15000 },
  ).catch(() => undefined);
  // Grab the first cluster group (blob + label) and click it with a real
  // element click — puppeteer scrolls it into view and hits the current spot.
  const clusterSel = await page.evaluateHandle(() => {
    const svg = document.querySelector("svg[aria-label*='density']");
    if (!svg) return null;
    return [...svg.querySelectorAll("g")].find((el) => {
      const texts = [...el.querySelectorAll("text")].map((t) => t.textContent).join(" ");
      return /(Nandanvan|Dharampeth|Ramdaspeth|Sitabuldi|Civil Lines|Manewada|Ambazari)/.test(texts) && el.querySelectorAll("circle").length >= 2;
    }) ?? null;
  });
  const cluster = clusterSel.asElement();
  check("heatmap cluster found", !!cluster);
  if (cluster) {
    const circle = await cluster.$("circle");
    if (circle) {
      await circle.click();
    } else {
      await cluster.click();
    }
    await page.waitForFunction(
      () => location.pathname.includes("/admin/issues") && location.search.includes("area="),
      { timeout: 10000 },
    ).catch(() => undefined);
    const onQueue = await page.evaluate(() => location.pathname.includes("/admin/issues") && location.search.includes("area="));
    check("click drills into filtered queue", onQueue, `(url=${await page.evaluate(() => location.href)})`);
  } else {
    check("click drills into filtered queue", false, "(no cluster to click)");
  }

  await page.goto(`${WEB}/admin/issues`, { waitUntil: "networkidle0" });
  const rows = await page.$$eval(".admin-table tbody tr", (els) => els.length);
  check("admin issue table has rows", rows >= 3, `(got ${rows})`);
  const areaFilter = await page.evaluate(() => {
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text === "All areas"));
    if (!sel) return "no-area-select";
    const opts = [...sel.options].map((o) => o.textContent);
    return opts.join(",");
  });
  check("area filter present", areaFilter.includes("All areas") && areaFilter.split(",").length >= 3, `(${areaFilter})`);

  check("no console/page errors", realErrors().length === 0, realErrors().slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
